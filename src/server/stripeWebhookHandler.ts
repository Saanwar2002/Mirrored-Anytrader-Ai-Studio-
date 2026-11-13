import type { Request, Response, RequestHandler } from "express";
import type Stripe from "stripe";
import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";

export const STALE_LEASE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface StripeWebhookDependencies {
  getDb: () => any;
  getStripe: () => Stripe;
  getWebhookSecret: () => string | undefined;
  processEvent?: (event: Stripe.Event, db: any) => Promise<void>;
  maxLeaseAgeMs?: number;
}

export interface ClaimLeaseResult {
  claimed: boolean;
  reason?: "already_completed" | "currently_processing" | "stale_takeover" | "new_claim";
  workerId?: string;
  claimToken?: string;
}

/**
 * Atomically attempts to claim the event lease in Firestore.
 * Handles stale worker takeover if an event is stuck in 'processing' for > 5 minutes.
 */
export async function claimStripeEventLease(
  db: any,
  eventId: string,
  options?: { maxLeaseAgeMs?: number; workerId?: string; claimToken?: string }
): Promise<ClaimLeaseResult> {
  const maxAge = options?.maxLeaseAgeMs ?? STALE_LEASE_THRESHOLD_MS;
  const assignedWorkerId = options?.workerId || `worker_${Math.random().toString(36).substring(7)}`;
  const assignedClaimToken = options?.claimToken || crypto.randomUUID();
  const eventRef = db.collection("processed_stripe_events").doc(eventId);

  return db.runTransaction(async (t: any) => {
    const existing = await t.get(eventRef);
    if (existing.exists) {
      const data = existing.data();
      if (data?.status === "completed") {
        return { claimed: false, reason: "already_completed" };
      }
      if (data?.status === "processing") {
        let ageMs = 0;
        if (data.claimedAt?.toMillis && typeof data.claimedAt.toMillis === "function") {
          ageMs = Date.now() - data.claimedAt.toMillis();
        } else if (typeof data.claimedAt === "number") {
          ageMs = Date.now() - data.claimedAt;
        } else if (typeof data.claimedAt === "string") {
          ageMs = Date.now() - new Date(data.claimedAt).getTime();
        } else {
          ageMs = 0;
        }

        if (ageMs < maxAge) {
          return { claimed: false, reason: "currently_processing", workerId: data.workerId };
        }
      }
    }

    const isTakeover = existing.exists && existing.data()?.status === "processing";
    const serverTimestamp = db.FieldValue?.serverTimestamp
      ? db.FieldValue.serverTimestamp()
      : FieldValue.serverTimestamp();

    t.set(
      eventRef,
      {
        status: "processing",
        claimedAt: serverTimestamp,
        workerId: assignedWorkerId,
        claimToken: assignedClaimToken,
        leaseAcquiredAtMs: Date.now(),
        ...(isTakeover ? { takeoverFromStaleWorker: true, previousWorkerId: existing.data()?.workerId } : {}),
      },
      { merge: true }
    );

    return {
      claimed: true,
      reason: isTakeover ? "stale_takeover" : "new_claim",
      workerId: assignedWorkerId,
      claimToken: assignedClaimToken,
    };
  });
}

/**
 * Marks the stripe event document as completed.
 * Verifies that the completing worker owns the current lease if workerId or claimToken is supplied.
 */
export async function markStripeEventCompleted(
  db: any,
  eventId: string,
  workerId?: string,
  claimToken?: string
): Promise<{ success: boolean; staleRejected?: boolean }> {
  const eventRef = db.collection("processed_stripe_events").doc(eventId);
  return db.runTransaction(async (t: any) => {
    const doc = await t.get(eventRef);
    if (!doc.exists) return { success: false };
    const data = doc.data();

    if (
      (workerId && data?.workerId && data.workerId !== workerId) ||
      (claimToken && data?.claimToken !== claimToken)
    ) {
      console.warn(
        `[Stripe Webhook Fence] Stale worker ${workerId || "unknown"} attempted to complete event ${eventId}, but active worker is ${data?.workerId}. Rejecting update.`
      );
      return { success: false, staleRejected: true };
    }

    const patch: Record<string, any> = {
      status: "completed",
      completedAt: db.FieldValue?.serverTimestamp ? db.FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    };
    if (typeof db.FieldValue?.delete === "function") {
      patch.claimToken = db.FieldValue.delete();
    } else if (!db.FieldValue) {
      patch.claimToken = FieldValue.delete();
    }

    t.update(eventRef, patch);
    return { success: true };
  });
}

