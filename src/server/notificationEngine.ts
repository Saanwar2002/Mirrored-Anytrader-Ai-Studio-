/**
 * AnyTrader V8.3 Task 35-D — Notification Authorization & Recipient Integrity Engine
 *
 * Enforces server-authoritative notification creation, listing, mutation (read/unread/delete),
 * and push token registration.
 *
 * Invariants:
 * 1. Authenticated caller identity is derived strictly from server auth context (req.user).
 * 2. Reading notifications is strictly restricted to caller's own notifications unless admin.
 * 3. Mutating/deleting notifications is strictly restricted to document owner unless admin.
 * 4. Creating/sending notifications requires an authoritative database relationship (Job, Ride, Conversation, Project)
 *    or self-notification, verified by authorizeNotificationRequest.
 * 5. Push token registration is strictly locked to caller's own user record.
 * 6. Client privilege fields (role, isAdmin, isDriver) in request bodies are completely ignored.
 */

import { UnauthorizedError, ForbiddenError, BadRequestError, NotFoundError } from "./httpErrors.ts";
import { authorizeNotificationRequest, isUserAdminClaim, AuthenticatedUser } from "./authorization.ts";

export interface ListNotificationsOptions {
  targetUserId?: string;
  limit?: number;
  unreadOnly?: boolean;
}

export interface RegisterPushTokenInput {
  token?: string;
  fcmToken?: string;
  pushToken?: string;
  userId?: string;
  uid?: string;
  ownerId?: string;
  targetUserId?: string;
}

export interface SendChatPushInput {
  recipientId: string;
  title?: string;
  body?: string;
  message?: string;
  rideId?: string;
  conversationId?: string;
  jobId?: string;
  type?: string;
  channelId?: string;
}

/**
 * Server-authoritative listing of notifications for authenticated user.
 */
export async function listAuthoritativeNotifications(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  options: ListNotificationsOptions = {}
): Promise<any[]> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to list notifications.");
  }

  if (!db) {
    throw new BadRequestError("Database unavailable.");
  }

  const callerUid = caller.uid;
  const isCallerAdmin = isUserAdminClaim(caller);

  // If a targetUserId is requested, verify admin authorization
  let effectiveUserId = callerUid;
  if (options.targetUserId && typeof options.targetUserId === "string" && options.targetUserId.trim().length > 0) {
    const requestedTarget = options.targetUserId.trim();
    if (requestedTarget !== callerUid) {
      if (!isCallerAdmin) {
        throw new ForbiddenError("You do not have authorization to view notifications for another user.");
      }
      effectiveUserId = requestedTarget;
    }
  }

  const queryLimit = Math.min(Math.max(1, Number(options.limit) || 50), 100);

  try {
    let queryRef = db.collection("notifications").where("userId", "==", effectiveUserId);

    if (options.unreadOnly === true) {
      queryRef = queryRef.where("read", "==", false);
    }

    const snapshot = await queryRef.limit(queryLimit).get();
    const now = new Date();

    const notifications: any[] = [];
    if (snapshot && snapshot.docs) {
      for (const doc of snapshot.docs) {
        const data = typeof doc.data === "function" ? doc.data() : doc.data;
        if (!data) continue;

        // Visibility date check (delayed notifications / fuzzing) unless admin
        if (!isCallerAdmin && data.visibleAt) {
          const visibleDate = data.visibleAt.toDate ? data.visibleAt.toDate() : new Date(data.visibleAt);
          if (visibleDate > now) {
            continue; // Skip future-scheduled notification
          }
        }

        notifications.push({
          id: doc.id,
          ...data,
        });
      }
    }

    return notifications;
  } catch (err: any) {
    console.error("[NotificationEngine] Error listing notifications:", err?.message);
    throw new BadRequestError("Failed to retrieve notifications.");
  }
}

/**
 * Server-authoritative mark-read or mark-unread for a notification.
 */
export async function markAuthoritativeNotificationRead(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  notificationId: string,
  readState: boolean = true
): Promise<{ success: boolean; id: string; read: boolean }> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to update notification status.");
  }

  if (!notificationId || typeof notificationId !== "string" || !notificationId.trim()) {
    throw new BadRequestError("Notification ID is required.");
  }

  if (!db) {
    throw new BadRequestError("Database unavailable.");
  }

  const callerUid = caller.uid;
  const isCallerAdmin = isUserAdminClaim(caller);

  const notifDocRef = db.collection("notifications").doc(notificationId.trim());
  const notifSnap = await notifDocRef.get();
  const exists = notifSnap && (typeof notifSnap.exists === "function" ? notifSnap.exists() : notifSnap.exists);

  if (!exists) {
    throw new NotFoundError("Notification not found.");
  }

  const data = typeof notifSnap.data === "function" ? notifSnap.data() : notifSnap.data;
  const ownerId = data?.userId || data?.recipientId || data?.traderId;

  if (ownerId !== callerUid && !isCallerAdmin) {
    throw new ForbiddenError("You do not have authorization to modify this notification.");
  }

  const updatePayload: Record<string, any> = {
    read: readState,
    isRead: readState,
    updatedAt: new Date().toISOString(),
  };

  if (readState) {
    updatePayload.readAt = new Date().toISOString();
  }

  await notifDocRef.update(updatePayload);

  return {
    success: true,
    id: notificationId.trim(),
    read: readState,
  };
}

/**
 * Server-authoritative deletion of a notification.
 */
