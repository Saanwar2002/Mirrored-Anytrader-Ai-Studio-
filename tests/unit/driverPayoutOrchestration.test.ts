import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeDriverPayoutOrchestrationCommand,
  DRIVER_BASE_SHARE_RATE,
  PLATFORM_COMMISSION_RATE,
} from "../../src/server/driverPayoutOrchestration.ts";

describe("AnyTrader V8.3 — Driver Payout Orchestration & Anti-Forgery Defense", () => {
  let mockStore: Record<string, any>;
  let mockDb: any;
  let mockStripe: any;
  let createdTransfers: any[];

  beforeEach(() => {
    mockStore = {};
    createdTransfers = [];

    // Helper to simulate Firestore document snapshots and queries
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
                            if (v && typeof v === "object" && "operand" in v) {
                              mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                            } else {
                              mockStore[path][k] = v;
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
            get: async () => ({
              exists: !!mockStore[path],
              data: () => mockStore[path] ? { ...mockStore[path] } : undefined,
            }),
            update: async (fields: any) => {
              if (!mockStore[path]) mockStore[path] = {};
              for (const [k, v] of Object.entries(fields)) {
                if (v && typeof v === "object" && "operand" in v) {
                  mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                } else {
                  mockStore[path][k] = v;
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
        const transaction = {
          get: async (ref: any) => {
            const path = Object.keys(mockStore).find((p) => p.endsWith(`/${ref.id}`));
            const data = path ? mockStore[path] : null;
            return {
              exists: !!data,
              data: () => data ? { ...data } : null,
            };
          },
          update: (ref: any, fields: any) => {
            const path = Object.keys(mockStore).find((p) => p.endsWith(`/${ref.id}`));
            if (path) {
              for (const [k, v] of Object.entries(fields)) {
                if (v && typeof v === "object" && "operand" in v) {
                  mockStore[path][k] = (mockStore[path][k] || 0) + (v as any).operand;
                } else {
                  mockStore[path][k] = v;
                }
              }
            }
          },
        };
        return await updateFn(transaction);
      },
    };

    mockStripe = {
      transfers: {
        create: vi.fn(async (payload: any, requestOptions?: any) => {
          createdTransfers.push({ payload, requestOptions });
          return {
            id: `tr_test_${Date.now()}`,
            amount: payload.amount,
            destination: payload.destination,
          };
        }),
      },
      paymentIntents: {
        retrieve: vi.fn(async (piId: string) => {
          if (piId === "pi_verified_123") {
            return {
              id: piId,
              status: "succeeded",
              amount_received: 5000,
            };
          }
          if (piId === "pi_unpaid_fail") {
            return {
              id: piId,
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

  it("Vulnerability 2 & 3: Rejects unverified fake ride without verified Stripe payment or ledger receipt", async () => {
    // Synthetic ride forged directly without Stripe PaymentIntent
    mockStore["ride_requests/ride_synthetic_fake"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 100.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      // Notice: NO stripePaymentIntentId and NO ledger transaction!
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(result.totalDisbursed).toBe(0);
    expect(createdTransfers.length).toBe(0);

    const rideInStore = mockStore["ride_requests/ride_synthetic_fake"];
    expect(rideInStore.payoutTransferred).toBe(false);
    expect(rideInStore.payoutStatus).toBe("rejected_unverified_payment");
  });

  it("Vulnerability 2 & 3: Rejects ride whose Stripe PaymentIntent is not succeeded", async () => {
    mockStore["ride_requests/ride_incomplete_pi"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_unpaid_fail",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.processedCount).toBe(0);
    expect(createdTransfers.length).toBe(0);
    expect(mockStore["ride_requests/ride_incomplete_pi"].payoutTransferred).toBe(false);
  });

  it("Vulnerability 4: On Stripe transfer failure, payoutTransferred REMAINS false and driver is NOT marked paid", async () => {
    mockStore["ride_requests/ride_legit_stripe_fails"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123",
    };

    // Simulate transient Stripe API error
    mockStripe.transfers.create.mockRejectedValueOnce(new Error("STRIPE_API_UNAVAILABLE"));

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.failedCount).toBe(1);
    expect(result.processedCount).toBe(0);

    const rideInStore = mockStore["ride_requests/ride_legit_stripe_fails"];
    // CRITICAL FIX: payoutTransferred MUST NOT be true!
    expect(rideInStore.payoutTransferred).toBe(false);
    expect(rideInStore.payoutStatus).toBe("failed");
    expect(rideInStore.payoutLastError).toContain("STRIPE_API_UNAVAILABLE");
    expect(rideInStore.payoutRetryCount).toBe(1);
  });

  it("Success Pathway: Successfully processes verified ride with server-authoritative 88/12 split and post-commit state", async () => {
    mockStore["ride_requests/ride_success_1"] = {
      status: "completed",
      paymentStatus: "paid",
      payoutTransferred: false,
      finalFare: 50.0,
      tipAmount: 5.0,
      assignedDriverId: "driver_legit",
      driverId: "driver_legit",
      stripePaymentIntentId: "pi_verified_123",
    };

    const result = await executeDriverPayoutOrchestrationCommand({
      db: mockDb,
      stripeClient: mockStripe,
    });

    expect(result.success).toBe(true);
    expect(result.processedCount).toBe(1);
    // Base fare: £50 * 0.88 = £44. Tip: £5. Total driver earnings: £49.00
    expect(result.totalDisbursed).toBe(49.0);

    expect(createdTransfers.length).toBe(1);
    const transferCall = createdTransfers[0];
    expect(transferCall.payload.amount).toBe(4900); // 4900 pence
    expect(transferCall.payload.destination).toBe("acct_driver_legit_123");
    expect(transferCall.requestOptions.idempotencyKey).toBe(
      "payout:ride:ride_success_1:driver_legit:4900"
    );

    const rideInStore = mockStore["ride_requests/ride_success_1"];
    expect(rideInStore.payoutTransferred).toBe(true);
    expect(rideInStore.payoutStatus).toBe("transferred");
    expect(rideInStore.stripeTransferId).toBeDefined();
    expect(rideInStore.calculatedDriverEarnings).toBe(49.0);
    expect(rideInStore.calculatedPlatformFee).toBe(6.0); // 12% of £50 = £6.00
  });

  it("Cross-Driver Protection: Rejects conflicting driverId and assignedDriverId", async () => {
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
    expect(mockStore["ride_requests/ride_conflict"].payoutStatus).toBe(
      "conflicting_driver_identity"
    );
  });

  it("Driver Eligibility: Fails closed if assigned user lacks driver credentials", async () => {
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

  it("Missing Stripe Destination: Fails closed and does not disburse if driver has not completed Stripe onboarding", async () => {
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
    const ride = mockStore["ride_requests/ride_no_stripe_dest"];
    expect(ride.payoutTransferred).toBe(false);
    expect(ride.payoutStatus).toBe("pending_stripe_onboarding");
  });

  it("Double-Settlement / Concurrency Protection: Skips ride if active lease is held by another worker", async () => {
    mockStore["ride_requests/ride_leased"] = {
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
});
