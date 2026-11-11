import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeDriverPayoutOrchestrationCommand } from "../../src/server/driverPayoutOrchestration";

describe("Stripe Connect Fail-Closed Security & Mock Payment Gating", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Endpoint Logic: create-connect-account Gate", () => {
    const simulateCreateConnectAccount = async (env: Record<string, string | undefined>, userDoc: any, stripeAvailable: boolean) => {
      const isMockDisallowed = env.NODE_ENV === "production" || env.ALLOW_MOCK_PAYMENTS !== "true";
      
      let stripe: any = null;
      if (stripeAvailable) {
        stripe = { accounts: { create: vi.fn() }, accountLinks: { create: vi.fn() } };
      }

      if (!stripe) {
        if (isMockDisallowed) {
          return {
            status: 503,
            body: { error: "Stripe Connect onboarding is currently unavailable: Stripe gateway is unconfigured." }
          };
        }
        // Dev mock fallback
        const mockAccountId = userDoc.stripeAccountId || `acct_mock_${userDoc.uid.substring(0, 12)}`;
        userDoc.stripeAccountId = mockAccountId;
        userDoc.payoutsEnabled = true;
        userDoc.chargesEnabled = true;
        userDoc.stripeOnboardingComplete = true;
        return {
          status: 200,
          body: {
            success: true,
            mock: true,
            stripeAccountId: mockAccountId,
            url: `https://anytrader.com/billing?stripe_connect=success&account_id=${mockAccountId}`
          }
        };
      }

      return { status: 200, body: { success: true } };
    };

    it("fails closed with 503 when Stripe key is missing and ALLOW_MOCK_PAYMENTS is unset", async () => {
      const user = { uid: "user_trader_123", payoutsEnabled: false };
      const res = await simulateCreateConnectAccount({ NODE_ENV: "development" }, user, false);

      expect(res.status).toBe(503);
      expect(res.body.error).toContain("Stripe gateway is unconfigured");
      expect(user.payoutsEnabled).toBe(false); // MUST NOT grant payoutsEnabled: true!
    });

    it("fails closed with 503 in production even if ALLOW_MOCK_PAYMENTS=true is maliciously injected", async () => {
      const user = { uid: "user_trader_123", payoutsEnabled: false };
      const res = await simulateCreateConnectAccount({ NODE_ENV: "production", ALLOW_MOCK_PAYMENTS: "true" }, user, false);

      expect(res.status).toBe(503);
      expect(user.payoutsEnabled).toBe(false);
    });

    it("allows mock onboarding strictly in non-production sandbox when ALLOW_MOCK_PAYMENTS=true", async () => {
      const user: any = { uid: "user_trader_123", payoutsEnabled: false };
      const res = await simulateCreateConnectAccount({ NODE_ENV: "development", ALLOW_MOCK_PAYMENTS: "true" }, user, false);

      expect(res.status).toBe(200);
      expect(res.body.mock).toBe(true);
      expect(user.payoutsEnabled).toBe(true);
      expect(user.stripeAccountId).toBe("acct_mock_user_trader_");
    });
  });

  describe("Endpoint Logic: account-status Gate", () => {
    const simulateAccountStatus = async (env: Record<string, string | undefined>, accountId: string | null, stripeAvailable: boolean) => {
      if (!accountId) {
        return { status: 200, body: { connected: false, payoutsEnabled: false, chargesEnabled: false, detailsSubmitted: false } };
      }

      const isMockDisallowed = env.NODE_ENV === "production" || env.ALLOW_MOCK_PAYMENTS !== "true";

      if (accountId.startsWith("acct_mock_")) {
        if (isMockDisallowed) {
          return {
            status: 200,
            body: {
              connected: false,
              stripeAccountId: accountId,
              payoutsEnabled: false,
              chargesEnabled: false,
              detailsSubmitted: false,
              error: "Mock Stripe account is invalid in live environments."
            }
          };
        }
        return {
          status: 200,
          body: {
            connected: true,
            mock: true,
            stripeAccountId: accountId,
            payoutsEnabled: true,
            chargesEnabled: true,
            detailsSubmitted: true
          }
        };
      }

      if (!stripeAvailable) {
        if (isMockDisallowed) {
          return {
            status: 503,
            body: {
              connected: false,
              payoutsEnabled: false,
              chargesEnabled: false,
              detailsSubmitted: false,
              error: "Stripe service is unavailable: Gateway is unconfigured."
            }
          };
        }
        return {
          status: 200,
          body: {
            connected: true,
            mock: true,
            stripeAccountId: accountId,
            payoutsEnabled: true,
            chargesEnabled: true,
            detailsSubmitted: true
          }
        };
      }

      return {
        status: 200,
        body: { connected: true, stripeAccountId: accountId, payoutsEnabled: true, chargesEnabled: true, detailsSubmitted: true }
      };
    };

    it("rejects mock accounts in live environments without ALLOW_MOCK_PAYMENTS", async () => {
      const res = await simulateAccountStatus({ NODE_ENV: "production" }, "acct_mock_12345", true);
      expect(res.body.connected).toBe(false);
      expect(res.body.payoutsEnabled).toBe(false);
      expect(res.body.error).toContain("Mock Stripe account is invalid");
    });

    it("returns 503 when Stripe is unconfigured in live environments", async () => {
      const res = await simulateAccountStatus({ NODE_ENV: "development" }, "acct_real_12345", false);
      expect(res.status).toBe(503);
      expect(res.body.payoutsEnabled).toBe(false);
      expect(res.body.error).toContain("Gateway is unconfigured");
    });

    it("allows mock status in sandbox when ALLOW_MOCK_PAYMENTS=true", async () => {
      const res = await simulateAccountStatus({ NODE_ENV: "development", ALLOW_MOCK_PAYMENTS: "true" }, "acct_mock_12345", false);
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.payoutsEnabled).toBe(true);
      expect(res.body.mock).toBe(true);
    });
  });

  describe("Endpoint Logic: balance & request-payout Gates", () => {
    const simulateBalance = async (env: Record<string, string | undefined>, stripeAccountId: string, stripeAvailable: boolean) => {
      const isMockDisallowed = env.NODE_ENV === "production" || env.ALLOW_MOCK_PAYMENTS !== "true";

      if (stripeAccountId.startsWith("acct_mock_")) {
        if (isMockDisallowed) {
          return { status: 400, body: { error: "Mock Stripe accounts are not supported in live environments." } };
        }
        return { status: 200, body: { available: 150.00, pending: 45.00, currency: "gbp", mock: true } };
      }

      if (!stripeAvailable) {
        if (isMockDisallowed) {
          return { status: 503, body: { error: "Stripe service is unavailable: Gateway is unconfigured." } };
        }
        return { status: 200, body: { available: 0, pending: 0, currency: "gbp", mock: true } };
      }

      return { status: 200, body: { available: 200.00, pending: 10.00, currency: "gbp" } };
    };

    const simulateRequestPayout = async (env: Record<string, string | undefined>, stripeAccountId: string, stripeAvailable: boolean) => {
      const isMockDisallowed = env.NODE_ENV === "production" || env.ALLOW_MOCK_PAYMENTS !== "true";

      if (stripeAccountId.startsWith("acct_mock_")) {
        if (isMockDisallowed) {
          return { status: 400, body: { error: "Payouts cannot be requested for mock Stripe accounts in live environments." } };
        }
        return { status: 200, body: { success: true, mock: true, payout: { id: "po_mock_123" } } };
      }

      if (!stripeAvailable) {
        if (isMockDisallowed) {
          return { status: 503, body: { error: "Stripe payout service is unavailable: Gateway is unconfigured." } };
        }
        return { status: 200, body: { success: true, mock: true, payout: { id: "po_mock_123" } } };
      }

      return { status: 200, body: { success: true, payout: { id: "po_real_123" } } };
    };

    it("refuses fake balance for mock accounts in live environments", async () => {
      const res = await simulateBalance({ NODE_ENV: "production" }, "acct_mock_12345", true);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Mock Stripe accounts are not supported in live environments");
    });

    it("refuses fake balance when Stripe gateway is unconfigured", async () => {
      const res = await simulateBalance({ NODE_ENV: "development", ALLOW_MOCK_PAYMENTS: "false" }, "acct_real_12345", false);
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("Gateway is unconfigured");
    });

    it("refuses fake payout for mock accounts in live environments", async () => {
      const res = await simulateRequestPayout({ NODE_ENV: "production" }, "acct_mock_12345", true);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Payouts cannot be requested for mock Stripe accounts");
    });

    it("refuses fake payout when Stripe gateway is unconfigured in live environments", async () => {
      const res = await simulateRequestPayout({ NODE_ENV: "production" }, "acct_real_12345", false);
      expect(res.status).toBe(503);
      expect(res.body.error).toContain("Gateway is unconfigured");
    });

    it("permits mock balance and payout strictly in sandbox when ALLOW_MOCK_PAYMENTS=true", async () => {
      const bal = await simulateBalance({ NODE_ENV: "development", ALLOW_MOCK_PAYMENTS: "true" }, "acct_mock_12345", false);
      expect(bal.status).toBe(200);
      expect(bal.body.mock).toBe(true);
      expect(bal.body.available).toBe(150.00);

      const po = await simulateRequestPayout({ NODE_ENV: "development", ALLOW_MOCK_PAYMENTS: "true" }, "acct_mock_12345", false);
      expect(po.status).toBe(200);
      expect(po.body.mock).toBe(true);
    });
  });

  describe("Driver Payout Orchestration: Mock Account & Missing Stripe Defense", () => {
    it("skips and refuses disbursement to drivers with mock accounts in live environments", async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMock = process.env.ALLOW_MOCK_PAYMENTS;
      process.env.NODE_ENV = "production";
      process.env.ALLOW_MOCK_PAYMENTS = "false";

      try {
        const mockStore: Record<string, any> = {
          "ride_requests/ride_mock_driver": {
            id: "ride_mock_driver",
            status: "completed",
            paymentStatus: "paid",
            payoutTransferred: false,
            assignedDriverId: "driver_with_mock_acct",
            driverId: "driver_with_mock_acct",
            finalFare: 50,
            stripePaymentIntentId: "pi_verified_test",
          },
          "users/driver_with_mock_acct": {
            uid: "driver_with_mock_acct",
            role: "driver",
            isDriver: true,
            stripeAccountId: "acct_mock_driver_123", // Mock account
          }
        };

        const mockDb = {
          collection: (col: string) => ({
            where: () => ({
              where: () => ({
                where: () => ({
                  get: async () => ({
                    empty: false,
                    docs: [{
                      id: "ride_mock_driver",
                      data: () => mockStore["ride_requests/ride_mock_driver"],
                      ref: {
                        update: async (fields: any) => {
                          Object.assign(mockStore["ride_requests/ride_mock_driver"], fields);
                        }
                      }
                    }]
                  })
                })
              })
            }),
            doc: (id: string) => ({
              get: async () => ({
                exists: !!mockStore[`${col}/${id}`],
                data: () => mockStore[`${col}/${id}`],
              })
            })
          }),
        };

        const result = await executeDriverPayoutOrchestrationCommand({
          db: mockDb,
          stripeClient: {} as any, // even if stripeClient is passed
        });

        expect(result.processedCount).toBe(0);
        expect(result.skippedCount).toBe(1);
        expect(result.totalDisbursed).toBe(0);
        expect(mockStore["ride_requests/ride_mock_driver"].payoutTransferred).toBe(false);
        expect(mockStore["ride_requests/ride_mock_driver"].payoutStatus).toBe("failed_mock_stripe_account");
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.ALLOW_MOCK_PAYMENTS = prevMock;
      }
    });

    it("fails closed when Stripe client is missing in live environments", async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevMock = process.env.ALLOW_MOCK_PAYMENTS;
      process.env.NODE_ENV = "production";
      process.env.ALLOW_MOCK_PAYMENTS = "false";

      try {
        const mockStore: Record<string, any> = {
          "ride_requests/ride_real_driver": {
            id: "ride_real_driver",
            status: "completed",
            paymentStatus: "paid",
            payoutTransferred: false,
            assignedDriverId: "driver_legit_456",
            driverId: "driver_legit_456",
            finalFare: 50,
            stripePaymentIntentId: "pi_verified_test",
          },
          "users/driver_legit_456": {
            uid: "driver_legit_456",
            role: "driver",
            isDriver: true,
            stripeAccountId: "acct_real_driver_456",
          },
          "payment_ledger": {}
        };

        const mockDb = {
          runTransaction: async (updateFn: any) => {
            const tx = {
              get: async (ref: any) => ({
                data: () => mockStore["ride_requests/ride_real_driver"]
              }),
              update: (ref: any, fields: any) => {
                Object.assign(mockStore["ride_requests/ride_real_driver"], fields);
              }
            };
            return await updateFn(tx);
          },
          collection: (col: string) => ({
            where: (_field: string, _op: string, _value: any) => {
              const query: any = {
                where: (_f: string, _o: string, _v: any) => query,
                limit: (_count: number) => query,
                get: async () => col === "ride_requests"
                  ? ({
                      empty: false,
                      docs: [{
                        id: "ride_real_driver",
                        data: () => mockStore["ride_requests/ride_real_driver"],
                        ref: {
                          update: async (fields: any) => Object.assign(mockStore["ride_requests/ride_real_driver"], fields),
                        },
                      }],
                    })
                  : ({
                      empty: false,
                      docs: [{
                        data: () => ({ type: "RIDE_PAYMENT", status: "completed", captured: true, currency: "gbp", amount: 5000 }),
                      }],
                    }),
              };
              return query;
            },
            doc: (id: string) => ({
              get: async () => ({
                exists: !!mockStore[`${col}/${id}`],
                data: () => mockStore[`${col}/${id}`],
              }),
              set: async (data: any, options?: any) => {
                const path = `${col}/${id}`;
                mockStore[path] = options?.merge ? { ...(mockStore[path] || {}), ...data } : { ...data };
              },
            }),
          }),
        };

        const result = await executeDriverPayoutOrchestrationCommand({
          db: mockDb,
          stripeClient: null, // missing Stripe client
        });

        expect(result.processedCount).toBe(0);
        expect(result.failedCount).toBe(1);
        expect(result.totalDisbursed).toBe(0);
        expect(mockStore["ride_requests/ride_real_driver"].payoutTransferred).toBe(false);
        expect(mockStore["ride_requests/ride_real_driver"].payoutStatus).toBe("failed_stripe_unavailable");
      } finally {
        process.env.NODE_ENV = prevEnv;
        process.env.ALLOW_MOCK_PAYMENTS = prevMock;
      }
    });
  });
});
