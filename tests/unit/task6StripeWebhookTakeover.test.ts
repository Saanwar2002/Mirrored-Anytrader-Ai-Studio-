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

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const DELETE_FIELD_SENTINEL = Symbol("DELETE_FIELD");

class TransactionalMockFirestore {
  public collections: Map<string, Map<string, Record<string, any>>> = new Map();
  private txChain: Promise<void> = Promise.resolve();

  public FieldValue = {
    serverTimestamp: () => {
      const capturedMs = Date.now();
      return { toMillis: () => capturedMs, _serverTimestamp: true };
    },
    delete: () => DELETE_FIELD_SENTINEL,
  };

  private applyPatch(target: Record<string, any>, patch: Record<string, any>): Record<string, any> {
    const next = { ...target };
    for (const [k, v] of Object.entries(patch)) {
      if (v === DELETE_FIELD_SENTINEL) {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
    return next;
  }

  collection(colName: string) {
    if (!this.collections.has(colName)) {
      this.collections.set(colName, new Map());
    }
    const col = this.collections.get(colName)!;

    return {
      doc: (docId: string) => {
        const ref = {
          id: docId,
          _col: col,
          get: async () => {
            const docData = col.get(docId);
            return {
              exists: !!docData,
              data: () => (docData ? { ...docData } : undefined),
            };
          },
          set: async (val: Record<string, any>, opts?: { merge?: boolean }) => {
            if (opts?.merge && col.has(docId)) {
              col.set(docId, this.applyPatch(col.get(docId)!, val));
            } else {
              col.set(docId, this.applyPatch({}, val));
            }
          },
          update: async (val: Record<string, any>) => {
            if (!col.has(docId)) {
              throw new Error(`Document ${colName}/${docId} does not exist`);
            }
            col.set(docId, this.applyPatch(col.get(docId)!, val));
          },
        };
        return ref;
      },
    };
  }

  async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    let result!: T;
    const next = this.txChain.then(async () => {
      const stagedWrites: Array<() => void> = [];
      const tx = {
        get: async (docRef: any) => docRef.get(),
        set: (docRef: any, val: Record<string, any>, opts?: { merge?: boolean }) => {
          stagedWrites.push(() => {
            const existing = docRef._col.get(docRef.id);
            if (opts?.merge && existing) {
              docRef._col.set(docRef.id, this.applyPatch(existing, val));
            } else {
              docRef._col.set(docRef.id, this.applyPatch({}, val));
            }
          });
        },
        update: (docRef: any, val: Record<string, any>) => {
          stagedWrites.push(() => {
            const existing = docRef._col.get(docRef.id);
            if (!existing) {
              throw new Error(`Cannot update missing doc ${docRef.id}`);
            }
            docRef._col.set(docRef.id, this.applyPatch(existing, val));
          });
        },
      };

      result = await updateFunction(tx);
      for (const write of stagedWrites) {
        write();
      }
    });

    this.txChain = next.then(
      () => undefined,
      () => undefined
    );
    await next;
    return result;
  }
}

describe("FIN-01: Concurrent Two-Worker Webhook Lease & Fencing Integration Verification", () => {
  const TEST_SECRET = "whsec_concurrent_fin01_test";
  let db: TransactionalMockFirestore;
  let mockStripe: any;

  function invokeHandler(
    handler: express.RequestHandler,
    payload: Record<string, any>,
    sig = "sig_valid_test"
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      let statusCode = 200;
      const req: any = {
        headers: { "stripe-signature": sig, "content-type": "application/json" },
        body: Buffer.from(JSON.stringify(payload), "utf8"),
      };
      const res: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(data: any) {
          resolve({ status: statusCode, body: data });
          return this;
        },
        send(data: any) {
          resolve({ status: statusCode, body: data });
          return this;
        },
      };
      Promise.resolve(handler(req, res, (err?: any) => (err ? reject(err) : undefined))).catch(reject);
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T10:00:00.000Z"));
    db = new TransactionalMockFirestore();
    mockStripe = {
      webhooks: {
        constructEvent: vi.fn((body: Buffer, sig: string, secret: string) => {
          if (secret !== TEST_SECRET || sig !== "sig_valid_test") {
            throw new Error("Invalid signature");
          }
          return JSON.parse(body.toString("utf8"));
        }),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("Concurrent Takeover (Success Path): Worker A pauses, clock expires lease, Worker B reclaims with new fencing token & completes, Worker A resumes without overwriting terminal state, duplicate acknowledged safely", async () => {
    const eventId = "evt_concurrent_success_001";
    const eventPayload = {
      id: eventId,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_fin01_conc_1", amount: 12500, currency: "gbp" } },
    };

    const workerAEntered = createDeferred<void>();
    const workerARelease = createDeferred<void>();
    const workerBCompletedEffect = createDeferred<void>();

    const ledgerEffects: Array<{ attempt: number; workerToken: string | undefined; workerId: string | undefined }> = [];
    let attemptCount = 0;

    const handler = createStripeWebhookHandler({
      getDb: () => db,
      getStripe: () => mockStripe,
      getWebhookSecret: () => TEST_SECRET,
      processEvent: async (evt, activeDb) => {
        attemptCount += 1;
        const currentAttempt = attemptCount;
        const snap = await activeDb.collection("processed_stripe_events").doc(evt.id).get();
        const leaseSnapshot = snap.data();

        if (currentAttempt === 1) {
          // Worker A notifies test harness it owns the lease, then pauses across lease expiry
          workerAEntered.resolve();
          await workerARelease.promise;
          // Simulate server.ts-style fenced side-effect check before mutating financial state
          const { ownsStripeWebhookClaim } = await import("../../src/server/stripeWebhookIdempotency.ts");
          const latestSnap = await activeDb.collection("processed_stripe_events").doc(evt.id).get();
          if (ownsStripeWebhookClaim(latestSnap.data(), leaseSnapshot?.claimToken)) {
            ledgerEffects.push({
              attempt: currentAttempt,
              workerToken: leaseSnapshot?.claimToken,
              workerId: leaseSnapshot?.workerId,
            });
          }
          return;
        }

        // Worker B commits side effect under its active claim token
        ledgerEffects.push({
          attempt: currentAttempt,
          workerToken: leaseSnapshot?.claimToken,
          workerId: leaseSnapshot?.workerId,
        });
        workerBCompletedEffect.resolve();
      },
    });

    // 1. Worker A starts processing and acquires the initial lease
    const workerAPromise = invokeHandler(handler, eventPayload);
    await workerAEntered.promise;

    const leaseAfterA = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(leaseAfterA.status).toBe("processing");
    expect(leaseAfterA.workerId).toBeTruthy();
    expect(leaseAfterA.claimToken).toBeTruthy();

    // 2. Duplicate delivery before lease expiry is suppressed (lease stays with Worker A)
    vi.advanceTimersByTime(60 * 1000);
    const prematureDuplicate = await invokeHandler(handler, eventPayload);
    expect(prematureDuplicate.status).toBe(200);
    expect(prematureDuplicate.body).toContain("Already processed or currently processing");
    expect(attemptCount).toBe(1);

    // 3. Advance deterministic clock past STALE_LEASE_THRESHOLD_MS (5 minutes)
    vi.advanceTimersByTime(STALE_LEASE_THRESHOLD_MS + 1000);

    // 4. Worker B reclaims the stale lease using a brand-new workerId + claimToken and completes
    const workerBResponse = await invokeHandler(handler, eventPayload);
    await workerBCompletedEffect.promise;
    expect(workerBResponse.status).toBe(200);
    expect(workerBResponse.body).toEqual({ received: true });

    const docAfterB = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(docAfterB.status).toBe("completed");
    expect(docAfterB.workerId).not.toBe(leaseAfterA.workerId);
    expect(docAfterB.previousWorkerId).toBe(leaseAfterA.workerId);
    expect(docAfterB.takeoverFromStaleWorker).toBe(true);
    expect(docAfterB.claimToken).toBeUndefined();
    const completedAtByB = docAfterB.completedAt.toMillis();

    // Verify markStripeEventCompleted explicitly rejects Worker A's stale workerId & claimToken
    const staleCompletionProbe = await markStripeEventCompleted(
      db,
      eventId,
      leaseAfterA.workerId,
      leaseAfterA.claimToken
    );
    expect(staleCompletionProbe.success).toBe(false);
    expect(staleCompletionProbe.staleRejected).toBe(true);

    // 5. Worker A resumes after lease takeover and tries to finish; terminal state of Worker B MUST remain intact
    workerARelease.resolve();
    await workerAPromise;

    const docAfterAResume = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(docAfterAResume.status).toBe("completed");
    expect(docAfterAResume.workerId).toBe(docAfterB.workerId);
    expect(docAfterAResume.completedAt.toMillis()).toBe(completedAtByB);

    // Financial side effect ran strictly once (Worker B only) with a distinct fencing token
    expect(ledgerEffects).toHaveLength(1);
    expect(ledgerEffects[0].workerId).toBe(docAfterB.workerId);
    expect(ledgerEffects[0].workerToken).not.toBe(leaseAfterA.claimToken);

    // 6. Post-completion duplicate delivery is acknowledged with HTTP 200 and zero repeat side effects
    const postCompleteDup = await invokeHandler(handler, eventPayload);
    expect(postCompleteDup.status).toBe(200);
    expect(postCompleteDup.body).toContain("Already processed or currently processing");
    expect(attemptCount).toBe(2);
    expect(ledgerEffects).toHaveLength(1);
  });

  it("Concurrent Takeover (Failure Path): Resumed stale Worker A failing cannot overwrite Worker B active processing or completed state", async () => {
    const eventId = "evt_concurrent_fail_002";
    const eventPayload = {
      id: eventId,
      type: "checkout.session.completed",
      data: { object: { id: "cs_fin01_conc_2" } },
    };

    const workerAEntered = createDeferred<void>();
    const workerAReleaseError = createDeferred<void>();
    const workerBEntered = createDeferred<void>();
    const workerBFinish = createDeferred<void>();

    let callIndex = 0;
    const handler = createStripeWebhookHandler({
      getDb: () => db,
      getStripe: () => mockStripe,
      getWebhookSecret: () => TEST_SECRET,
      processEvent: async () => {
        callIndex += 1;
        const myCall = callIndex;
        if (myCall === 1) {
          workerAEntered.resolve();
          await workerAReleaseError.promise;
          throw new Error("Worker A timed out downstream");
        }
        workerBEntered.resolve();
        await workerBFinish.promise;
      },
    });

    // Worker A acquires initial lease and stalls
    const workerAPromise = invokeHandler(handler, eventPayload);
    await workerAEntered.promise;
    const leaseA = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;

    // Advance past 5-minute lease expiry and start Worker B (pause Worker B mid-flight too)
    vi.advanceTimersByTime(STALE_LEASE_THRESHOLD_MS + 5000);
    const workerBPromise = invokeHandler(handler, eventPayload);
    await workerBEntered.promise;

    const leaseB = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(leaseB.status).toBe("processing");
    expect(leaseB.workerId).not.toBe(leaseA.workerId);
    expect(leaseB.claimToken).not.toBe(leaseA.claimToken);

    // Direct fencing probe: stale Worker A cannot fail Worker B's active processing lease
    const staleFailDuringB = await markStripeEventFailed(
      db,
      eventId,
      "Stale Worker A timeout",
      leaseA.workerId,
      leaseA.claimToken
    );
    expect(staleFailDuringB.success).toBe(false);
    expect(staleFailDuringB.staleRejected).toBe(true);

    // Release Worker A so it throws and invokes handler catch -> markStripeEventFailed
    workerAReleaseError.resolve();
    const resA = await workerAPromise;
    expect(resA.status).toBe(500);

    // Worker B's active processing lease MUST still be intact (not overwritten to 'failed')
    const midDoc = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(midDoc.status).toBe("processing");
    expect(midDoc.workerId).toBe(leaseB.workerId);
    expect(midDoc.claimToken).toBe(leaseB.claimToken);

    // Worker B finishes and marks completed
    workerBFinish.resolve();
    const resB = await workerBPromise;
    expect(resB.status).toBe(200);
    expect(resB.body).toEqual({ received: true });

    const finalDoc = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(finalDoc.status).toBe("completed");
    expect(finalDoc.workerId).toBe(leaseB.workerId);
  });

  it("Claim-token transaction fencing: blocks stale claimToken even under explicit server.ts-style token checks, and transient failures remain retryable", async () => {
    const eventId = "evt_retry_and_token_fence_003";
    const eventPayload = {
      id: eventId,
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_retry_003" } },
    };

    // 1. Verify claimToken-only fencing rejects stale token even if workerId were missing/omitted
    const claim1 = await claimStripeEventLease(db, "evt_token_only_004", { workerId: "worker_1" });
    expect(claim1.claimed).toBe(true);
    expect(claim1.claimToken).toBeTruthy();

    vi.advanceTimersByTime(STALE_LEASE_THRESHOLD_MS + 1000);
    const claim2 = await claimStripeEventLease(db, "evt_token_only_004", { workerId: "worker_2" });
    expect(claim2.claimed).toBe(true);
    expect(claim2.claimToken).not.toBe(claim1.claimToken);

    const staleTokenComplete = await markStripeEventCompleted(db, "evt_token_only_004", undefined, claim1.claimToken);
    expect(staleTokenComplete).toEqual({ success: false, staleRejected: true });

    const staleTokenFail = await markStripeEventFailed(db, "evt_token_only_004", "late err", undefined, claim1.claimToken);
    expect(staleTokenFail).toEqual({ success: false, staleRejected: true });

    const validTokenComplete = await markStripeEventCompleted(db, "evt_token_only_004", "worker_2", claim2.claimToken);
    expect(validTokenComplete).toEqual({ success: true });

    // 2. Verify transient failure leaves event retryable and second delivery succeeds
    let shouldFail = true;
    let completions = 0;
    const retryHandler = createStripeWebhookHandler({
      getDb: () => db,
      getStripe: () => mockStripe,
      getWebhookSecret: () => TEST_SECRET,
      processEvent: async () => {
        if (shouldFail) {
          throw new Error("Transient Firestore unavailable");
        }
        completions += 1;
      },
    });

    const firstTry = await invokeHandler(retryHandler, eventPayload);
    expect(firstTry.status).toBe(500);
    const failedDoc = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(failedDoc.status).toBe("failed");
    expect(failedDoc.error).toContain("Transient Firestore unavailable");
    expect(failedDoc.claimToken).toBeUndefined();

    // Stripe retries immediately (no 5-minute wait needed for 'failed' status)
    shouldFail = false;
    const secondTry = await invokeHandler(retryHandler, eventPayload);
    expect(secondTry.status).toBe(200);
    expect(secondTry.body).toEqual({ received: true });
    expect(completions).toBe(1);

    const recoveredDoc = (await db.collection("processed_stripe_events").doc(eventId).get()).data()!;
    expect(recoveredDoc.status).toBe("completed");
  });
});
