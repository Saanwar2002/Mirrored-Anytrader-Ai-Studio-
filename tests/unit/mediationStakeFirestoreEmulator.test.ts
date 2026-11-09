process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8088";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import {
  reserveMediationStakeAttempt,
  confirmMediationStakePayment,
  recordMediationStakePaymentFailure,
  attachMediationStakePaymentIntent,
} from "../../src/server/mediationStake.ts";

describe("Mediation stake transactions — real Firestore Emulator", () => {
  const projectId = "demo-anytrader";
  const appName = "mediation-stake-real-emulator-suite";
  let db: admin.firestore.Firestore;
  let app: any;
  let sequence = 0;

  const newJobId = () => `mediation_stake_emulator_${Date.now()}_${++sequence}`;
  const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const seedDisputedJob = async (jobId: string) => {
    await db.collection("jobs").doc(jobId).set({
      id: jobId,
      homeownerId: "mediation-owner",
      userId: "mediation-owner",
      acceptedTradespersonId: "mediation-trader",
      status: "disputed",
      dispute: { reason: "Emulator transaction test" },
    });
  };

  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("FIRESTORE_EMULATOR_HOST must point to the Firestore Emulator.");
    }
    app = admin.apps.find((candidate) => candidate?.name === appName) ??
      admin.initializeApp({ projectId }, appName);
    db = app.firestore();
  });

  afterAll(async () => {
    if (app) await app.delete();
  });

  it("serializes simultaneous reservations into one stable attempt ID", async () => {
    const jobId = newJobId();
    await seedDisputedJob(jobId);

    const results = await Promise.all([
      reserveMediationStakeAttempt(db, {
        jobId, userId: "mediation-owner", candidateAttemptId: "attempt-emulator-a",
        serverTimestamp,
      }),
      reserveMediationStakeAttempt(db, {
        jobId, userId: "mediation-owner", candidateAttemptId: "attempt-emulator-b",
        serverTimestamp,
      }),
    ]);

    expect(results[0].attemptId).toBe(results[1].attemptId);
    const saved = (await db.collection("jobs").doc(jobId).get()).data()?.dispute;
    expect(saved.stakePaymentAttemptId).toBe(results[0].attemptId);
    expect(saved.raisedBy).toBe("mediation-owner");
    expect(saved.stakePaymentStatus).toBe("creating");
  }, 30000);

  it("prevents the other participant from reusing the initiator's reservation", async () => {
    const jobId = newJobId();
    await seedDisputedJob(jobId);
    await reserveMediationStakeAttempt(db, {
      jobId, userId: "mediation-owner", candidateAttemptId: "attempt-owner",
      serverTimestamp,
    });

    await expect(reserveMediationStakeAttempt(db, {
      jobId, userId: "mediation-trader", candidateAttemptId: "attempt-trader",
      serverTimestamp,
    })).rejects.toMatchObject({ httpStatus: 403 });

    const saved = (await db.collection("jobs").doc(jobId).get()).data()?.dispute;
    expect(saved.stakePaymentAttemptId).toBe("attempt-owner");
    expect(saved.raisedBy).toBe("mediation-owner");
  }, 30000);

  it("keeps concurrent duplicate success webhook deliveries idempotent", async () => {
    const jobId = newJobId();
    await seedDisputedJob(jobId);
    await reserveMediationStakeAttempt(db, {
      jobId, userId: "mediation-owner", candidateAttemptId: "attempt-success",
      serverTimestamp,
    });
    const confirmation = {
      jobId, userId: "mediation-owner", attemptId: "attempt-success",
      paymentIntentId: "pi_emulator_success", serverTimestamp,
    };

    await Promise.all([
      confirmMediationStakePayment(db, confirmation),
      confirmMediationStakePayment(db, confirmation),
    ]);

    const saved = (await db.collection("jobs").doc(jobId).get()).data()!;
    expect(saved.dispute.mediationStakePaid).toBe(true);
    expect(saved.dispute.stakePaymentStatus).toBe("succeeded");
    expect(saved.dispute.stakePaymentId).toBe("pi_emulator_success");
    expect(saved.dispute.status).toBe("pending_arbitration");
  }, 30000);

  it("does not let a delayed failure webhook downgrade a successful payment", async () => {
    const jobId = newJobId();
    await seedDisputedJob(jobId);
    await reserveMediationStakeAttempt(db, {
      jobId, userId: "mediation-owner", candidateAttemptId: "attempt-ordering",
      serverTimestamp,
    });
    await confirmMediationStakePayment(db, {
      jobId, userId: "mediation-owner", attemptId: "attempt-ordering",
      paymentIntentId: "pi_emulator_ordering", serverTimestamp,
    });

    await recordMediationStakePaymentFailure(db, {
      jobId, userId: "mediation-owner", attemptId: "attempt-ordering",
      paymentIntentId: "pi_emulator_ordering",
      paymentIntentStatus: "requires_payment_method",
      lastPaymentError: "Delayed stale failure", serverTimestamp,
    });

    const saved = (await db.collection("jobs").doc(jobId).get()).data()!.dispute;
    expect(saved.mediationStakePaid).toBe(true);
    expect(saved.stakePaymentStatus).toBe("succeeded");
    expect(saved.stakePaymentId).toBe("pi_emulator_ordering");
  }, 30000);

  it("accepts a success webhook before route attachment and preserves the paid state", async () => {
    const jobId = newJobId();
    await seedDisputedJob(jobId);
    await reserveMediationStakeAttempt(db, {
      jobId, userId: "mediation-owner", candidateAttemptId: "attempt-early-webhook",
      serverTimestamp,
    });

    await confirmMediationStakePayment(db, {
      jobId, userId: "mediation-owner", attemptId: "attempt-early-webhook",
      paymentIntentId: "pi_emulator_early", serverTimestamp,
    });
    await attachMediationStakePaymentIntent(db, {
      jobId, attemptId: "attempt-early-webhook",
      paymentIntentId: "pi_emulator_early", paymentIntentStatus: "succeeded",
    });

    const saved = (await db.collection("jobs").doc(jobId).get())!.data()!.dispute;
    expect(saved.paymentIntentId).toBe("pi_emulator_early");
    expect(saved.mediationStakePaid).toBe(true);
    expect(saved.stakePaymentStatus).toBe("succeeded");
  }, 30000);
});
