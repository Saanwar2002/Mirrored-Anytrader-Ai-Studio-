import { describe, it, expect, beforeEach } from "vitest";
import {
  generateFinancialReconciliationReport,
  validateReconciliationReportParams,
  sanitizeAndClassifyLedgerRecord,
  MAX_RECONCILIATION_REPORT_LIMIT,
} from "../../src/server/reconciliationReport.ts";
import { ForbiddenError, BadRequestError } from "../../src/server/httpErrors.ts";

describe("FIN-05: Bounded Read-Only Operator Financial Reconciliation Report Suite", () => {
  let mockDb: any;
  let ledgerDocs: any[];

  beforeEach(() => {
    ledgerDocs = [
      {
        id: "ledg_v8_reconciled",
        data: {
          jobId: "job_v8_1",
          quoteId: "quote_v8_1",
          milestoneId: "m1",
          idempotencyKey: "release:job_v8_1:quote_v8_1:m1:key1",
          verifiedAmount: 50000,
          platformFeePence: 6000,
          netPayoutPence: 44000,
          status: "released",
          transferStatus: "completed",
          stripeTransferId: "tr_stripe_prod_1234567890",
          createdAt: "2026-11-10T10:00:00.000Z",
        },
      },
      {
        id: "ledg_v8_failed",
        data: {
          jobId: "job_v8_2",
          quoteId: "quote_v8_2",
          milestoneId: "m2",
          idempotencyKey: "release:job_v8_2:quote_v8_2:m2:key2",
          verifiedAmount: 25000,
          platformFeePence: 3000,
          netPayoutPence: 22000,
          status: "released",
          transferStatus: "failed",
          transferError: "Stripe Connect account restricted",
          createdAt: "2026-11-10T11:00:00.000Z",
        },
      },
      {
        id: "ledg_v7_transitional",
        data: {
          jobId: "job_v7_1",
          quoteId: "quote_v7_1",
          milestoneId: "m1",
          amountPence: 15000,
          status: "funded",
          transferStatus: "none",
          createdAt: "2026-10-15T09:00:00.000Z",
        },
      },
      {
        id: "ledg_v6_legacy",
        data: {
          jobId: "job_v6_1",
          amount: 100,
          status: "pending",
          timestamp: "2026-09-01T12:00:00.000Z",
        },
      },
    ];

    mockDb = {
      collection: (colName: string) => {
        if (colName === "payment_ledger") {
          return {
            where: (field: string, op: string, val: any) => {
              const filtered = ledgerDocs.filter((d) => d.data[field] === val);
              return {
                limit: (lim: number) => ({
                  get: async () => ({
                    docs: filtered.slice(0, lim).map((d) => ({
                      id: d.id,
                      data: () => ({ ...d.data }),
                    })),
                  }),
                }),
                get: async () => ({
                  docs: filtered.map((d) => ({
                    id: d.id,
                    data: () => ({ ...d.data }),
                  })),
                }),
              };
            },
            limit: (lim: number) => ({
              get: async () => ({
                docs: ledgerDocs.slice(0, lim).map((d) => ({
                  id: d.id,
                  data: () => ({ ...d.data }),
                })),
              }),
            }),
            get: async () => ({
              docs: ledgerDocs.map((d) => ({
                id: d.id,
                data: () => ({ ...d.data }),
              })),
            }),
          };
        }
        throw new Error(`Collection ${colName} not mocked`);
      },
    };
  });

  describe("1. Authorization Guard & Fail-Closed Checks", () => {
    it("rejects non-admin callers with ForbiddenError", async () => {
      const nonAdminCaller = { uid: "user_regular_1", isAdmin: false };
      await expect(
        generateFinancialReconciliationReport(mockDb, {}, nonAdminCaller)
      ).rejects.toThrow(ForbiddenError);
    });

    it("allows verified admin callers", async () => {
      const adminCaller = { uid: "admin_super_user", isAdmin: true };
      const report = await generateFinancialReconciliationReport(mockDb, {}, adminCaller);
      expect(report.isReadOnly).toBe(true);
      expect(report.recordsCount).toBe(4);
    });
  });

  describe("2. Parameter Validation & Bounded Limits", () => {
    it("enforces default limit (20) and respects valid custom limit", () => {
      const params = validateReconciliationReportParams({ limit: 50, offset: 10 });
      expect(params.limit).toBe(50);
      expect(params.offset).toBe(10);
    });

    it("rejects limits exceeding maximum bound (100)", () => {
      expect(() =>
        validateReconciliationReportParams({ limit: MAX_RECONCILIATION_REPORT_LIMIT + 1 })
      ).toThrow(BadRequestError);
    });

    it("rejects negative or non-integer limit/offset parameters", () => {
      expect(() => validateReconciliationReportParams({ limit: -5 })).toThrow(BadRequestError);
      expect(() => validateReconciliationReportParams({ limit: 2.5 })).toThrow(BadRequestError);
      expect(() => validateReconciliationReportParams({ offset: -1 })).toThrow(BadRequestError);
      expect(() => validateReconciliationReportParams({ offset: "abc" })).toThrow(BadRequestError);
    });

    it("validates and normalizes statusFilter parameter", () => {
      const valid = validateReconciliationReportParams({ statusFilter: "COMPLETED " });
      expect(valid.statusFilter).toBe("completed");

      expect(() => validateReconciliationReportParams({ statusFilter: "invalid_status_xyz" })).toThrow(
        BadRequestError
      );
    });
  });

  describe("3. Historical Schema Normalization & Identifier Masking", () => {
    it("normalizes V8 structured ledger records and masks Stripe transfer IDs", () => {
      const raw = ledgerDocs[0].data;
      const sanitized = sanitizeAndClassifyLedgerRecord("ledg_v8_reconciled", raw);

      expect(sanitized.schemaVariant).toBe("v8_structured");
      expect(sanitized.reconciliationStatus).toBe("reconciled");
      expect(sanitized.amountPence).toBe(50000);
      expect(sanitized.formattedAmount).toBe("£500.00");
      expect(sanitized.platformFeePence).toBe(6000);
      expect(sanitized.netPayoutPence).toBe(44000);
      expect(sanitized.stripeTransferIdMasked).toBe("tr_s...7890");
    });

    it("normalizes V7 transitional ledger records", () => {
      const raw = ledgerDocs[2].data;
      const sanitized = sanitizeAndClassifyLedgerRecord("ledg_v7_transitional", raw);

      expect(sanitized.schemaVariant).toBe("v7_transitional");
      expect(sanitized.amountPence).toBe(15000);
      expect(sanitized.formattedAmount).toBe("£150.00");
      expect(sanitized.platformFeePence).toBe(1800);
      expect(sanitized.netPayoutPence).toBe(13200);
    });

    it("normalizes V6 legacy float-amount ledger records", () => {
      const raw = ledgerDocs[3].data;
      const sanitized = sanitizeAndClassifyLedgerRecord("ledg_v6_legacy", raw);

      expect(sanitized.schemaVariant).toBe("v6_legacy");
      expect(sanitized.reconciliationStatus).toBe("legacy_unstructured");
      expect(sanitized.amountPence).toBe(10000);
      expect(sanitized.formattedAmount).toBe("£100.00");
    });
  });

  describe("4. Summary Aggregation & Read-Only Invariant", () => {
    it("computes report summary totals accurately without mutating database state", async () => {
      const adminCaller = { uid: "admin_super_user", isAdmin: true };
      const report = await generateFinancialReconciliationReport(mockDb, {}, adminCaller);

      expect(report.summary.totalPence).toBe(100000);
      expect(report.summary.reconciledCount).toBe(1);
      expect(report.summary.failedCount).toBe(1);
      expect(report.summary.legacyCount).toBe(2);
      expect(report.isReadOnly).toBe(true);
    });
  });
});