export async function deleteAuthoritativeNotification(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  notificationId: string
): Promise<{ success: boolean; id: string }> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to delete notification.");
  }

  if (!notificationId || typeof notificationId !== "string" || !notificationId.trim()) {
    throw new BadRequestError("Notification ID is required.");
  }

  if (!db) {
    throw new BadRequestError("Database unavailable.");
  }

  const callerUid = caller.uid;
  const isCallerAdmin = isUserAdminClaim(caller);

  const notifDocRef = db.collection("notifications").doc(notificationId.trim());
  const notifSnap = await notifDocRef.get();
  const exists = notifSnap && (typeof notifSnap.exists === "function" ? notifSnap.exists() : notifSnap.exists);

  if (!exists) {
    throw new NotFoundError("Notification not found.");
  }

  const data = typeof notifSnap.data === "function" ? notifSnap.data() : notifSnap.data;
  const ownerId = data?.userId || data?.recipientId;

  if (ownerId !== callerUid && !isCallerAdmin) {
    throw new ForbiddenError("You do not have authorization to delete this notification.");
  }

  await notifDocRef.delete();

  return {
    success: true,
    id: notificationId.trim(),
  };
}

/**
 * Server-authoritative push token registration strictly locked to caller identity.
 * Invariant: Token owner is ALWAYS authenticated caller UID (even for admin callers).
 */
export async function registerAuthoritativePushToken(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  payload: RegisterPushTokenInput
): Promise<{ success: boolean; userId: string }> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to register push token.");
  }

  if (!db) {
    throw new BadRequestError("Database unavailable.");
  }

  const callerUid = caller.uid;

  // Client-supplied userId, uid, ownerId, or targetUserId MUST NOT permit registering tokens for another user (even if caller is admin)
  const clientSuppliedUserId = payload.userId || payload.uid || payload.ownerId || payload.targetUserId;
  if (
    clientSuppliedUserId &&
    typeof clientSuppliedUserId === "string" &&
    clientSuppliedUserId.trim().length > 0 &&
    clientSuppliedUserId.trim() !== callerUid
  ) {
    throw new ForbiddenError("Cannot register push token for another user.");
  }

  const rawToken = payload.fcmToken || payload.token || payload.pushToken;
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    throw new BadRequestError("Push token is required.");
  }

  const token = rawToken.trim();
  if (token.length > 500) {
    throw new BadRequestError("Push token exceeds maximum permitted length.");
  }

  const effectiveUserId = callerUid;
  const userDocRef = db.collection("users").doc(effectiveUserId);

  await userDocRef.set(
    {
      fcmToken: token,
      pushToken: token,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    success: true,
    userId: effectiveUserId,
  };
}

/**
 * Server-authoritative chat push notification dispatch with strict recipient authorization.
 */
export async function sendAuthoritativeChatPush(
  db: any,
  messagingClient: any,
  caller: AuthenticatedUser | null | undefined,
  payload: SendChatPushInput
): Promise<{ success: boolean; recipientId: string; messageId?: string }> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to dispatch push notification.");
  }

  if (!db) {
    throw new BadRequestError("Database unavailable.");
  }

  const callerUid = caller.uid;
  const { recipientId, title, body, message, rideId, conversationId, jobId, type, channelId } = payload;

  if (!recipientId || typeof recipientId !== "string" || !recipientId.trim()) {
    throw new BadRequestError("Recipient ID is required.");
  }

  const sanitizedRecipientId = recipientId.trim();

  // Authorize caller to notify this recipient
  const isAuthorized = await authorizeNotificationRequest(
    db,
    callerUid,
    caller,
    {
      recipientId: sanitizedRecipientId,
      type: type || "message",
      rideId,
      conversationId,
      jobId,
    }
  );

  if (!isAuthorized) {
    throw new ForbiddenError("You do not have authorization to send push notifications to this recipient.");
  }

  // Load recipient user record
  const userDoc = await db.collection("users").doc(sanitizedRecipientId).get();
  const exists = userDoc && (typeof userDoc.exists === "function" ? userDoc.exists() : userDoc.exists);
  if (!exists) {
    throw new NotFoundError("Recipient user not found.");
  }

  const userData = typeof userDoc.data === "function" ? userDoc.data() : userDoc.data;
  const fcmToken = userData?.fcmToken || userData?.pushToken;

  if (!fcmToken) {
    throw new BadRequestError("Recipient user has no registered push token.");
  }

  const notificationTitle = title || "New Message";
  const notificationBody = body || message || "You have a new message";

  let messageId: string | undefined;

  if (messagingClient && typeof messagingClient.send === "function") {
    try {
      const response = await messagingClient.send({
        token: fcmToken,
        notification: {
          title: notificationTitle,
          body: notificationBody,
        },
        data: {
          rideId: rideId || "",
          conversationId: conversationId || "",
          jobId: jobId || "",
          type: type || "chat_message",
        },
        android: {
          priority: "high",
          notification: {
            sound: "default",
            channelId: channelId || "chat_messages",
          },
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              contentAvailable: true,
            },
          },
        },
      });
      messageId = typeof response === "string" ? response : response?.messageId;
    } catch (pushErr: any) {
      console.warn("[NotificationEngine] FCM dispatch error:", pushErr?.message);
    }
  }

  return {
    success: true,
    recipientId: sanitizedRecipientId,
    messageId,
  };
}
