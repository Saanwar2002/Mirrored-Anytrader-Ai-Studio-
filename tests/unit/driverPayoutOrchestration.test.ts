import { describe, it, expect, beforeEach, vi } from "vitest";
import admin from "firebase-admin";
import {
  executeDriverPayoutOrchestrationCommand,
  DRIVER_BASE_SHARE_RATE,
  PLATFORM_COMMISSION_RATE,
  GOLD_DRIVER_COMMISSION_RATE,
  PAYOUT_LEASE_DURATION_MS,
} from "../../src/server/driverPayoutOrchestration.ts";

describe("AnyTrader V8.3 Task 35-G — Driver Payout Orchestration & Security Suite", () => {
  let mockStore: Record<string, any>;
  let mockDb: any;
  let mockStripe: any;
  let createdTransfers: any[];
  let transactionMutex: Promise<any>;
  let onOperationRead: (() => void) | undefined;

  const applyFieldValue = (v: any, fieldName?: string) => {
    if (v && typeof v === "object") {
      // Resolve delete sentinels before field-specific timestamp handling: dry-run
      // lease release deletes payoutLockedAt, while lease acquisition writes a timestamp.
      const methodName = typeof v._methodName === "string" ? v._methodName.toLowerCase() : "";
      if (methodName.includes("delete")) return undefined;
      if (typeof v.isEqual === "function" && v.isEqual(admin.firestore.FieldValue.delete())) return undefined;
      if ("operand" in v) return v.operand;
      if (methodName.includes("servertimestamp") || fieldName === "payoutLockedAt") return Date.now();
    }
    return v;
  };

  beforeEach(() => {
    mockStore = {};
    createdTransfers = [];
    transactionMutex = Promise.resolve();
    onOperationRead = undefined;

    // Helper to simulate Firestore document snapshots, queries, and atomic transactions
    mockDb = {
      collection: (colName: string) => ({
        where: (field: string, op: string, val: any) => {
          const filters = [{ field, op, val }];
          const queryObj = {
            where: (f2: string, o2: string, v2: any) => {
              filters.push({ field: f2, op: o2, val: v2 });
              return queryObj;
            },
            limit: (num: number) => queryObj,
            get: async () => {
              const matchingDocs: any[] = [];
              for (const [path, data] of Object.entries(mockStore)) {
                if (path.startsWith(`${colName}/`)) {
                  let match = true;
                  for (const f of filters) {
                    if (data[f.field] !== f.val) {
                      match = false;
                      break;
                    }
                  }
                  if (match) {
                    const docId = path.replace(`${colName}/`, "");
                    matchingDocs.push({
                      id: docId,
                      ref: {
                        id: docId,
                        update: async (fields: any) => {
                          if (!mockStore[path]) mockStore[path] = {};
                          for (const [k, v] of Object.entries(fields)) {
                            const resolved = applyFieldValue(v, k);
                            if (resolved === undefined) {
                              delete mockStore[path][k];
                            } else if (v && typeof v === "object" && "operand" in v) {
                              mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                            } else {
                              mockStore[path][k] = resolved;
                            }
                          }
                        },
                      },
                      data: () => ({ ...mockStore[path] }),
                    });
                  }
                }
              }
              return {
                empty: matchingDocs.length === 0,
                docs: matchingDocs,
              };
            },
          };
          return queryObj;
        },
        doc: (id: string) => {
          const path = `${colName}/${id}`;
          return {
            id,
            get: async () => {
              if (colName === "driver_payout_operations") onOperationRead?.();
              return {
                exists: !!mockStore[path],
                data: () => (mockStore[path] ? { ...mockStore[path] } : undefined),
              };
            },
            update: async (fields: any) => {
              if (!mockStore[path]) mockStore[path] = {};
              for (const [k, v] of Object.entries(fields)) {
                const resolved = applyFieldValue(v, k);
                if (resolved === undefined) {
                  delete mockStore[path][k];
                } else if (v && typeof v === "object" && "operand" in v) {
                  mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                } else {
                  mockStore[path][k] = resolved;
                }
              }
            },
            set: async (data: any, options?: any) => {
              if (options?.merge && mockStore[path]) {
                Object.assign(mockStore[path], data);
              } else {
                mockStore[path] = { ...data };
              }
            },
          };
        },
      }),
      runTransaction: async (updateFn: any) => {
        // Chain transactions through a mutex to simulate serializable Firestore transaction execution
        const currentOp = transactionMutex.then(async () => {
          const transaction = {
            get: async (ref: any) => {
              const path = Object.keys(mockStore).find((p) => p.endsWith(`/${ref.id}`));
              const data = path ? mockStore[path] : null;
              return {
                exists: !!data,
                data: () => (data ? { ...data } : null),
              };
            },
            update: (ref: any, fields: any) => {
              const path = Object.keys(mockStore).find((p) => p.endsWith(`/${ref.id}`));
              if (path) {
                for (const [k, v] of Object.entries(fields)) {
                  const resolved = applyFieldValue(v, k);
                  if (resolved === undefined) {
                    delete mockStore[path][k];
                  } else if (v && typeof v === "object" && "operand" in v) {
                    mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                  } else {
                    mockStore[path][k] = resolved;
                  }
                }
              }
            },
          };
          return await updateFn(transaction);
        });
        transactionMutex = currentOp.catch(() => {});
        return currentOp;
      },
    };

    mockStripe = {
      transfers: {
        create: vi.fn(async (payload: any, requestOptions?: any) => {
          createdTransfers.push({ payload, requestOptions });
          return {
            id: `tr_test_${Date.now()}_${createdTransfers.length}`,
            amount: payload.amount,
            destination: payload.destination,
            currency: payload.currency,
            metadata: payload.metadata,
          };
        }),
      },
      paymentIntents: {
        retrieve: vi.fn(async (piId: string) => {
          if (piId === "pi_verified_123") {
            return {
              id: piId,
              currency: "gbp",
              status: "succeeded",
              amount_received: 5500, // 5500 pence (£50 fare + £5 tip)
            };
          }
          if (piId === "pi_verified_5000") {
            return {
              id: piId,
              currency: "gbp",
              status: "succeeded",
              amount_received: 5000, // 5000 pence (£50 fare, 0 tip)
            };
          }
          if (piId === "pi_underpaid") {
            return {
              id: piId,
              currency: "gbp",
              status: "succeeded",
              amount_received: 1000, // Only £10 collected for £50 ride!
            };
          }
          if (piId === "pi_currency_usd") {
            return {
              id: piId,
              currency: "usd",
              status: "succeeded",
              amount_received: 5500,
            };
          }
          if (piId === "pi_unpaid_fail") {
            return {
              id: piId,
              currency: "gbp",
              status: "requires_payment_method",
              amount_received: 0,
            };
          }
          throw new Error("No such payment_intent");
        }),
      },
    };

    // Seed test users
    mockStore["users/driver_legit"] = {
      uid: "driver_legit",
      role: "driver",
      isDriver: true,
      stripeAccountId: "acct_driver_legit_123",
    };

    mockStore["users/driver_no_stripe"] = {
      uid: "driver_no_stripe",
      role: "driver",
      isDriver: true,
    };

    mockStore["users/attacker_consumer"] = {
      uid: "attacker_consumer",
      role: "consumer",
      isDriver: false,
      stripeAccountId: "acct_attacker_999",
    };
  });

  // =========================================================================
  // Finding 35G-1 & 35G-4: Authoritative Fare Contract & Payment Reconciliation
  // =========================================================================

  it("1. Finding 35G-1: PaymentIntent succeeded but underpaid (amount_received < expectedTotal) -> fails closed with zero transfer", async () => {
    mockStore["ride_requests/ride_underpaid"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_underpaid", // Collected only £10 instead of £55!
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(result.totalDisbursed).toBe(0);
    expect(createdTransfers.length).toBe(0);

    const rideInStore = mockStore["ride_requests/ride_underpaid"];
    expect(rideInStore.payoutTransferred).toBe(false);
    expect(rideInStore.payoutStatus).toBe("rejected_unverified_payment");
    expect(rideInStore.payoutLastError).toContain("Underpayment");
  });

  it("2. Finding 35G-1: PaymentIntent currency mismatch (e.g. 'usd' instead of 'gbp') -> fails closed with zero transfer", async () => {
    mockStore["ride_requests/ride_usd"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_currency_usd",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);

    const rideInStore = mockStore["ride_requests/ride_usd"];
    expect(rideInStore.payoutTransferred).toBe(false);
    expect(rideInStore.payoutStatus).toBe("rejected_unverified_payment");
    expect(rideInStore.payoutLastError).toContain("Currency mismatch");
  });

  it("3. Finding 35G-4: Missing authoritative finalFare (only client-editable fareEstimate or fare) -> rejected with zero transfer", async () => {
    mockStore["ride_requests/ride_no_final_fare"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      // Notice: NO finalFare! Only client-editable fareEstimate / fare:
      fareEstimate: 60.0,
      fare: 60.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);

    const rideInStore = mockStore["ride_requests/ride_no_final_fare"];
    expect(rideInStore.payoutTransferred).toBe(false);
    expect(rideInStore.payoutStatus).toBe("rejected_missing_authoritative_fare");
  });

  it("4. Finding 35G-1: Ledger fallback requires valid amount and 'gbp' currency (cannot guess or use defaults)", async () => {
    // Ledger entry with wrong currency ('eur' instead of 'gbp')
    mockStore["payment_ledger/ledger_1"] = {
      transactionId: "pi_ledger_test",
      status: "completed",
      captured: true,
      currency: "eur", // Wrong currency!
      amount: 5000,
    };

    mockStore["ride_requests/ride_ledger_fail"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_ledger_test",
    };

    // Stripe retrieve throws "No such payment_intent", triggering ledger fallback
    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_ledger_fail"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_ledger_fail"].payoutStatus).toBe("rejected_unverified_payment");
  });

  it("4a. Security Regression: Refund ledger entries cannot authorize a driver payout", async () => {
    mockStore["payment_ledger/refund_for_ride"] = {
      transactionId: "pi_refund_for_ride",
      type: "REFUND",
      status: "completed",
      captured: true,
      currency: "gbp",
      amount: 5500,
    };
    mockStore["ride_requests/ride_refund_ledger"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_refund_for_ride",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_refund_ledger"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_refund_ledger"].payoutStatus).toBe("rejected_unverified_payment");
  });

  it("4b. Ledger fallback accepts only an explicitly typed completed RIDE_PAYMENT receipt", async () => {
    mockStore["payment_ledger/ride_receipt"] = {
      transactionId: "pi_ride_ledger_fallback",
      type: "RIDE_PAYMENT",
      status: "completed",
      currency: "gbp",
      amount: 5500,
    };
    mockStore["ride_requests/ride_ledger_fallback_valid"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_ride_ledger_fallback",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(1);
    expect(createdTransfers.length).toBe(1);
    expect(createdTransfers[0].payload.amount).toBe(4900);
    expect(mockStore["ride_requests/ride_ledger_fallback_valid"].payoutTransferred).toBe(true);
  });

  it("5. Finding 35G-4: Client-mutated fareEstimate or fare cannot increase payout beyond authoritative finalFare", async () => {
    mockStore["ride_requests/ride_tampered_estimate"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0, // Authoritative: £50
      fareEstimate: 500.0, // Attacker inflated this to £500
      fare: 500.0,
      tipAmount: 0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000", // Paid £50
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(1);
    expect(createdTransfers.length).toBe(1);
    // Must strictly calculate from £50 * 0.88 = £44.00 (4400 pence), NOT from £500!
    expect(createdTransfers[0].payload.amount).toBe(4400);
    expect(result.totalDisbursed).toBe(44.0);
  });

  it("6. Finding 35G-1: Exact integer minor units (pence) calculation of 88% base fare + 100% tip", async () => {
    mockStore["ride_requests/ride_exact_split"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0, // Base fare £50
      tipAmount: 5.0,  // Tip £5
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123", // Paid £55 (5500p)
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(1);
    // £50 * 0.88 = £44.00 base + £5.00 tip = £49.00 (4900 pence)
    expect(result.totalDisbursed).toBe(49.0);

    expect(createdTransfers.length).toBe(1);
    const transfer = createdTransfers[0];
    expect(transfer.payload.amount).toBe(4900);
    expect(transfer.payload.currency).toBe("gbp");
    expect(transfer.payload.destination).toBe("acct_driver_legit_123");
    expect(transfer.requestOptions.idempotencyKey).toBe(
      "payout:ride:ride_exact_split:driver_legit:4900"
    );

    const rideInStore = mockStore["ride_requests/ride_exact_split"];
    expect(rideInStore.payoutTransferred).toBe(true);
    expect(rideInStore.payoutStatus).toBe("transferred");
    expect(rideInStore.calculatedDriverEarnings).toBe(49.0);
    expect(rideInStore.calculatedPlatformFee).toBe(6.0); // £50 * 0.12 = £6.00
  });

  // =========================================================================
  // Finding 35G-2 & 35G-3: Transactional Concurrency & Race Condition Defense
  // =========================================================================

  it("7. Finding 35G-3: Two simultaneous workers racing against one unlocked ride -> exactly 1 lease acquired and 1 Stripe transfer", async () => {
    mockStore["ride_requests/ride_concurrent_race"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123",
    };

    // Run two orchestrator invocations in parallel
    const [resultWorker1, resultWorker2] = await Promise.all([
      executeDriverPayoutOrchestrationCommand({
        db: mockDb,
        stripeClient: mockStripe,
      }),
      executeDriverPayoutOrchestrationCommand({
        db: mockDb,
        stripeClient: mockStripe,
      }),
    ]);

    // Exactly one worker may transfer. Depending on scheduling, the competing
    // worker either observes the active lease and skips, or its initial query
    // runs after payoutTransferred is committed and finds no eligible ride.
    const totalProcessed = resultWorker1.processedCount + resultWorker2.processedCount;
    const totalSkipped = resultWorker1.skippedCount + resultWorker2.skippedCount;
    const totalFailed = resultWorker1.failedCount + resultWorker2.failedCount;

    expect(totalProcessed).toBe(1);
    expect(totalFailed).toBe(0);
    expect(totalSkipped).toBeLessThanOrEqual(1);
    expect(createdTransfers.length).toBe(1);

    const rideInStore = mockStore["ride_requests/ride_concurrent_race"];
    expect(rideInStore.payoutTransferred).toBe(true);
    expect(rideInStore.payoutStatus).toBe("transferred");
  });

  it("8. Finding 35G-2: Worker that loses its payoutClaimToken cannot finalize the post-commit state", async () => {
    mockStore["ride_requests/ride_lost_token"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123",
    };

    // Intercept Stripe call and tamper with the claim token before post-commit
    mockStripe.transfers.create.mockImplementationOnce(async (payload: any, options: any) => {
      mockStore["ride_requests/ride_lost_token"].payoutClaimToken = "hijacked_or_expired_token";
      return {
        id: "tr_interrupted_123",
        amount: payload.amount,
        destination: payload.destination,
        currency: payload.currency,
        metadata: payload.metadata,
      };
    });

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    // Payout finalization was rejected because claim token was lost!
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(mockStore["ride_requests/ride_lost_token"].payoutTransferred).toBe(false);
  });

  it("9. Finding 35G-3: Pre-existing active lease (< 5 minutes old) is skipped cleanly", async () => {
    mockStore["ride_requests/ride_active_lease"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 40.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      payoutStatus: "processing",
      payoutLockedAt: Date.now() - 60000, // 1 minute ago (< 5m lease)
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(createdTransfers.length).toBe(0);
  });

  it("10. Finding 35G-2 & 35G-3: Stale lease (> 5 minutes old) allows safe takeover and payout completion", async () => {
    mockStore["ride_requests/ride_stale_lease"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      payoutStatus: "processing",
      payoutLockedAt: Date.now() - (PAYOUT_LEASE_DURATION_MS + 60000), // 6 minutes ago (expired!)
      payoutClaimToken: "old_stale_token",
      stripePaymentIntentId: "pi_verified_5000",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(1);
    expect(createdTransfers.length).toBe(1);

    const rideInStore = mockStore["ride_requests/ride_stale_lease"];
    expect(rideInStore.payoutTransferred).toBe(true);
    expect(rideInStore.payoutStatus).toBe("transferred");
    expect(rideInStore.payoutClaimToken).not.toBe("old_stale_token");
  });

  it("11. Idempotency & Safe Retry: On Stripe failure, payoutTransferred remains false and retry uses identical idempotency key", async () => {
    mockStore["ride_requests/ride_retry_key"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000",
    };

    // First attempt fails at Stripe
    mockStripe.transfers.create.mockRejectedValueOnce(new Error("STRIPE_RATE_LIMIT"));

    const result1 = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result1.failedCount).toBe(1);
    expect(mockStore["ride_requests/ride_retry_key"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_retry_key"].payoutStatus).toBe("failed");
    expect(mockStore["ride_requests/ride_retry_key"].payoutRetryCount).toBe(1);

    // A failed/ambiguous external request is now fenced for reconciliation; do not replay automatically
    const result2 = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result2.processedCount).toBe(0);
    expect(result2.details.some((d) => d.status === "reconciliation_required")).toBe(true);
    expect(createdTransfers).toHaveLength(0); // Stripe was called once and rejected; no successful transfer receipt exists
    expect(mockStore["ride_requests/ride_retry_key"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_retry_key"].payoutStatus).toBe("reconciliation_required");
  });

  // =========================================================================
  // Baseline Security Invariants & Regressions
  // =========================================================================

  it("12. Security Regression: Rejects synthetic forged ride without Stripe PaymentIntent or ledger receipt", async () => {
    mockStore["ride_requests/ride_synthetic_fake"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 100.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      // NO stripePaymentIntentId and NO ledger transaction!
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_synthetic_fake"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_synthetic_fake"].payoutStatus).toBe("rejected_unverified_payment");
  });

  it("13. Security Regression: Rejects conflicting driverId and assignedDriverId", async () => {
    mockStore["ride_requests/ride_conflict"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 40.0,
      assignedDriverId: "driver_legit",
      driverId: "attacker_consumer", // Conflicting!
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_conflict"].payoutStatus).toBe("conflicting_driver_identity");
  });

  it("14. Security Regression: Fails closed if assigned user lacks driver credentials", async () => {
    mockStore["ride_requests/ride_non_driver"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 40.0,
      assignedDriverId: "attacker_consumer",
      driverId: "attacker_consumer",
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_non_driver"].payoutStatus).toBe("driver_ineligible");
  });

  it("15. Security Regression: Fails closed if driver has not completed Stripe onboarding", async () => {
    mockStore["ride_requests/ride_no_stripe_dest"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 40.0,
      assignedDriverId: "driver_no_stripe",
      driverId: "driver_no_stripe",
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_no_stripe_dest"].payoutTransferred).toBe(false);
    expect(mockStore["ride_requests/ride_no_stripe_dest"].payoutStatus).toBe("pending_stripe_onboarding");
  });
  it("16. Gold Driver entitlement applies 10% commission to base fare, keeps full tip, and persists tier audit fields", async () => {
    mockStore["users/driver_gold"] = {
      uid: "driver_gold",
      role: "driver",
      isDriver: true,
      stripeAccountId: "acct_driver_gold_123",
      isGoldDriver: true,
      driverTier: "gold",
      driverSubscriptionId: "sub_gold_active",
      driverSubscriptionStatus: "active",
      commissionRate: 0.10,
    };
    mockStore["ride_requests/ride_gold_commission"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_gold",
      driverId: "driver_gold",
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });

    expect(result.processedCount).toBe(1);
    expect(createdTransfers).toHaveLength(1);
    expect(createdTransfers[0].payload.amount).toBe(5000); // £45 base share + £5 tip
    expect(createdTransfers[0].payload.metadata.commissionRate).toBe(String(GOLD_DRIVER_COMMISSION_RATE));
    expect(createdTransfers[0].payload.metadata.driverTier).toBe("gold");
    const completedRide = mockStore["ride_requests/ride_gold_commission"];
    expect(completedRide.appliedCommissionRate).toBe(GOLD_DRIVER_COMMISSION_RATE);
    expect(completedRide.appliedDriverTier).toBe("gold");
    expect(completedRide.platformFee).toBe(5);
    expect(completedRide.driverEarnings).toBe(50);
  });

  it("17. Gold flags without a live subscription ID/status cannot lower the standard commission", async () => {
    mockStore["users/driver_gold_stale"] = {
      uid: "driver_gold_stale",
      role: "driver",
      isDriver: true,
      stripeAccountId: "acct_driver_gold_stale",
      isGoldDriver: true,
      commissionRate: 0.10,
      driverSubscriptionStatus: "canceled",
    };
    mockStore["ride_requests/ride_gold_stale"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_gold_stale",
      driverId: "driver_gold_stale",
      stripePaymentIntentId: "pi_verified_5000",
    };

    await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });

    expect(createdTransfers[0].payload.amount).toBe(4400);
    expect(createdTransfers[0].payload.metadata.commissionRate).toBe(String(PLATFORM_COMMISSION_RATE));
    expect(mockStore["ride_requests/ride_gold_stale"].appliedDriverTier).toBe("standard");
  });

  it("18. Dry run releases its own lease and does not leave the ride processing", async () => {
    mockStore["ride_requests/ride_dry_run"] = {
      status: "completed", paymentStatus: "paid", payoutTransferred: false,
      finalFare: 50, assignedDriverId: "driver_legit", driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb, stripeClient: mockStripe, dryRun: true,
    });

    const ride = mockStore["ride_requests/ride_dry_run"];
    expect(result.processedCount).toBe(1);
    expect(createdTransfers).toHaveLength(0);
    expect(ride.payoutStatus).toBe("pending");
    expect(ride.payoutClaimToken).toBeUndefined();
    expect(ride.payoutLockedAt).toBeUndefined();
  });

  it("19. Stale payout worker cannot overwrite successor claim on Stripe failure", async () => {
    mockStore["ride_requests/ride_stale_failure"] = {
      status: "completed", paymentStatus: "paid", payoutTransferred: false,
      finalFare: 50, assignedDriverId: "driver_legit", driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000",
    };
    mockStripe.transfers.create.mockImplementationOnce(async () => {
      mockStore["ride_requests/ride_stale_failure"].payoutClaimToken = "successor_claim";
      mockStore["ride_requests/ride_stale_failure"].payoutStatus = "processing";
      throw new Error("STRIPE_RATE_LIMIT");
    });

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb, stripeClient: mockStripe,
    });

    const ride = mockStore["ride_requests/ride_stale_failure"];
    expect(result.failedCount).toBe(1);
    expect(ride.payoutClaimToken).toBe("successor_claim");
    expect(ride.payoutStatus).toBe("processing");
    expect(ride.payoutLastError).toBeUndefined();
    expect(ride.payoutTransferred).toBe(false);
  });

  it("20. Successful Stripe transfer with lost lease reports transfer ID for reconciliation and preserves successor state", async () => {
    mockStore["ride_requests/ride_success_lost_claim"] = { status: "completed", paymentStatus: "paid", payoutTransferred: false, finalFare: 50, assignedDriverId: "driver_legit", driverId: "driver_legit", stripePaymentIntentId: "pi_verified_5000" };
    mockStripe.transfers.create.mockImplementationOnce(async (payload: any) => {
      mockStore["ride_requests/ride_success_lost_claim"].payoutClaimToken = "successor_claim";
      mockStore["ride_requests/ride_success_lost_claim"].payoutStatus = "processing";
      return { id: "tr_ambiguous_456", amount: payload.amount, currency: payload.currency, destination: payload.destination, metadata: payload.metadata };
    });
    const result = await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });
    const ride = mockStore["ride_requests/ride_success_lost_claim"];
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.details[0].status).toBe("reconciliation_required");
    expect(result.details[0].transferId).toBe("tr_ambiguous_456");
    expect(result.details[0].reason).toContain("Reconcile this transfer");
    expect(ride.payoutClaimToken).toBe("successor_claim");
    expect(ride.payoutStatus).toBe("processing");
    expect(ride.payoutTransferred).toBe(false);
    expect(ride.stripeTransferId).toBeUndefined();
    const operation = Object.values(mockStore).find((entry: any) => entry?.rideId === "ride_success_lost_claim" && entry?.operationId);
    expect(operation).toBeDefined();
    expect(operation.status).toBe("stripe_succeeded");
    expect(operation.stripeTransferId).toBe("tr_ambiguous_456");
    // Simulate the successor lease expiring and the ride returning to the eligible queue.
    // The next worker must encounter the durable operation barrier before Stripe.
    ride.payoutStatus = "completed";
    ride.payoutLockedAt = Date.now() - PAYOUT_LEASE_DURATION_MS - 1000;
    const retry = await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });
    expect(retry.details.some((detail) => detail.status === "reconciliation_required")).toBe(true);
    expect(mockStripe.transfers.create).toHaveBeenCalledTimes(1); // one successful external effect; replay was fenced
    expect(createdTransfers).toHaveLength(0); // custom mockImplementation bypasses the default receipt recorder
  });


  it("existing payout operation does not let a stale worker overwrite successor ride state", async () => {
    const rideId = "ride_existing_operation_stale_worker";
    const operationId = "660f36fcfeb323f6d0d480741cdf45c05d24d9fb8078cee904685507df3a642c";
    mockStore[`ride_requests/${rideId}`] = {
      status: "completed", paymentStatus: "paid", payoutTransferred: false,
      finalFare: 50, assignedDriverId: "driver_legit", driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000",
    };
    mockStore[`driver_payout_operations/${operationId}`] = {
      operationId, rideId, driverId: "driver_legit", amountPence: 4400,
      currency: "gbp", status: "prepared", idempotencyKey: "existing-operation",
    };
    onOperationRead = () => {
      const ride = mockStore[`ride_requests/${rideId}`];
      ride.payoutClaimToken = "successor_claim";
      ride.payoutStatus = "processing";
      ride.payoutLastError = "successor-owned diagnostic";
    };

    const result = await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });
    const ride = mockStore[`ride_requests/${rideId}`];

    expect(result.failedCount).toBe(1);
    expect(result.details.some((detail) => detail.status === "reconciliation_required")).toBe(true);
    expect(ride.payoutClaimToken).toBe("successor_claim");
    expect(ride.payoutStatus).toBe("processing");
    expect(ride.payoutLastError).toBe("successor-owned diagnostic");
    expect(ride.payoutTransferred).toBe(false);
    expect(mockStripe.transfers.create).not.toHaveBeenCalled();
  });

  it("rejects a Stripe transfer receipt that does not match requested amount and fences replay", async () => {
    mockStore["ride_requests/ride_bad_transfer_receipt"] = {
      status: "completed", paymentStatus: "paid", payoutTransferred: false,
      finalFare: 50, assignedDriverId: "driver_legit", driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_5000",
    };
    mockStripe.transfers.create.mockImplementationOnce(async (payload: any) => ({
      id: "tr_mismatched_receipt", amount: payload.amount - 1,
      currency: payload.currency, destination: payload.destination, metadata: payload.metadata,
    }));
    const result = await executeDriverPayoutOrchestrationCommand({ db: mockDb, stripeClient: mockStripe });
    const ride = mockStore["ride_requests/ride_bad_transfer_receipt"];
    const operationId = Object.keys(mockStore).find((key) => key.startsWith("driver_payout_operations/"));
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(ride.payoutTransferred).toBe(false);
    expect(ride.payoutStatus).toBe("failed");
    expect(mockStore[operationId!].status).toBe("reconciliation_required");
    expect(mockStripe.transfers.create).toHaveBeenCalledTimes(1);
  });

});
