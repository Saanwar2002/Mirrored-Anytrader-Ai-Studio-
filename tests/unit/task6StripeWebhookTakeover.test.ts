import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import http from "http";
import {
  createStripeWebhookHandler,
  claimStripeEventLease,
  markStripeEventCompleted,
  markStripeEventFailed,
  STALE_LEASE_THRESHOLD_MS,
} from "../../src/server/stripeWebhookHandler.ts";

class MockFirestore {
  public data: Map<string, Map<string, any>> = new Map();
  public FieldValue = {
    serverTimestamp: () => ({ toMillis: () => Date.now(), _serverTimestamp: true }),
  };

  collection(colName: string) {
    if (!this.data.has(colName)) {
      this.data.set(colName, new Map());
    }
    const col = this.data.get(colName)!;

    return {
      doc: (docId: string) => {
        return {
          id: docId,
          get: async () => {
            const docData = col.get(docId);
            return {
              exists: !!docData,
              data: () => (docData ? { ...docData } : undefined),
            };
          },
          set: async (val: any, opts?: { merge?: boolean }) => {
            if (opts?.merge && col.has(docId)) {
              col.set(docId, { ...col.get(docId), ...val });
            } else {
              col.set(docId, { ...val });
            }
          },
          update: async (val: any) => {
            const existing = col.get(docId) || {};
            col.set(docId, { ...existing, ...val });
          },
        };
      },
    };
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const transaction = {
      get: async (docRef: any) => {
        return docRef.get();
      },
      set: (docRef: any, val: any, opts?: any) => {
        docRef.set(val, opts);
      },
      update: (docRef: any, val: any) => {
        docRef.update(val);
      },
    };
    return updateFunction(transaction);
  }
}

describe("FIN-01: Route-Level Stripe Webhook Stale-Worker Takeover Regression Suite", () => {
  let db: MockFirestore;
  let mockStripe: any;
  let app: express.Express;
  let server: http.Server;
  let serverUrl: string;
  let processedEvents: string[] = [];

  const TEST_SECRET = "whsec_test_secret_12345";

  beforeEach(async () => {
    db = new MockFirestore();
    processedEvents = [];

    mockStripe = {
      webhooks: {
        constructEvent: vi.fn((body: any, sig: string, secret: string) => {
          if (secret !== TEST_SECRET) {
            throw new Error("Invalid webhook secret");
          }
          if (sig !== "sig_valid_test") {
            throw new Error("Invalid signature");
          }
          const parsed = typeof body === "string" ? JSON.parse(body) : JSON.parse(body.toString("utf8"));
          return parsed;
        }),
      },
    };

    app = express();
    app.post(
      "/api/webhook",
      express.raw({ type: "application/json" }),
      createStripeWebhookHandler({
        getDb: () => db,
        getStripe: () => mockStripe,
        getWebhookSecret: () => TEST_SECRET,
        processEvent: async (event) => {
          processedEvents.push(event.id);
        },
      })
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr: any = server.address();
        serverUrl = `http://127.0.0.1:${addr.port}/api/webhook`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("Scenario 1: Stale processing lease older than 5 minutes is reclaimed by an incoming webhook and processed successfully", async () => {
    const eventId = "evt_stale_takeover_001";
    const staleClaimTimeMs = Date.now() - (STALE_LEASE_THRESHOLD_MS + 60 * 1000);

    const eventRef = db.collection("processed_stripe_events").doc(eventId);
    await eventRef.set({
      status: "processing",
      claimedAt: { toMillis: () => staleClaimTimeMs },
      workerId: "worker_stale_crashed_node_99",
      leaseAcquiredAtMs: staleClaimTimeMs,
    });

    const eventPayload = {
      id: eventId,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_123", amount: 5000 } },
    };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "sig_valid_test",
      },
      body: JSON.stringify(eventPayload),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.received).toBe(true);
    expect(processedEvents).toContain(eventId);

    const docSnap = await eventRef.get();
    const docData = docSnap.data();
    expect(docData.status).toBe("completed");
    expect(docData.workerId).not.toBe("worker_stale_crashed_node_99");
    expect(docData.takeoverFromStaleWorker).toBe(true);
    expect(docData.previousWorkerId).toBe("worker_stale_crashed_node_99");
  });

  it("Scenario 2: Fresh processing lease (< 5 minutes old) is NOT stolen and returns 200 with currently processing notice", async () => {
    const eventId = "evt_active_processing_002";
    const activeClaimTimeMs = Date.now() - 60 * 1000;

    const eventRef = db.collection("processed_stripe_events").doc(eventId);
    await eventRef.set({
      status: "processing",
      claimedAt: { toMillis: () => activeClaimTimeMs },
      workerId: "worker_active_healthy_1",
      leaseAcquiredAtMs: activeClaimTimeMs,
    });

    const eventPayload = {
      id: eventId,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_test_456" } },
    };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "sig_valid_test",
      },
      body: JSON.stringify(eventPayload),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Already processed or currently processing");
    expect(processedEvents).not.toContain(eventId);

    const docSnap = await eventRef.get();
    expect(docSnap.data().workerId).toBe("worker_active_healthy_1");
    expect(docSnap.data().status).toBe("processing");
  });

  it("Scenario 3: Subsequent duplicate delivery on completed event is handled safely without re-processing", async () => {
    const eventId = "evt_completed_dedup_003";

    const eventRef = db.collection("processed_stripe_events").doc(eventId);
    await eventRef.set({
      status: "completed",
      completedAt: new Date().toISOString(),
      workerId: "worker_prior_1",
    });

    const eventPayload = {
      id: eventId,
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_789" } },
    };

    const response = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "sig_valid_test",
      },
      body: JSON.stringify(eventPayload),
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("Already processed or currently processing");
    expect(processedEvents).toHaveLength(0);
  });

  it("Scenario 4: Rejects forged or missing signature headers with HTTP 400 before touching database", async () => {
    const responseNoSig = await fetch(serverUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "evt_unsigned" }),
    });
    expect(responseNoSig.status).toBe(400);

    const responseInvalidSig = await fetch(serverUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "sig_forged_signature",
      },
      body: JSON.stringify({ id: "evt_invalid_sig" }),
    });
    expect(responseInvalidSig.status).toBe(400);
  });

  it("Scenario 5: Failure path preserves worker state and prevents zombie worker from corrupting successor state", async () => {
    const eventId = "evt_fenced_takeover_005";
    const zombieWorkerId = "worker_zombie_slow";
    const successorWorkerId = "worker_successor_fast";

    await claimStripeEventLease(db, eventId, { workerId: zombieWorkerId });

    const staleTime = Date.now() - (STALE_LEASE_THRESHOLD_MS + 1000);
    const eventRef = db.collection("processed_stripe_events").doc(eventId);
    await eventRef.update({
      claimedAt: { toMillis: () => staleTime },
    });

    const successorClaim = await claimStripeEventLease(db, eventId, { workerId: successorWorkerId });
    expect(successorClaim.claimed).toBe(true);
    expect(successorClaim.reason).toBe("stale_takeover");

    const successorDone = await markStripeEventCompleted(db, eventId, successorWorkerId);
    expect(successorDone.success).toBe(true);

    const zombieAttempt = await markStripeEventCompleted(db, eventId, zombieWorkerId);
    expect(zombieAttempt.success).toBe(false);
    expect(zombieAttempt.staleRejected).toBe(true);

    const finalDoc = await eventRef.get();
    expect(finalDoc.data().workerId).toBe(successorWorkerId);
    expect(finalDoc.data().status).toBe("completed");
  });
});
