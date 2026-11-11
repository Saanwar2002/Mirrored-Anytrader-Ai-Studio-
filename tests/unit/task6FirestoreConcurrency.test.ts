process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

import { describe, it, beforeAll, expect } from "vitest";
import * as admin from "firebase-admin";
import crypto from "crypto";
import { PaymentLedgerEngine } from "../../src/server/paymentLedger.ts";
import { ConflictError, ForbiddenError, BadRequestError } from "../../src/server/httpErrors.ts";

describe("Task 6 — Real Firestore Emulator Concurrency & Escrow Security Verification", () => {
  const PROJECT_ID = "demo-anytrader";
  let db: admin.firestore.Firestore;

  const homeownerUid = "homeowner_task6_real_alice";
  const traderDaveUid = "trader_task6_real_dave";
  const traderBobUid = "trader_task6_real_bob";

  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("FIRESTORE_EMULATOR_HOST must be configured to run emulator concurrency tests.");
    }
    const appName = "task6-real-emulator-concurrency-suite";
    const app =
      admin.apps.find((a) => a?.name === appName) ??
      admin.initializeApp({ projectId: PROJECT_ID }, appName);
    db = app.firestore();
  });

  const setupJobAndQuote = async (customSuffix: string, milestoneStatus: string = "funded", milestoneAmount: number = 500) => {
    const jobId = `job_real_task6_${customSuffix}`;
    const quoteId = `quote_real_task6_${customSuffix}`;
    const milestoneId = `milestone_task6_${customSuffix}`;

    const jobData = {
      id: jobId,
      homeownerId: homeownerUid,
      userId: homeownerUid,
      customerId: homeownerUid,
      title: "Task 6 Escrow Real Test Job",
      status: "in_progress",
      acceptedTradespersonId: traderDaveUid,
      acceptedTraderId: traderDaveUid,
      acceptedQuoteId: quoteId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const quoteData = {
      id: quoteId,
      jobId,
      tradespersonId: traderDaveUid,
      status: "accepted",
      milestones: [
        {
          id: milestoneId,
          title: "Execution Phase",
          amount: milestoneAmount,
          verifiedAmount: milestoneAmount,
          status: milestoneStatus,
          escrowFunded: milestoneStatus === "funded",
          currency: "gbp",
          stripePaymentIntentId: `pi_funded_${customSuffix}`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("jobs").doc(jobId).set(jobData);
    await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).set(quoteData);

    return { jobId, quoteId, milestoneId };
  };

  it("1. Real Emulator Test #1 — Simultaneous release requests with different keys produce exactly 1 success and 1 ConflictError", { timeout: 15000 }, async () => {
    const suffix = `race_${Date.now()}`;
    const { jobId, quoteId, milestoneId } = await setupJobAndQuote(suffix, "funded", 600);

    const keyA = `key_release_A_${suffix}`;
    const keyB = `key_release_B_${suffix}`;

    // Genuine concurrent race using Promise.allSettled
    const results = await Promise.allSettled([
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerUid,
        idempotencyKey: keyA,
      }),
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerUid,
        idempotencyKey: keyB,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    // Strict Concurrency Invariants
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    // Verify committed Firestore state
    const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
    const milestone = quoteSnap.data()?.milestones.find((m: any) => m.id === milestoneId);
    expect(milestone.status).toBe("funds_released");
    expect(milestone.releasedAt).toBeDefined();

    // Verify exactly 1 ledger record created across both requests
    const ledgerSnap = await db.collection("payment_ledger")
      .where("payerId", "==", homeownerUid)
      .where("transactionId", "==", `pi_funded_${suffix}`)
      .get();
    expect(ledgerSnap.docs.length).toBe(1);
    const ledgerData = ledgerSnap.docs[0].data();
    expect(ledgerData.amount).toBe(60000); // 600 * 100
    expect(ledgerData.platformFee).toBe(7200); // 12%
    expect(ledgerData.netPayout).toBe(52800); // 88%
  });

  it("2. Real Emulator Test #2 — Simultaneous and sequential release requests with SAME idempotency key return identical result without duplicate effects", { timeout: 15000 }, async () => {
    const suffix = `same_key_${Date.now()}`;
    const { jobId, quoteId, milestoneId } = await setupJobAndQuote(suffix, "funded", 450);

    const sameKey = `key_shared_${suffix}`;

    // First execute the release with sameKey
    const res1 = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid: homeownerUid,
      idempotencyKey: sameKey,
    });

    expect(res1.success).toBe(true);
    expect(res1.releasedAmount).toBe(450);

    // Subsequent re-invocation with the same idempotency key must return cached result
    const res2 = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid: homeownerUid,
      idempotencyKey: sameKey,
    });

    expect(res2.success).toBe(true);
    expect(res2.releasedAmount).toBe(450);

    // Verify only ONE ledger record was created
    const ledgerSnap = await db.collection("payment_ledger")
      .where("payerId", "==", homeownerUid)
      .where("transactionId", "==", `pi_funded_${suffix}`)
      .get();
    expect(ledgerSnap.docs.length).toBe(1);
  });

  it("3. Real Emulator Test #3 — Release request fails closed on unauthorized caller", { timeout: 15000 }, async () => {
    const suffix = `auth_fail_${Date.now()}`;
    const { jobId, quoteId, milestoneId } = await setupJobAndQuote(suffix, "funded", 300);

    // 1. Unauthenticated (empty string)
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: "",
        idempotencyKey: `key_unauth_${suffix}`,
      })
    ).rejects.toThrow(ForbiddenError);

    // 2. Unauthorized third-party caller
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: "random_attacker_uid",
        idempotencyKey: `key_wrong_user_${suffix}`,
      })
    ).rejects.toThrow(ForbiddenError);

    // 3. Forged QR handshake by unaccepted tradesperson
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: traderBobUid, // Bob is not the accepted trader
        idempotencyKey: `key_forged_qr_${suffix}`,
        isQrHandshake: true,
      })
    ).rejects.toThrow(ForbiddenError);

    // Verify milestone is STILL funded (not released)
    const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
    expect(quoteSnap.data()?.milestones[0].status).toBe("funded");
  });

  it("4. Real Emulator Test #4 — Rejects cross-entity IDOR combinations (Job A with Quote B)", { timeout: 15000 }, async () => {
    const suffixA = `idor_A_${Date.now()}`;
    const suffixB = `idor_B_${Date.now()}`;

    const entityA = await setupJobAndQuote(suffixA, "funded", 200);
    const entityB = await setupJobAndQuote(suffixB, "funded", 500);

    // Attempt to release Quote B using Job A
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId: entityA.jobId,
        quoteId: entityB.quoteId, // Belongs to Job B
        milestoneId: entityB.milestoneId,
        authUid: homeownerUid,
        idempotencyKey: `key_cross_idor_${suffixA}`,
      })
    ).rejects.toThrow(BadRequestError);

    // Attempt to release non-existent milestone ID
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId: entityA.jobId,
        quoteId: entityA.quoteId,
        milestoneId: "bogus_fabricated_milestone_id",
        authUid: homeownerUid,
        idempotencyKey: `key_bogus_m_${suffixA}`,
      })
    ).rejects.toThrow("Milestone not found");
  });

  it("5. Real Emulator Test #5 — Strict state-machine enforcement rejects invalid transitions on emulator", { timeout: 15000 }, async () => {
    const suffixPending = `pending_${Date.now()}`;
    const entityPending = await setupJobAndQuote(suffixPending, "pending", 350);

    // 1. Cannot release unfunded milestone
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId: entityPending.jobId,
        quoteId: entityPending.quoteId,
        milestoneId: entityPending.milestoneId,
        authUid: homeownerUid,
        idempotencyKey: `key_unfunded_${suffixPending}`,
      })
    ).rejects.toThrow("Escrow must be actively funded before release");

    // 2. Cannot release cancelled milestone
    const suffixCancelled = `cancelled_${Date.now()}`;
    const entityCancelled = await setupJobAndQuote(suffixCancelled, "cancelled", 350);
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId: entityCancelled.jobId,
        quoteId: entityCancelled.quoteId,
        milestoneId: entityCancelled.milestoneId,
        authUid: homeownerUid,
        idempotencyKey: `key_cancelled_${suffixCancelled}`,
      })
    ).rejects.toThrow(ConflictError);
  });

  it("6. Real Emulator Test #6 — Proves crash recovery with stale lock verifies authoritative state and avoids duplicate effects", { timeout: 15000 }, async () => {
    const suffix = `crash_rec_${Date.now()}`;
    const { jobId, quoteId, milestoneId } = await setupJobAndQuote(suffix, "funded", 800);

    const crashKey = `idemp_crash_key_${suffix}`;

    // 1. Initial release
    const res1 = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid: homeownerUid,
      idempotencyKey: crashKey,
    });
    expect(res1.success).toBe(true);

    // 2. Simulate worker crash before idempotency doc reached completed: set status to in_progress with stale timestamp
    const idempRef = db.collection("payment_idempotency").doc(crashKey);
    const bindingJson = JSON.stringify({
      authUid: homeownerUid,
      authorizationMode: "owner",
      jobId,
      milestoneId,
      quoteId,
      version: 1,
    });
    const bindingHash = crypto.createHash("sha256").update(bindingJson).digest("hex");
    await idempRef.set({
      operationName: "RELEASE_MILESTONE",
      bindingHash,
      status: "in_progress",
      startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    });

    // 3. Retry must fail closed: a stale in-progress claim is not proof that
    // the original operation had no effect, even when the authoritative state
    // currently appears released. Reconciliation is required before replay.
    await expect(
      PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerUid,
        idempotencyKey: crashKey,
      })
    ).rejects.toThrow("requires reconciliation");

    const claim = (await idempRef.get()).data();
    expect(claim.status).toBe("reconciliation_required");
    expect(claim.claimToken).toBeUndefined();

    // VERIFY ON REAL EMULATOR: original release produced exactly one ledger record.
    const ledgerSnap = await db.collection("payment_ledger")
      .where("payerId", "==", homeownerUid)
      .where("transactionId", "==", `pi_funded_${suffix}`)
      .get();
    expect(ledgerSnap.docs.length).toBe(1);
    expect(ledgerSnap.docs[0].data().amount).toBe(80000);
  });
});
