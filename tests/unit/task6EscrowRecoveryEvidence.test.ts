import { describe, it, expect, vi, beforeEach } from "vitest";
import { EscrowRecoveryEngine } from "../../src/server/escrowRecovery.ts";

describe("FIN-03: Read-Only Escrow Recovery & Evidence Suite", () => {
  let mockDb: any;
  let ledgerStore: Map<string, any>;
  let dbUpdateSpy: any;

  const baseQuery = {
    jobId: "job_escrow_101",
    quoteId: "quote_escrow_202",
    milestoneId: "m1",
    idempotencyKey: "rel_idemp_key_999",
    expectedAmountPence: 44000,
    expectedCurrency: "gbp",
    expectedDestinationAccount: "acct_trader_dest_1",
  };

  beforeEach(() => {
    ledgerStore = new Map();
    dbUpdateSpy = vi.fn();

    ledgerStore.set("doc_1", {
      idempotencyKey: baseQuery.idempotencyKey,
      jobId: baseQuery.jobId,
      milestoneId: baseQuery.milestoneId,
      transferStatus: "failed",
      netPayoutPence: 44000,
    });

    mockDb = {
      collection: (colName: string) => {
        if (colName === "payment_ledger") {
          return {
            where: (field: string, op: string, val: any) => {
              return {
                get: async () => {
                  const matchingDocs: any[] = [];
                  for (const [id, data] of ledgerStore.entries()) {
                    if (data[field] === val) {
                      matchingDocs.push({
                        id,
                        data: () => ({ ...data }),
                        ref: {
                          update: async (updates: any) => {
                            dbUpdateSpy(id, updates);
                            ledgerStore.set(id, { ...data, ...updates });
                          },
                        },
                      });
                    }
                  }
                  return {
                    empty: matchingDocs.length === 0,
                    docs: matchingDocs,
                  };
                },
              };
            },
          };
        }
        throw new Error(`Collection ${colName} not mocked`);
      },
    };
  });

  it("Scenario 1A: Pure inspectTransferEvidence is strictly read-only and makes ZERO Firestore writes", async () => {
    const matchingTransfer = {
      id: "tr_stripe_exact_1",
      amount: 44000,
      currency: "gbp",
      destination: "acct_trader_dest_1",
      created: 1731300000,
      metadata: {
        jobId: baseQuery.jobId,
        quoteId: baseQuery.quoteId,
        milestoneId: baseQuery.milestoneId,
      },
    };

    const mockCreate = vi.fn();
    const mockStripe = {
      transfers: {
        list: vi.fn().mockResolvedValue({ data: [matchingTransfer] }),
        create: mockCreate,
      },
    };

    const result = await EscrowRecoveryEngine.inspectTransferEvidence(mockDb, baseQuery, {
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("RESOLVED_EXACT_MATCH");
    expect(result.matchedTransferId).toBe("tr_stripe_exact_1");
    expect(result.requiresManualReview).toBe(false);
    expect(result.ledgerUpdated).toBe(false);
    expect(result.moneyMovementAttempted).toBe(false);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
    expect(ledgerStore.get("doc_1").transferStatus).toBe("failed");
  });

  it("Scenario 1B: inspectAndRecoverTransferEvidence with autoRepair=true updates ledger record after exact match", async () => {
    const matchingTransfer = {
      id: "tr_stripe_exact_1",
      amount: 44000,
      currency: "gbp",
      destination: "acct_trader_dest_1",
      created: 1731300000,
      metadata: {
        jobId: baseQuery.jobId,
        quoteId: baseQuery.quoteId,
        milestoneId: baseQuery.milestoneId,
      },
    };

    const mockCreate = vi.fn();
    const mockStripe = {
      transfers: {
        list: vi.fn().mockResolvedValue({ data: [matchingTransfer] }),
        create: mockCreate,
      },
    };

    const result = await EscrowRecoveryEngine.inspectAndRecoverTransferEvidence(mockDb, baseQuery, {
      autoRepair: true,
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("RESOLVED_EXACT_MATCH");
    expect(result.ledgerUpdated).toBe(true);
    expect(result.moneyMovementAttempted).toBe(false);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(dbUpdateSpy).toHaveBeenCalledWith("doc_1", expect.objectContaining({
      stripeTransferId: "tr_stripe_exact_1",
      transferStatus: "completed",
    }));
  });

  it("Scenario 2: Zero matching transfers leaves outcome unresolved and NEVER creates replacement transfer", async () => {
    const mockCreate = vi.fn();
    const mockStripe = {
      transfers: {
        list: vi.fn().mockResolvedValue({ data: [] }),
        create: mockCreate,
      },
    };

    const result = await EscrowRecoveryEngine.inspectTransferEvidence(mockDb, baseQuery, {
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("UNRESOLVED_ZERO_MATCH");
    expect(result.candidateTransfersCount).toBe(0);
    expect(result.requiresManualReview).toBe(true);
    expect(result.ledgerUpdated).toBe(false);
    expect(result.moneyMovementAttempted).toBe(false);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("Scenario 3: Multiple matching transfers flags ambiguous anomaly and leaves unresolved for manual review", async () => {
    const transferA = {
      id: "tr_candidate_a",
      amount: 44000,
      currency: "gbp",
      destination: "acct_trader_dest_1",
      created: 1731300001,
      metadata: {
        jobId: baseQuery.jobId,
        quoteId: baseQuery.quoteId,
        milestoneId: baseQuery.milestoneId,
      },
    };
    const transferB = {
      id: "tr_candidate_b",
      amount: 44000,
      currency: "gbp",
      destination: "acct_trader_dest_1",
      created: 1731300002,
      metadata: {
        jobId: baseQuery.jobId,
        quoteId: baseQuery.quoteId,
        milestoneId: baseQuery.milestoneId,
      },
    };

    const mockCreate = vi.fn();
    const mockStripe = {
      transfers: {
        list: vi.fn().mockResolvedValue({ data: [transferA, transferB] }),
        create: mockCreate,
      },
    };

    const result = await EscrowRecoveryEngine.inspectTransferEvidence(mockDb, baseQuery, {
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("AMBIGUOUS_MULTIPLE_MATCH");
    expect(result.candidateTransfersCount).toBe(2);
    expect(result.requiresManualReview).toBe(true);
    expect(result.ledgerUpdated).toBe(false);
    expect(result.moneyMovementAttempted).toBe(false);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("Scenario 4: Legacy transfer with incomplete metadata is NOT automatically resolved", async () => {
    const legacyTransfer = {
      id: "tr_legacy_unstructured_1",
      amount: 44000,
      currency: "gbp",
      destination: "acct_trader_dest_1",
      created: 1731000000,
      description: `Payment for ${baseQuery.jobId}`,
      metadata: {
        jobId: baseQuery.jobId,
      },
    };

    const mockCreate = vi.fn();
    const mockStripe = {
      transfers: {
        list: vi.fn().mockResolvedValue({ data: [legacyTransfer] }),
        create: mockCreate,
      },
    };

    const result = await EscrowRecoveryEngine.inspectTransferEvidence(mockDb, baseQuery, {
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("LEGACY_INCOMPLETE_METADATA");
    expect(result.matchedTransferId).toBe("tr_legacy_unstructured_1");
    expect(result.requiresManualReview).toBe(true);
    expect(result.ledgerUpdated).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("Scenario 5: Stripe retrieval errors fail closed gracefully without throwing to caller", async () => {
    const mockStripe = {
      transfers: {
        list: vi.fn().mockRejectedValue(new Error("Stripe rate limit exceeded (HTTP 429)")),
      },
    };

    const result = await EscrowRecoveryEngine.inspectTransferEvidence(mockDb, baseQuery, {
      stripe: mockStripe as any,
    });

    expect(result.status).toBe("RETRIEVAL_ERROR");
    expect(result.unresolvedReason).toContain("Stripe rate limit exceeded");
    expect(result.requiresManualReview).toBe(true);
    expect(result.ledgerUpdated).toBe(false);
    expect(result.moneyMovementAttempted).toBe(false);
    expect(dbUpdateSpy).not.toHaveBeenCalled();
  });

  it("Scenario 6: Deterministic idempotency key format is strictly consistent with Task 6 authority", () => {
    const key = EscrowRecoveryEngine.buildStripeIdempotencyKey({
      jobId: "job_1",
      quoteId: "quote_2",
      milestoneId: "m3",
      idempotencyKey: "idemp_4",
    });
    expect(key).toBe("release:job_1:quote_2:m3:idemp_4");
  });
});
