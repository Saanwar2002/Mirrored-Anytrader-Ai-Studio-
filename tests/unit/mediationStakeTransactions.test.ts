import { describe, expect, it } from "vitest";
import { reserveMediationStakeAttempt, createMediationStakePaymentIntent, confirmMediationStakePayment, recordMediationStakePaymentFailure, attachMediationStakePaymentIntent } from "../../src/server/mediationStake.ts";

function createTransactionalDb(seed: Record<string, any>) {
  const store = structuredClone(seed);
  let queue = Promise.resolve();
  const db: any = {
    _store: store,
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return { id, path, get: async () => ({
          exists: store[path] !== undefined,
          data: () => structuredClone(store[path])
        }) };
      }
    }),
    runTransaction: async (handler: (tx: any) => Promise<any>) => {
      let release!: () => void;
      const previous = queue;
      queue = new Promise<void>(resolve => { release = resolve; });
      await previous;
      try {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (ref: any) => ({
            exists: store[ref.path] !== undefined,
            data: () => structuredClone(store[ref.path])
          }),
          update: (ref: any, patch: any) => writes.push(() => {
            store[ref.path] = { ...store[ref.path], ...structuredClone(patch) };
          })
        };
        const result = await handler(tx);
        writes.forEach(write => write());
        return result;
      } finally {
        release();
      }
    }
  };
  return db;
}

const timestamp = () => "server-time";
const seedJob = {
  status: "disputed",
  homeownerId: "owner-1",
  acceptedTradespersonId: "trader-1",
  dispute: { reason: "Existing dispute" }
};

function createIdempotentStripe(options: { failFirstAfterCreate?: boolean } = {}) {
  const intents = new Map<string, any>();
  const calls: string[] = [];
  let failed = false;
  return {
    calls,
    paymentIntents: {
      create: async (_params: any, request: { idempotencyKey: string }) => {
        calls.push(request.idempotencyKey);
        let intent = intents.get(request.idempotencyKey);
        if (!intent) {
          intent = { id: "pi-shared", client_secret: "secret-shared", status: "requires_payment_method" };
          intents.set(request.idempotencyKey, intent);
        }
        if (options.failFirstAfterCreate && !failed) {
          failed = true;
          throw new Error("simulated network timeout after Stripe created the intent");
        }
        return intent;
      },
      retrieve: async (id: string) => {
        const intent = [...intents.values()].find(value => value.id === id);
        if (!intent) throw new Error("PaymentIntent not found");
        return intent;
      }
    }
  };
}

const orchestrationInput = (candidateAttemptId: string) => ({
  jobId: "job-1", userId: "owner-1", candidateAttemptId, serverTimestamp: timestamp
});

