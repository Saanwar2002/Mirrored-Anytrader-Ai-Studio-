import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  listAuthoritativeNotifications,
  markAuthoritativeNotificationRead,
  deleteAuthoritativeNotification,
  registerAuthoritativePushToken,
  sendAuthoritativeChatPush,
} from "../../src/server/notificationEngine.ts";
import {
  authorizeNotificationRequest,
  validateNotificationPayload,
} from "../../src/server/authorization.ts";
import {
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  NotFoundError,
} from "../../src/server/httpErrors.ts";

// In-Memory Test Database
function createMockNotificationDb() {
  const store: Record<string, any> = {
    "users/user_alice": {
      uid: "user_alice",
      name: "Alice Passenger",
      role: "consumer",
      fcmToken: "fcm_token_alice_123",
    },
    "users/user_bob": {
      uid: "user_bob",
      name: "Bob Driver",
      role: "driver",
      isDriver: true,
      fcmToken: "fcm_token_bob_456",
    },
    "users/user_charlie": {
      uid: "user_charlie",
      name: "Charlie Trader",
      role: "tradesperson",
      fcmToken: "fcm_token_charlie_789",
    },
    "users/attacker_eve": {
      uid: "attacker_eve",
      name: "Eve Attacker",
      role: "consumer",
      fcmToken: "fcm_token_eve_000",
    },
    "users/admin_super": {
      uid: "admin_super",
      name: "Super Admin",
      role: "admin",
      isAdmin: true,
    },
    "notifications/notif_alice_1": {
      id: "notif_alice_1",
      userId: "user_alice",
      recipientId: "user_alice",
      senderId: "system",
      title: "Welcome Alice",
      message: "Your account is active.",
      type: "system",
      read: false,
      isRead: false,
    },
    "notifications/notif_bob_1": {
      id: "notif_bob_1",
      userId: "user_bob",
      recipientId: "user_bob",
      senderId: "system",
      title: "Trip Offer Available",
      message: "New ride nearby.",
      type: "system",
      read: false,
      isRead: false,
    },
    "notifications/notif_charlie_1": {
      id: "notif_charlie_1",
      userId: "user_charlie",
      recipientId: "user_charlie",
      senderId: "system",
      title: "New Job Lead",
      message: "Plumbing repair requested.",
      type: "job_lead",
      read: false,
      isRead: false,
    },
    "ride_requests/ride_100": {
      id: "ride_100",
      passengerId: "user_alice",
      driverId: "user_bob",
      assignedDriverId: "user_bob",
      status: "in_transit",
    },
    "ride_requests/ride_200": {
      id: "ride_200",
      passengerId: "user_alice",
      driverId: "user_charlie",
      assignedDriverId: "user_charlie",
      status: "in_transit",
    },
    "ride_requests/ride_conflicting": {
      id: "ride_conflicting",
      passengerId: "user_alice",
      driverId: "user_bob",
      assignedDriverId: "user_charlie", // Conflicting!
      status: "in_transit",
    },
    "jobs/job_500": {
      id: "job_500",
      homeownerId: "user_alice",
      acceptedTradespersonId: "user_charlie",
      status: "in_progress",
    },
    "conversations/conv_300": {
      id: "conv_300",
      participants: ["user_alice", "user_bob"],
    },
  };

  return {
    _store: store,
    collection(colName: string) {
      return {
        doc(docId: string) {
          const path = `${colName}/${docId}`;
          return {
            id: docId,
            path,
            async get() {
              const data = store[path];
              return {
                id: docId,
                exists: data !== undefined && data !== null,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              };
            },
            async set(data: any, options?: any) {
              if (options?.merge && store[path]) {
                store[path] = { ...store[path], ...JSON.parse(JSON.stringify(data)) };
              } else {
                store[path] = { id: docId, ...JSON.parse(JSON.stringify(data)) };
              }
            },
            async update(data: any) {
              if (!store[path]) throw new Error("Document not found");
              store[path] = { ...store[path], ...JSON.parse(JSON.stringify(data)) };
            },
            async delete() {
              delete store[path];
            },
            collection(subColName: string) {
              return {
                where() {
                  return {
                    limit() {
                      return {
                        get: async () => ({ empty: true, docs: [] }),
                      };
                    },
                  };
                },
              };
            },
          };
        },
        where(field: string, op: string, val: any) {
          let currentDocs = Object.entries(store)
            .filter(([k]) => k.startsWith(`${colName}/`))
            .map(([_, v]) => v)
            .filter((doc: any) => {
              if (op === "==") return doc[field] === val;
              return true;
            });

          return {
            where(f2: string, op2: string, v2: any) {
              currentDocs = currentDocs.filter((doc: any) => {
                if (op2 === "==") return doc[f2] === v2;
                return true;
              });
              return this;
            },
            limit(max: number) {
              return {
                get: async () => ({
                  docs: currentDocs.slice(0, max).map((d: any) => ({
                    id: d.id,
                    data: () => JSON.parse(JSON.stringify(d)),
                  })),
                }),
              };
            },
            get: async () => ({
              docs: currentDocs.map((d: any) => ({
                id: d.id,
                data: () => JSON.parse(JSON.stringify(d)),
              })),
            }),
          };
        },
        async add(data: any) {
          const newId = `notif_gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const path = `${colName}/${newId}`;
          store[path] = { id: newId, ...JSON.parse(JSON.stringify(data)) };
          return { id: newId, path };
        },
      };
    },
  };
}

describe("Task 35-D: Notification Authorization & Recipient Integrity", () => {
  let mockDb: ReturnType<typeof createMockNotificationDb>;
  let mockMessaging: any;
  let sentPushPayloads: any[];

  beforeEach(() => {
    mockDb = createMockNotificationDb();
    sentPushPayloads = [];
    mockMessaging = {
      send: vi.fn(async (payload: any) => {
        sentPushPayloads.push(payload);
        return "msg_id_12345";
      }),
    };
  });

  it("Test A — Legitimate notification read: Authenticated User A reads own notifications", async () => {
    const notifications = await listAuthoritativeNotifications(
      mockDb,
      { uid: "user_alice" }
    );

    expect(notifications.length).toBe(1);
    expect(notifications[0].id).toBe("notif_alice_1");
    expect(notifications[0].userId).toBe("user_alice");
    expect(notifications[0].title).toBe("Welcome Alice");
  });

  it("Test B — Cross-user notification read denied: User A attempts to read User B's notifications", async () => {
    await expect(
      listAuthoritativeNotifications(
        mockDb,
        { uid: "user_alice" },
        { targetUserId: "user_bob" }
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("Test C — Forged recipient rejected: User A attempts to notify User B without relationship", async () => {
    const isAuthorized = await authorizeNotificationRequest(
      mockDb,
      "user_alice",
      { uid: "user_alice" },
      {
        recipientId: "attacker_eve",
        type: "general",
        link: "/profile",
      }
    );

    expect(isAuthorized).toBe(false);
  });

  it("Test D — Cross-user notification mutation denied: User A attempts to mark User B's notification read/unread or delete it", async () => {
    // Attempt mark read on User B's notification
    await expect(
      markAuthoritativeNotificationRead(
        mockDb,
        { uid: "user_alice" },
        "notif_bob_1",
        true
      )
    ).rejects.toThrow(ForbiddenError);

    // Attempt delete on User B's notification
    await expect(
      deleteAuthoritativeNotification(
        mockDb,
        { uid: "user_alice" },
        "notif_bob_1"
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("Test E — Forged notification owner denied: Client supplying forged ownerId for User B's notification is denied", async () => {
    // Attacker eve attempts to mark read on alice's notification
    await expect(
      markAuthoritativeNotificationRead(
        mockDb,
        { uid: "attacker_eve" },
        "notif_alice_1",
        true
      )
    ).rejects.toThrow(ForbiddenError);

    // Ensure Alice's notification remains unread in store
    expect(mockDb._store["notifications/notif_alice_1"].read).toBe(false);
  });

  it("Test F — Push token cross-user registration denied: User A attempts to register token for User B", async () => {
    await expect(
      registerAuthoritativePushToken(
        mockDb,
        { uid: "user_alice" },
        {
          userId: "user_bob", // Forged target
          fcmToken: "malicious_token_takeover",
        }
      )
    ).rejects.toThrow(ForbiddenError);

    // Ensure Bob's token was not overwritten
    expect(mockDb._store["users/user_bob"].fcmToken).toBe("fcm_token_bob_456");
  });

  it("Test F-R1 — Admin Cross-User Push Token Registration Denied: Admin cannot register/overwrite User B's token", async () => {
    // Setup: Admin A attempts to register a token targeting normal User B
    await expect(
      registerAuthoritativePushToken(
        mockDb,
        { uid: "admin_super", isAdmin: true },
        {
          userId: "user_bob",
          token: "admin_injected_token_for_bob",
        }
      )
    ).rejects.toThrow(ForbiddenError);

    // Assert User B's existing push token remains completely unchanged
    expect(mockDb._store["users/user_bob"].fcmToken).toBe("fcm_token_bob_456");

    // Also test with ownerId and targetUserId fields
    await expect(
      registerAuthoritativePushToken(
        mockDb,
        { uid: "admin_super", isAdmin: true },
        {
          ownerId: "user_bob",
          fcmToken: "admin_injected_token_for_bob_2",
        }
      )
    ).rejects.toThrow(ForbiddenError);

    expect(mockDb._store["users/user_bob"].fcmToken).toBe("fcm_token_bob_456");

    // Verify same-user explicit identity passes for both normal user and admin:
    // Normal user with matching explicit userId
    const normalSameUser = await registerAuthoritativePushToken(
      mockDb,
      { uid: "user_alice" },
      {
        userId: "user_alice",
        fcmToken: "updated_alice_token_111",
      }
    );
    expect(normalSameUser.success).toBe(true);
    expect(normalSameUser.userId).toBe("user_alice");
    expect(mockDb._store["users/user_alice"].fcmToken).toBe("updated_alice_token_111");

    // Admin user with matching explicit userId registers own admin token
    const adminSameUser = await registerAuthoritativePushToken(
      mockDb,
      { uid: "admin_super", isAdmin: true },
      {
        userId: "admin_super",
        fcmToken: "admin_own_token_999",
      }
    );
    expect(adminSameUser.success).toBe(true);
    expect(adminSameUser.userId).toBe("admin_super");
    expect(mockDb._store["users/admin_super"].fcmToken).toBe("admin_own_token_999");
  });

  it("Test G — Privilege-field spoof denied: Attacker supplying role='admin' in payload cannot bypass authorization", async () => {
    // Non-admin caller attempting to list bob's notifications with spoofed role in payload
    await expect(
      listAuthoritativeNotifications(
        mockDb,
        { uid: "attacker_eve", role: "admin" } as any, // Not real admin claim
        { targetUserId: "user_bob" }
      )
    ).rejects.toThrow(ForbiddenError);

    // Legitimate admin can view target user's notifications
    const adminView = await listAuthoritativeNotifications(
      mockDb,
      { uid: "admin_super", isAdmin: true },
      { targetUserId: "user_bob" }
    );
    expect(adminView.length).toBe(1);
    expect(adminView[0].userId).toBe("user_bob");
  });

  it("Test H — Authoritative trip recipient cannot be redirected: Conflicting client recipient is rejected", async () => {
    // On ride_100 (Alice is passenger, Bob is driver):
    // Alice attempting to send push to Charlie (not driver on ride_100)
    await expect(
      sendAuthoritativeChatPush(
        mockDb,
        mockMessaging,
        { uid: "user_alice" },
        {
          recipientId: "user_charlie", // Conflicting!
          rideId: "ride_100",
          title: "Where are you?",
          body: "I am waiting at the pickup point.",
        }
      )
    ).rejects.toThrow(ForbiddenError);

    expect(sentPushPayloads.length).toBe(0);

    // Legitimate push to authoritative driver Bob succeeds
    const pushResult = await sendAuthoritativeChatPush(
      mockDb,
      mockMessaging,
      { uid: "user_alice" },
      {
        recipientId: "user_bob", // Authoritative driver
        rideId: "ride_100",
        title: "Where are you?",
        body: "I am waiting at the pickup point.",
      }
    );

    expect(pushResult.success).toBe(true);
    expect(pushResult.recipientId).toBe("user_bob");
    expect(sentPushPayloads.length).toBe(1);
    expect(sentPushPayloads[0].token).toBe("fcm_token_bob_456");
  });

  it("Test I — Cross-resource recipient injection denied: Using a valid driver ID from another trip is rejected", async () => {
    // On ride_100, assigned driver is user_bob. user_charlie is assigned driver on ride_200.
    // Alice attempting to notify user_charlie on ride_100 is rejected.
    const isAuthorized = await authorizeNotificationRequest(
      mockDb,
      "user_alice",
      { uid: "user_alice" },
      {
        recipientId: "user_charlie",
        type: "message",
        rideId: "ride_100",
      }
    );

    expect(isAuthorized).toBe(false);

    // Ride with conflicting internal driver fields fails closed
    const isConflictingAuthorized = await authorizeNotificationRequest(
      mockDb,
      "user_alice",
      { uid: "user_alice" },
      {
        recipientId: "user_bob",
        type: "message",
        rideId: "ride_conflicting",
      }
    );

    expect(isConflictingAuthorized).toBe(false);
  });

  it("Test J — Existing notification functionality preserved: Legitimate CRUD and token registration work seamlessly", async () => {
    // 1. Legitimate mark read
    const markResult = await markAuthoritativeNotificationRead(
      mockDb,
      { uid: "user_alice" },
      "notif_alice_1",
      true
    );
    expect(markResult.success).toBe(true);
    expect(markResult.read).toBe(true);
    expect(mockDb._store["notifications/notif_alice_1"].read).toBe(true);

    // 2. Legitimate push token registration for own user
    const tokenResult = await registerAuthoritativePushToken(
      mockDb,
      { uid: "user_alice" },
      { fcmToken: "new_alice_fcm_token_999" }
    );
    expect(tokenResult.success).toBe(true);
    expect(mockDb._store["users/user_alice"].fcmToken).toBe("new_alice_fcm_token_999");

    // 3. Legitimate deletion of own notification
    const deleteResult = await deleteAuthoritativeNotification(
      mockDb,
      { uid: "user_alice" },
      "notif_alice_1"
    );
    expect(deleteResult.success).toBe(true);
    expect(mockDb._store["notifications/notif_alice_1"]).toBeUndefined();

    // 4. Legitimate job notification between homeowner Alice and accepted trader Charlie
    const isJobNotifAuthorized = await authorizeNotificationRequest(
      mockDb,
      "user_alice",
      { uid: "user_alice" },
      {
        recipientId: "user_charlie",
        type: "status",
        jobId: "job_500",
      }
    );
    expect(isJobNotifAuthorized).toBe(true);

    // 5. Legitimate conversation notification between participants Alice and Bob
    const isConvNotifAuthorized = await authorizeNotificationRequest(
      mockDb,
      "user_bob",
      { uid: "user_bob" },
      {
        recipientId: "user_alice",
        type: "message",
        conversationId: "conv_300",
      }
    );
    expect(isConvNotifAuthorized).toBe(true);
  });
});
