import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { PaymentLedgerEngine } from "../../src/server/paymentLedger.ts";
import { ForbiddenError, BadRequestError, ConflictError } from "../../src/server/httpErrors.ts";

describe("AnyTrader V8.3 — Escrow Release Integrity & Anti-Forgery Defense", () => {
  let db: any;
  let store: Record<string, any>;
  const jobId = "job_escrow_101";
  const quoteId = "quote_escrow_202";
  const milestoneId = "milestone_phase_1";
  const homeownerId = "homeowner_alice";
  const traderId = "trader_dave";
  const verificationPin = "7890";
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    store = {};

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
              data: () => store[path] ? { ...store[path] } : undefined,
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
            collection: (subColName: string) => ({
              doc: (subDocId: string) => {
                const subPath = `${path}/${subColName}/${subDocId}`;
                return {
                  id: subDocId,
                  path: subPath,
                  get: async () => ({
                    exists: !!store[subPath],
                    data: () => store[subPath] ? { ...store[subPath] } : undefined,
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
                data: () => ({ ...v }),
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

    // Seed test Job and Quote
    store[`jobs/${jobId}`] = {
      id: jobId,
      homeownerId,
      userId: homeownerId,
      acceptedTradespersonId: traderId,
      acceptedQuoteId: quoteId,
      verificationPin,
      handshakeCode: verificationPin,
      status: "in_progress",
    };

    store[`jobs/${jobId}/quotes/${quoteId}`] = {
      id: quoteId,
      jobId,
      tradespersonId: traderId,
      status: "accepted",
      milestones: [
        {
          id: milestoneId,
          title: "Foundation & Framing",
          amount: 500,
          status: "funded",
          verifiedAmount: 500,
        },
      ],
    };

    // Seed Trader profile
    store[`users/${traderId}`] = {
      uid: traderId,
      role: "trader",
      stripeAccountId: "acct_prod_trader_12345",
    };
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe("Vulnerability 1: Escrow Self-Release Defense", () => {
    it("Test 1: Rejects accepted tradesperson self-release when sending bare isQrHandshake without valid code", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: traderId,
          idempotencyKey: "rel_trader_bare_qr_fail",
          isQrHandshake: true,
          // Notice: No handshakeCode supplied!
        })
      ).rejects.toThrow(ForbiddenError);

      // Verify milestone remains funded
      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funded");
    });

    it("Test 2: Rejects accepted tradesperson self-release when sending incorrect handshake code", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: traderId,
          idempotencyKey: "rel_trader_wrong_pin_fail",
          isQrHandshake: true,
          handshakeCode: "0000", // Wrong PIN!
        })
      ).rejects.toThrow(ForbiddenError);

      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funded");
    });

    it("Test 3: Rejects unauthorized third-party attacker completely", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: "attacker_eve",
          idempotencyKey: "rel_attacker_eve_fail",
          isQrHandshake: true,
          handshakeCode: verificationPin,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("Test 4: Allows homeowner (funds owner) to release directly without requiring handshake code", async () => {
      const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerId,
        idempotencyKey: "rel_homeowner_success_1",
      });

      expect(result.success).toBe(true);
      expect(result.releasedAmount).toBe(500);

      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funds_released");
    });

    it("Test 5: Allows authorized admin to release milestone directly", async () => {
      const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: "platform_admin",
        isAdmin: true,
        idempotencyKey: "rel_admin_success_1",
      });

      expect(result.success).toBe(true);
      expect(result.releasedAmount).toBe(500);
    });

    it("Test 6: Allows accepted tradesperson release ONLY when homeowner's valid verification code is provided", async () => {
      const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: traderId,
        idempotencyKey: "rel_trader_valid_pin_success",
        isQrHandshake: true,
        handshakeCode: verificationPin, // Correct code matching job!
      });

      expect(result.success).toBe(true);
      expect(result.releasedAmount).toBe(500);

      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funds_released");
    });
  });

  describe("Vulnerability 2 & 3: Production Fail-Closed on Missing Stripe & Mock Accounts", () => {
    it("Test 7: In production mode, rejects release if trader has no connected Stripe account", async () => {
      process.env.NODE_ENV = "production";
      store[`users/${traderId}`] = {
        uid: traderId,
        role: "trader",
        // Notice: No stripeAccountId!
      };

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: homeownerId,
          idempotencyKey: "rel_prod_no_stripe_acct",
        })
      ).rejects.toThrow(BadRequestError);

      // Milestone MUST NOT be marked released
      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funded");
    });

    it("Test 8: In production mode, rejects release if trader has mock Stripe account", async () => {
      process.env.NODE_ENV = "production";
      store[`users/${traderId}`] = {
        uid: traderId,
        role: "trader",
        stripeAccountId: "acct_mock_express_999", // Mock account!
      };

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: homeownerId,
          idempotencyKey: "rel_prod_mock_acct_fail",
        })
      ).rejects.toThrow(BadRequestError);

      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].status).toBe("funded");
    });

    it("Test 9: In production mode, executeStripeEscrowTransfer fails closed if Stripe is unavailable", async () => {
      process.env.NODE_ENV = "production";

      const result = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_no_stripe_client_test",
          traderId,
          netPayoutPence: 44000,
        },
        { stripe: null } // No Stripe client!
      );

      expect(result.transferStatus).toBe("failed");
      expect(result.error).toContain("Stripe transfer client unconfigured");
    });

    it("Test 10: In production mode, executeStripeEscrowTransfer fails closed if trader has mock Stripe account", async () => {
      process.env.NODE_ENV = "production";
      store[`users/${traderId}`] = {
        uid: traderId,
        role: "trader",
        stripeAccountId: "acct_mock_123",
      };

      const result = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_mock_trader_test",
          traderId,
          netPayoutPence: 44000,
        },
        { stripe: { transfers: { create: vi.fn() } } }
      );

      expect(result.transferStatus).toBe("failed");
      expect(result.error).toContain("Mock Stripe account is rejected");
    });

    it("Test 11: Destination charges bypass secondary transfer safely since funds were routed at checkout", async () => {
      const result = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_dest_charge_test",
          traderId,
          netPayoutPence: 44000,
          isDestinationCharge: true,
        },
        { stripe: null }
      );

      expect(result.transferStatus).toBe("skipped_destination_charge");
    });
  });

  describe("Stripe Transfer Execution & Idempotency Key Stability", () => {
    it("Test 12: Executes transfer with deterministic idempotency key and records completed ledger", async () => {
      const capturedOpts: any[] = [];
      const capturedParams: any[] = [];
      const mockStripe = {
        transfers: {
          create: vi.fn().mockImplementation(async (params: any, opts: any) => {
            capturedParams.push(params);
            capturedOpts.push(opts);
            return {
              id: "tr_verified_success_888",
              amount: 44000,
              currency: "gbp",
              destination: "acct_prod_trader_12345",
              metadata: {
                jobId, quoteId, milestoneId, traderId,
                releaseOperationId: "rel_idem_test_key_1",
                stripeIdempotencyKey: `release:${jobId}:${quoteId}:${milestoneId}:rel_idem_test_key_1`,
                operationType: "ANYTRADER_ESCROW_RELEASE",
              },
            };
          }),
        },
      };

      const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerId,
        idempotencyKey: "rel_idem_test_key_1",
      });

      const transferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_idem_test_key_1",
          traderId: releaseResult.traderId,
          netPayoutPence: releaseResult.netPayoutPence,
          targetMilestoneTitle: releaseResult.targetMilestoneTitle,
        },
        { stripe: mockStripe }
      );

      expect(transferResult.transferStatus).toBe("completed");
      expect(transferResult.stripeTransferId).toBe("tr_verified_success_888");
      expect(capturedOpts[0].idempotencyKey).toBe(`release:${jobId}:${quoteId}:${milestoneId}:rel_idem_test_key_1`);
      expect(capturedParams[0].metadata).toMatchObject({
        jobId,
        quoteId,
        milestoneId,
        traderId: releaseResult.traderId,
        releaseOperationId: "rel_idem_test_key_1",
        stripeIdempotencyKey: capturedOpts[0].idempotencyKey,
        operationType: "ANYTRADER_ESCROW_RELEASE",
      });

      const ledger = store[`payment_ledger/${releaseResult.ledgerEntryId}`];
      expect(ledger.stripeTransferId).toBe("tr_verified_success_888");
      expect(ledger.transferStatus).toBe("completed");
    });

    it("Test 13: Treats a Stripe transfer exception as ambiguous and preserves the stable operation for reconciliation", async () => {
      const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerId,
        idempotencyKey: "rel_ambiguous_transfer_13",
      });
      const mockStripe = {
        transfers: {
          create: vi.fn().mockRejectedValue(new Error("socket hang up after request")),
        },
      };

      const transferResult = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_ambiguous_transfer_13",
          traderId: releaseResult.traderId,
          netPayoutPence: releaseResult.netPayoutPence,
        },
        { stripe: mockStripe }
      );

      expect(transferResult.transferStatus).toBe("reconciliation_required");
      expect(transferResult.stripeIdempotencyKey).toBe(
        `release:${jobId}:${quoteId}:${milestoneId}:rel_ambiguous_transfer_13`
      );
      const quote = store[`jobs/${jobId}/quotes/${quoteId}`];
      expect(quote.milestones[0].releaseOperationId).toBe("rel_ambiguous_transfer_13");
      expect(quote.milestones[0].status).toBe("funds_released");
      const ledger = store[`payment_ledger/${releaseResult.ledgerEntryId}`];
      expect(ledger.transferStatus).toBe("reconciliation_required");
      await expect(PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerId,
        idempotencyKey: "rel_ambiguous_transfer_new_key",
      })).rejects.toThrow(ConflictError);
    });

    it.each([
      ["amount", { amount: 1 }],
      ["currency", { currency: "usd" }],
      ["destination", { destination: "acct_other" }],
      ["operation metadata", { metadata: { jobId: "other-job" } }],
    ])("requires Stripe response %s to match the requested transfer", async (_field, override) => {
      const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId, quoteId, milestoneId, authUid: homeownerId,
        idempotencyKey: `rel_response_mismatch_${String(_field).replace(/\s/g, "_")}`,
      });
      const operationKey = `rel_response_mismatch_${String(_field).replace(/\s/g, "_")}`;
      const expectedMetadata = {
        jobId, quoteId, milestoneId, traderId: releaseResult.traderId,
        releaseOperationId: operationKey,
        stripeIdempotencyKey: `release:${jobId}:${quoteId}:${milestoneId}:${operationKey}`,
        operationType: "ANYTRADER_ESCROW_RELEASE",
      };
      const mockStripe = {
        transfers: {
          create: vi.fn().mockResolvedValue({
            id: "tr_mismatched_response",
            amount: releaseResult.netPayoutPence,
            currency: "gbp",
            destination: "acct_prod_trader_12345",
            metadata: expectedMetadata,
            ...override,
          }),
        },
      };
      const result = await PaymentLedgerEngine.executeStripeEscrowTransfer(db, {
        jobId, quoteId, milestoneId, idempotencyKey: operationKey,
        traderId: releaseResult.traderId, netPayoutPence: releaseResult.netPayoutPence,
      }, { stripe: mockStripe });
      expect(result.transferStatus).toBe("reconciliation_required");
      expect(result.error).toContain("does not match");
      const ledger = store[`payment_ledger/${releaseResult.ledgerEntryId}`];
      expect(ledger.transferStatus).toBe("reconciliation_required");
      expect(ledger.stripeTransferId).toBeUndefined();
    });

    it("does not report a transfer as completed when Stripe omits its transfer ID", async () => {
      const releaseResult = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: homeownerId,
        idempotencyKey: "rel_missing_transfer_id",
      });
      const mockStripe = {
        transfers: {
          create: vi.fn().mockResolvedValue({}),
        },
      };

      const result = await PaymentLedgerEngine.executeStripeEscrowTransfer(
        db,
        {
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_missing_transfer_id",
          traderId: releaseResult.traderId,
          netPayoutPence: releaseResult.netPayoutPence,
        },
        { stripe: mockStripe }
      );

      expect(result.transferStatus).toBe("reconciliation_required");
      expect(result.error).toContain("without a valid transfer ID");
      const ledger = store[`payment_ledger/${releaseResult.ledgerEntryId}`];
      expect(ledger.transferStatus).toBe("reconciliation_required");
      expect(ledger.stripeTransferId).toBeUndefined();
    });
  });
});