describe("mediation stake transaction commands", () => {
  it("uses one effective Stripe PaymentIntent for simultaneous checkout requests", async () => {
    const db = createTransactionalDb({ "jobs/job-1": seedJob });
    const stripe = createIdempotentStripe();
    const results = await Promise.all([
      createMediationStakePaymentIntent(db, stripe, orchestrationInput("attempt-a")),
      createMediationStakePaymentIntent(db, stripe, orchestrationInput("attempt-b"))
    ]);

    expect(results.map(result => result.attemptId)).toEqual(["attempt-a", "attempt-a"]);
    expect(results.map(result => result.paymentIntent.id)).toEqual(["pi-shared", "pi-shared"]);
    expect(stripe.calls).toEqual([
      "mediation-stake:job-1:attempt-a",
      "mediation-stake:job-1:attempt-a"
    ]);
    expect(db._store["jobs/job-1"].dispute.paymentIntentId).toBe("pi-shared");
  });

  it("reuses the same Stripe idempotency key after a timeout following intent creation", async () => {
    const db = createTransactionalDb({ "jobs/job-1": seedJob });
    const stripe = createIdempotentStripe({ failFirstAfterCreate: true });

    await expect(createMediationStakePaymentIntent(db, stripe, orchestrationInput("attempt-a")))
      .rejects.toThrow("simulated network timeout");
    const retry = await createMediationStakePaymentIntent(db, stripe, orchestrationInput("attempt-b"));

    expect(retry.attemptId).toBe("attempt-a");
    expect(retry.paymentIntent.id).toBe("pi-shared");
    expect(stripe.calls).toEqual([
      "mediation-stake:job-1:attempt-a",
      "mediation-stake:job-1:attempt-a"
    ]);
    expect(db._store["jobs/job-1"].dispute.paymentIntentId).toBe("pi-shared");
  });

  it("reserves exactly one attempt for simultaneous retries by the initiating participant", async () => {
    const db = createTransactionalDb({ "jobs/job-1": seedJob });
    const input = (candidateAttemptId: string) => ({
      jobId: "job-1", userId: "owner-1", candidateAttemptId, serverTimestamp: timestamp
    });
    const results = await Promise.all([
      reserveMediationStakeAttempt(db, input("attempt-a")),
      reserveMediationStakeAttempt(db, input("attempt-b"))
    ]);

    expect(results.map(result => result.attemptId)).toEqual(["attempt-a", "attempt-a"]);
    expect(db._store["jobs/job-1"].dispute.stakePaymentAttemptId).toBe("attempt-a");
    expect(db._store["jobs/job-1"].dispute.raisedBy).toBe("owner-1");
    expect(db._store["jobs/job-1"].dispute.stakePaymentStatus).toBe("creating");
  });

  it("rejects a different participant attempting to reuse another participant's reservation", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: { ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a" }
      }
    });
    await expect(reserveMediationStakeAttempt(db, {
      jobId: "job-1", userId: "trader-1", candidateAttemptId: "attempt-b", serverTimestamp: timestamp
    })).rejects.toMatchObject({ httpStatus: 403 });
    expect(db._store["jobs/job-1"].dispute.stakePaymentAttemptId).toBe("attempt-a");
  });

  it("confirms a matching payment idempotently when the webhook is delivered more than once", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: {
          ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a",
          paymentIntentId: "pi-123", stakePaymentStatus: "processing"
        }
      }
    });
    const confirmation = {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-a",
      paymentIntentId: "pi-123", serverTimestamp: timestamp
    };
    await Promise.all([
      confirmMediationStakePayment(db, confirmation),
      confirmMediationStakePayment(db, confirmation)
    ]);
    const job = db._store["jobs/job-1"];
    expect(job.status).toBe("disputed");
    expect(job.dispute.mediationStakePaid).toBe(true);
    expect(job.dispute.stakePaymentId).toBe("pi-123");
    expect(job.dispute.status).toBe("pending_arbitration");
  });

  it("rejects a success webhook whose attempt or PaymentIntent does not match the reservation", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: {
          ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a",
          paymentIntentId: "pi-123"
        }
      }
    });
    await expect(confirmMediationStakePayment(db, {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-b",
      paymentIntentId: "pi-123", serverTimestamp: timestamp
    })).rejects.toThrow("Mediation stake reservation mismatch");
    expect(db._store["jobs/job-1"].dispute.mediationStakePaid).not.toBe(true);
  });

  it("records a failure webhook that arrives before the route attaches the PaymentIntent", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: { ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a", stakePaymentStatus: "creating" }
      }
    });
    await recordMediationStakePaymentFailure(db, {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-a", paymentIntentId: "pi-early",
      paymentIntentStatus: "requires_payment_method", lastPaymentError: "Card declined", serverTimestamp: timestamp
    });
    await attachMediationStakePaymentIntent(db, {
      jobId: "job-1", attemptId: "attempt-a", paymentIntentId: "pi-early", paymentIntentStatus: "requires_payment_method"
    });
    const dispute = db._store["jobs/job-1"].dispute;
    expect(dispute.paymentIntentId).toBe("pi-early");
    expect(dispute.stakePaymentStatus).toBe("requires_payment_method");
    expect(dispute.lastPaymentError).toBe("Card declined");
  });

  it("does not let a delayed failure webhook downgrade a successful payment", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: {
          ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a",
          paymentIntentId: "pi-paid", mediationStakePaid: true, stakePaymentStatus: "succeeded",
          stakePaymentId: "pi-paid", status: "pending_arbitration"
        }
      }
    });
    await recordMediationStakePaymentFailure(db, {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-a", paymentIntentId: "pi-paid",
      paymentIntentStatus: "requires_payment_method", lastPaymentError: "Stale failure", serverTimestamp: timestamp
    });
    expect(db._store["jobs/job-1"].dispute.stakePaymentStatus).toBe("succeeded");
    expect(db._store["jobs/job-1"].dispute.mediationStakePaid).toBe(true);
  });

  it("rejects a failure webhook for a different PaymentIntent or reservation", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: {
          ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a",
          paymentIntentId: "pi-canonical"
        }
      }
    });
    await expect(recordMediationStakePaymentFailure(db, {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-a", paymentIntentId: "pi-other",
      paymentIntentStatus: "requires_payment_method", serverTimestamp: timestamp
    })).rejects.toThrow("Mediation stake failure reservation mismatch");
    expect(db._store["jobs/job-1"].dispute.paymentIntentId).toBe("pi-canonical");
  });

  it("accepts a verified success webhook that arrives before route attachment", async () => {
    const db = createTransactionalDb({
      "jobs/job-1": {
        ...seedJob,
        dispute: { ...seedJob.dispute, raisedBy: "owner-1", stakePaymentAttemptId: "attempt-a", stakePaymentStatus: "creating" }
      }
    });
    await confirmMediationStakePayment(db, {
      jobId: "job-1", userId: "owner-1", attemptId: "attempt-a",
      paymentIntentId: "pi-early-success", serverTimestamp: timestamp
    });
    await attachMediationStakePaymentIntent(db, {
      jobId: "job-1", attemptId: "attempt-a", paymentIntentId: "pi-early-success", paymentIntentStatus: "succeeded"
    });
    const dispute = db._store["jobs/job-1"].dispute;
    expect(dispute.paymentIntentId).toBe("pi-early-success");
    expect(dispute.stakePaymentStatus).toBe("succeeded");
    expect(dispute.mediationStakePaid).toBe(true);
  });

});