/**
 * Marks the stripe event document as failed.
 */
export async function markStripeEventFailed(
  db: any,
  eventId: string,
  error: string,
  workerId?: string,
  claimToken?: string
): Promise<{ success: boolean; staleRejected?: boolean }> {
  const eventRef = db.collection("processed_stripe_events").doc(eventId);
  return db.runTransaction(async (t: any) => {
    const doc = await t.get(eventRef);
    if (doc.exists) {
      const data = doc.data();
      if (
        (workerId && data?.workerId && data.workerId !== workerId) ||
        (claimToken && data?.claimToken !== claimToken)
      ) {
        return { success: false, staleRejected: true };
      }
    }

    const patch: Record<string, any> = {
      status: "failed",
      error,
      failedAt: db.FieldValue?.serverTimestamp ? db.FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    };
    if (typeof db.FieldValue?.delete === "function") {
      patch.claimToken = db.FieldValue.delete();
    } else if (!db.FieldValue) {
      patch.claimToken = FieldValue.delete();
    }

    t.set(eventRef, patch, { merge: true });
    return { success: true };
  });
}

/**
 * Creates the production-grade route-level Express handler for /api/webhook.
 */
export function createStripeWebhookHandler(deps: StripeWebhookDependencies): RequestHandler {
  return async (req: Request, res: Response) => {
    let event: Stripe.Event | undefined;
    let assignedWorkerId: string | undefined;
    const db = deps.getDb();

    try {
      let stripeClient: Stripe;
      try {
        stripeClient = deps.getStripe();
      } catch (e) {
        console.warn("Stripe webhook received but Stripe is not configured.");
        return res.status(200).send("Ignored");
      }

      const sig = req.headers["stripe-signature"] as string | undefined;
      const webhookSecret = deps.getWebhookSecret();

      if (!webhookSecret || !sig) {
        console.error("Stripe Webhook rejected: missing STRIPE_WEBHOOK_SECRET or stripe-signature header");
        return res.status(400).send("Webhook Error: Missing signature or webhook secret");
      }

      try {
        event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      if (!db) {
        return res.json({ received: true });
      }

      let claimResult: ClaimLeaseResult;
      try {
        assignedWorkerId = `worker_${Math.random().toString(36).substring(7)}`;
        claimResult = await claimStripeEventLease(db, event.id, {
          maxLeaseAgeMs: deps.maxLeaseAgeMs ?? STALE_LEASE_THRESHOLD_MS,
          workerId: assignedWorkerId,
        });

        if (!claimResult.claimed) {
          return res.status(200).send("Already processed or currently processing");
        }
      } catch (txErr) {
        console.error("Webhook idempotency transaction error:", txErr);
        return res.status(500).send("Internal Error");
      }

      if (deps.processEvent) {
        await deps.processEvent(event, db);
      }

      await markStripeEventCompleted(db, event.id, assignedWorkerId);
      return res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("Webhook processing error:", err.message);
      if (db) {
        let rawEventId = event?.id;
        if (!rawEventId && req.body && Buffer.isBuffer(req.body)) {
          try {
            const parsed = JSON.parse(req.body.toString("utf8"));
            rawEventId = parsed.id;
          } catch (_) {}
        }
        if (rawEventId) {
          await markStripeEventFailed(db, rawEventId, err.message, assignedWorkerId).catch((e) =>
            console.error("Could not update failed status", e)
          );
        }
      }
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  };
}
