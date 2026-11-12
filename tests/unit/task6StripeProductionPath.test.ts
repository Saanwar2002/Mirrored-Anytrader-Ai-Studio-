import { describe, it, beforeEach, expect, vi } from "vitest";
import { PaymentLedgerEngine } from "../../src/server/paymentLedger.ts";

describe("Task 6: Real Production-Path Stripe Escrow Transfer Contract Suite", () => {
  let db: any;
  const jobId = "job_stripe_prod_101";
  const quoteId = "quote_stripe_prod_202";
  const milestoneId = "milestone_phase_1";
  const authUid = "homeowner_alice";
  const traderId = "trader_dave";
  const traderStripeAccountId = "acct_1NZABC123456789";
  const idempotencyKey = "op_rel_stripe_prod_key_777";

  beforeEach(() => {
    const store: Record<string, any> = {};

    db = {
      _store: store,
      collection: (colName: string) => ({
        doc: (docId: string) => {
          const path = `${colName}/${docId}`;
          return {
            id: docId,
            path,
            get: async () => ({
              exists: !!store[path],
              data: () => store[path],
              id: docId,
            }),
            set: async (data: any, opts?: any) => {
              if (opts?.merge && store[path]) {
                store[path] = { ...store[path], ...data };
              } else {
                store[path] = { ...data };
              }
            },
            update: async (data: any) => {
              if (!store[path]) throw new Error(`Document ${path} not found`);
              store[path] = { ...store[path], ...data };
            },
            delete: async () => {
              delete store[path];
            },
            collection: (subColName: string) => ({
              doc: (subDocId: string) => {
                const subPath = `${path}/${subColName}/${subDocId}`;
                return {
                  id: subDocId,
                  path: subPath,
                  get: async () => ({
                    exists: !!store[subPath],
                    data: () => store[subPath],
                    id: subDocId,
                  }),
                  set: async (data: any) => {
                    store[subPath] = { ...data };
                  },
                  update: async (data: any) => {
                    if (!store[subPath]) throw new Error(`Document ${subPath} not found`);
                    store[subPath] = { ...store[subPath], ...data };
                  },
                };
              },
            }),
          };
        },
        where: (field: string, op: string, value: any) => ({
          get: async () => {
            const docs = Object.entries(store)
              .filter(([k, v]) => k.startsWith(`${colName}/`) && v && v[field] === value)
              .map(([k, v]) => ({
                id: k.split("/")[1],
                data: () => v,
                ref: {
                  update: async (data: any) => {
                    store[k] = { ...store[k], ...data };
                  },
                },
              }));
            return {
              empty: docs.length === 0,
              docs,
            };
          },
        }),
      }),
      runTransaction: async (txHandler: (transaction: any) => Promise<any>) => {
        const tx = {
          get: async (ref: any) => ref.get(),
          set: (ref: any, data: any, opts?: any) => ref.set(data, opts),
          update: (ref: any, data: any) => ref.update(data),
          delete: (ref: any) => ref.delete(),
        };
        return txHandler(tx);
      },
    };

    // Seed database with Job, Quote, and Trader User
    db._store[`jobs/${jobId}`] = {
      id: jobId,
      jobNo: "JOB-101",
      homeownerId: authUid,
      userId: authUid,
      acceptedTradespersonId: traderId,
      acceptedQuoteId: quoteId,
      status: "in_progress",
    };

    db._store[`jobs/${jobId}/quotes/${quoteId}`] = {
      id: quoteId,
      jobId,
      tradespersonId: traderId,
      status: "accepted",
      milestones: [
        {
          id: milestoneId,
          title: "Foundation Phase",
          amount: 500, // £500
          status: "funded",
          escrowFunded: true,
          stripePaymentIntentId: "pi_funded_101",
        },
      ],
    };

    db._store[`users/${traderId}`] = {
      id: traderId,
      name: "Dave The Builder",
      stripeAccountId: traderStripeAccountId,
    };
  });

  it("Contract A: Proves Firestore DB release commit occurs strictly before Stripe transfer is called", async () => {
    const executionTimeline: string[] = [];

    // Track DB transaction commit
    const originalRunTransaction = db.runTransaction;
    db.runTransaction = async (fn: any) => {
      executionTimeline.push("firestore_transaction_start");
      const res = await originalRunTransaction(fn);
      executionTimeline.push("firestore_transaction_committed");
      return res;
    };

    const mockStripe = {
      transfers: {
        create: vi.fn().mockImplementation(async (params: any) => {
          executionTimeline.push("stripe_transfer_create");
          return { id: "tr_contract_test_1", amount: params.amount, currency: params.currency, destination: params.destination, metadata: params.metadata };
        }),
      },
    };

    // 1. Execute DB release
    const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid,
      idempotencyKey,
    });

    expect(releaseResult.success).toBe(true);
    expect(releaseResult.releasedAmount).toBe(500);

    // 2. Execute Production Stripe Transfer Helper
    const transferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
        jobNo: releaseResult.jobNo,
        stripePaymentIntentId: releaseResult.stripePaymentIntentId,
        isDestinationCharge: releaseResult.isDestinationCharge,
      },
      { stripe: mockStripe }
    );

    expect(transferResult.transferStatus).toBe("completed");
    expect(transferResult.stripeTransferId).toBe("tr_contract_test_1");

    // Strictly verify execution order: All database transactions MUST commit BEFORE Stripe transfer!
    expect(executionTimeline.at(-1)).toBe("stripe_transfer_create");
    expect(executionTimeline.filter((event) => event === "firestore_transaction_committed").length).toBeGreaterThanOrEqual(3);

    const lastTxCommittedIdx = executionTimeline.lastIndexOf("firestore_transaction_committed");
    const stripeTransferIdx = executionTimeline.indexOf("stripe_transfer_create");
    expect(lastTxCommittedIdx).toBeLessThan(stripeTransferIdx);
  });

  it("Contract B: Generates deterministic Stripe idempotency key on all invocations and retries", async () => {
    const capturedIdempotencyKeys: string[] = [];

    const mockStripe = {
      transfers: {
        create: vi.fn().mockImplementation(async (params: any, options: any) => {
          capturedIdempotencyKeys.push(options.idempotencyKey);
          return { id: "tr_idemp_test", amount: params.amount, currency: params.currency, destination: params.destination, metadata: params.metadata };
        }),
      },
    };

    // Call 1
    const res1 = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId,
        netPayoutPence: 44000,
        targetMilestoneTitle: "Foundation Phase",
      },
      { stripe: mockStripe }
    );

    // Call 2 (Retry)
    const res2 = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId,
        netPayoutPence: 44000,
        targetMilestoneTitle: "Foundation Phase",
      },
      { stripe: mockStripe }
    );

    const expectedStripeKey = `release:${jobId}:${quoteId}:${milestoneId}:${idempotencyKey}`;
    expect(res1.stripeIdempotencyKey).toBe(expectedStripeKey);
    expect(res2.stripeIdempotencyKey).toBe(expectedStripeKey);
    expect(capturedIdempotencyKeys).toEqual([expectedStripeKey, expectedStripeKey]);
  });

  it("Contract C: Stripe success records transfer ID and completed status on ledger without duplicate entries", async () => {
    // 1. Commit milestone release
    const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid,
      idempotencyKey,
    });

    const mockStripe = {
      transfers: {
        create: vi.fn().mockImplementation(async (params: any) => ({ id: "tr_prod_success_999", amount: params.amount, currency: params.currency, destination: params.destination, metadata: params.metadata })),
      },
    };

    // 2. Execute Stripe transfer
    const transferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
        jobNo: releaseResult.jobNo,
      },
      { stripe: mockStripe }
    );

    expect(transferResult.transferStatus).toBe("completed");
    expect(transferResult.stripeTransferId).toBe("tr_prod_success_999");

    // 3. Verify ledger record
    const ledgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", idempotencyKey).get();
    expect(ledgerSnap.docs.length).toBe(1);
    const ledgerData = ledgerSnap.docs[0].data();
    expect(ledgerData.stripeTransferId).toBe("tr_prod_success_999");
    expect(ledgerData.transferStatus).toBe("completed");
    expect(ledgerData.transferCompletedAt).toBeDefined();
  });

  it("Contract D: Stripe transient failure marks ledger failed without rolling back Firestore release, and allows clean retry", async () => {
    // 1. Commit milestone release in DB
    const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid,
      idempotencyKey,
    });
    expect(releaseResult.success).toBe(true);

    // 2. Stripe fails with transient network timeout
    const failingStripe = {
      transfers: {
        create: vi.fn().mockRejectedValue(new Error("Stripe API Timeout / Connection Reset")),
      },
    };

    const failedTransferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
      },
      { stripe: failingStripe }
    );

    // Verify explicit failed status returned
    expect(failedTransferResult.transferStatus).toBe("reconciliation_required");
    expect(failedTransferResult.error).toContain("Stripe API Timeout");

    // Verify Firestore state: Milestone is STILL released (not rolled back)
    const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
    const milestone = quoteSnap.data()?.milestones.find((m: any) => m.id === milestoneId);
    expect(milestone.status).toBe("funds_released");

    // Verify ledger: exactly 1 entry, marked failed with error message
    const ledgerSnap1 = await db.collection("payment_ledger").where("idempotencyKey", "==", idempotencyKey).get();
    expect(ledgerSnap1.docs.length).toBe(1);
    expect(ledgerSnap1.docs[0].data().transferStatus).toBe("reconciliation_required");
    expect(ledgerSnap1.docs[0].data().transferError).toContain("Stripe API Timeout");

    // 3. Retry when Stripe is back online
    const recoveredStripe = {
      transfers: {
        create: vi.fn().mockImplementation(async (params: any) => ({ id: "tr_recovered_post_retry_101", amount: params.amount, currency: params.currency, destination: params.destination, metadata: params.metadata })),
      },
    };

    const retryTransferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
      },
      { stripe: recoveredStripe }
    );

    expect(retryTransferResult.transferStatus).toBe("completed");
    expect(retryTransferResult.stripeTransferId).toBe("tr_recovered_post_retry_101");

    // Verify ledger is now marked completed, with zero duplicate ledger entries
    const ledgerSnap2 = await db.collection("payment_ledger").where("idempotencyKey", "==", idempotencyKey).get();
    expect(ledgerSnap2.docs.length).toBe(1);
    expect(ledgerSnap2.docs[0].data().transferStatus).toBe("completed");
    expect(ledgerSnap2.docs[0].data().stripeTransferId).toBe("tr_recovered_post_retry_101");
  });

  it("Contract E: Stripe timeout / ambiguous result passes identical idempotency key on retry for safe deduplication", async () => {
    // 1. Commit milestone release
    const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid,
      idempotencyKey,
    });

    const capturedKeys: string[] = [];

    // Stripe mock that times out on call 1 (after creating transfer internally)
    // and returns existing transfer on call 2 with the same idempotency key
    let callCount = 0;
    const idempotentStripeMock = {
      transfers: {
        create: vi.fn().mockImplementation(async (_params: any, opts: any) => {
          capturedKeys.push(opts.idempotencyKey);
          callCount++;
          if (callCount === 1) {
            throw new Error("HTTP 504 Gateway Timeout from Stripe");
          }
          return { id: "tr_deduped_999", amount: _params.amount, currency: _params.currency, destination: _params.destination, metadata: _params.metadata };
        }),
      },
    };

    // Attempt 1: Times out
    const res1 = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
      },
      { stripe: idempotentStripeMock }
    );
    expect(res1.transferStatus).toBe("reconciliation_required");

    // Attempt 2: Retry
    const res2 = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
      },
      { stripe: idempotentStripeMock }
    );
    expect(res2.transferStatus).toBe("completed");
    expect(res2.stripeTransferId).toBe("tr_deduped_999");

    // Verify both attempts sent the EXACT same idempotency key
    const expectedKey = `release:${jobId}:${quoteId}:${milestoneId}:${idempotencyKey}`;
    expect(capturedKeys[0]).toBe(expectedKey);
    expect(capturedKeys[1]).toBe(expectedKey);
  });

  it("Contract F: Proves trader notifications accurately reflect Stripe transfer state without misleading titles", () => {
    // 1. Stripe Success
    const successNotif = PaymentLedgerEngine.formatReleaseNotification({
      transferStatus: "completed",
      jobNo: "JOB-101",
      targetMilestoneTitle: "Plumbing Stage",
      isQrHandshake: false,
    });
    expect(successNotif.title).toBe("Funds Released! 💸");
    expect(successNotif.message).toContain("Funds transferred to your Stripe account");

    // 2. Stripe Failure
    const failedNotif = PaymentLedgerEngine.formatReleaseNotification({
      transferStatus: "failed",
      jobNo: "JOB-101",
      targetMilestoneTitle: "Plumbing Stage",
      isQrHandshake: false,
    });
    expect(failedNotif.title).not.toBe("Funds Released! 💸");
    expect(failedNotif.title).toBe("Release Recorded (Payout Pending Retry) ⚠️");
    expect(failedNotif.message).toContain("payout transfer is pending retry");

    // 3. QR Handshake with Stripe Failure
    const qrFailedNotif = PaymentLedgerEngine.formatReleaseNotification({
      transferStatus: "failed",
      jobNo: "JOB-101",
      targetMilestoneTitle: "Plumbing Stage",
      isQrHandshake: true,
    });
    expect(qrFailedNotif.title).toBe("Work Verified (Payout Pending) ⚠️");
    expect(qrFailedNotif.message).toContain("Payout transfer encountered an issue and will be retried");

    // 4. No Stripe Configuration / Mock Account
    const noStripeNotif = PaymentLedgerEngine.formatReleaseNotification({
      transferStatus: "skipped_no_stripe",
      jobNo: "JOB-101",
      targetMilestoneTitle: "Plumbing Stage",
      isQrHandshake: false,
    });
    expect(noStripeNotif.title).toBe("Milestone Approved & Escrow Released 📋");
    expect(noStripeNotif.message).toContain("escrow release recorded on platform");
  });

  it("Contract G: Full Release Lifecycle maintains committed Firestore state while delivering accurate status in failure scenario", async () => {
    // 1. Commit Firestore release
    const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
      jobId,
      quoteId,
      milestoneId,
      authUid,
      idempotencyKey,
    });
    expect(releaseResult.success).toBe(true);

    // 2. Simulate Stripe network rejection
    const rejectingStripe = {
      transfers: {
        create: vi.fn().mockRejectedValue(new Error("503 Service Unavailable: Stripe Connect Maintenance")),
      },
    };

    const stripeResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
      db,
      {
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey,
        traderId: releaseResult.traderId,
        netPayoutPence: releaseResult.netPayoutPence,
        targetMilestoneTitle: releaseResult.targetMilestoneTitle,
      },
      { stripe: rejectingStripe }
    );

    // 3. Format Notification
    const notif = PaymentLedgerEngine.formatReleaseNotification({
      transferStatus: stripeResult.transferStatus,
      isQrHandshake: false,
      jobNo: releaseResult.jobNo,
      targetMilestoneTitle: releaseResult.targetMilestoneTitle,
    });

    // 4. Verify Invariants:
    // a. Firestore milestone is still released
    const quoteDoc = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
    expect(quoteDoc.data()?.milestones[0].status).toBe("funds_released");

    // b. Ledger records failed transfer
    const ledgerDoc = (await db.collection("payment_ledger").where("idempotencyKey", "==", idempotencyKey).get()).docs[0].data();
    expect(ledgerDoc.transferStatus).toBe("reconciliation_required");
    expect(ledgerDoc.transferError).toContain("503 Service Unavailable");

    // c. Notification is NOT misleading
    expect(notif.title).toBe("Payout Outcome Requires Reconciliation ⚠️");
    expect(notif.message).toContain("pending reconciliation");
    expect(notif.title).not.toContain("Funds Released!");
  });
});
