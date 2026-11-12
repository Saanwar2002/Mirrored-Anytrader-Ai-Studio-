import { describe, expect, it, vi } from "vitest";
import { evaluateFinancialReconciliation } from "../../src/server/financialReconciliation.ts";
import { collectFinancialReconciliationSnapshot } from "../../src/server/financialReconciliationCollector.ts";

type SeedDoc = { id: string; value: Record<string, any> };
function fakeDb(collections: Record<string, SeedDoc[]>, quotes: Record<string, SeedDoc[]> = {}) {
  const makeCollection = (name: string, rows: SeedDoc[]) => {
    const collection: any = {
      orderBy: () => collection,
      limit: (value: number) => { collection._limit = value; return collection; },
      startAfter: (doc: { id: string }) => { collection._after = doc.id; return collection; },
      get: async () => {
        const sorted = [...rows].sort((a,b) => a.id.localeCompare(b.id));
        const after = collection._after;
        const filtered = after ? sorted.filter(row => row.id > after) : sorted;
        const limit = collection._limit || 100;
        return { docs: filtered.slice(0,limit).map(row => ({ id: row.id, data: () => row.value })) };
      },
      doc: (id: string) => ({ collection: (sub: string) => makeCollection(name + "/" + id + "/" + sub, quotes[id] || []) }),
    };
    return collection;
  };
  return { collection: (name: string) => makeCollection(name, collections[name] || []) };
}

describe("bounded read-only FIN-05 snapshot collector", () => {
  it("paginates Firestore and Stripe sources and produces an evaluator-ready balanced snapshot", async () => {
    const db = fakeDb({
      payment_ledger: [
        { id: "capture", value: { entryId: "capture", transactionId: "pi_123", amount: 10000, currency: "gbp", type: "ESCROW_DEPOSIT", status: "completed" } },
        { id: "refund", value: { entryId: "refund", transactionId: "pi_123", stripeRefundId: "re_123", amount: 200, currency: "gbp", type: "REFUND", status: "completed" } },
        { id: "release", value: { entryId: "release", transactionId: "pi_123", idempotencyKey: "release_1", jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1", amount: 10000, netPayout: 8800, currency: "gbp", type: "ESCROW_RELEASE", status: "completed", stripeTransferId: "tr_escrow" } },
      ],
      driver_payout_operations: [
        { id: "payout_1", value: { operationId: "payout_1", rideId: "ride_1", driverId: "driver_1", stripeAccountId: "acct_driver", amountPence: 500, currency: "gbp", status: "stripe_succeeded", stripeTransferId: "tr_payout" } },
      ],
      payment_intents: [
        { id: "intent_1", value: { paymentIntentId: "pi_123", metadata: { type: "milestone_funding" } } },
        { id: "subscription_intent", value: { paymentIntentId: "pi_subscription", metadata: { type: "gotham_saas" } } },
      ],
      refund_records: [],
      payment_refund_totals: [{ id: "pi_123", value: { paymentIntentId: "pi_123", refundedAmountPence: 200 } }],
      refund_operations: [],
      jobs: [{ id: "job_1", value: {} }],
    }, {
      job_1: [{ id: "quote_1", value: { milestones: [{ id: "mile_1", status: "funds_released", releaseOperationId: "release_1", escrowReleaseLedgerId: "release", isDestinationCharge: false }] } }],
    });
    const stripe = {
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_123", status: "succeeded", amount_received: 10000, currency: "gbp" }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [{ id: "re_123", payment_intent: "pi_123", amount: 200, currency: "gbp", status: "succeeded" }], has_more: false }) },
      transfers: { list: vi.fn()
        .mockResolvedValueOnce({ data: [{ id: "tr_escrow", amount: 8800, currency: "gbp", destination: "acct_trader", metadata: { jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1", releaseOperationId: "release_1", operationType: "ANYTRADER_ESCROW_RELEASE" } }], has_more: true })
        .mockResolvedValueOnce({ data: [{ id: "tr_payout", amount: 500, currency: "gbp", destination: "acct_driver", metadata: { rideId: "ride_1", driverId: "driver_1", type: "orchestrated_driver_payout" } }], has_more: true })
        .mockResolvedValueOnce({ data: [{ id: "tr_subscription", amount: 999, currency: "gbp", destination: "acct_other", metadata: { type: "unrelated_subscription_transfer" } }], has_more: false }) },
    };
    const result = await collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 1, stripePageSize: 1, maxDocumentsPerCollection: 20, maxJobs: 10, maxQuotes: 20,
      maxPaymentIntentLookups: 10, maxStripePages: 10,
    });
    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.firestore.payment_ledger.documents).toBe(3);
    expect(result.coverage.firestore.payment_ledger.pages).toBeGreaterThan(1);
    expect(result.coverage.stripeTransferPages).toBe(3);
    expect(stripe.transfers.list).toHaveBeenNthCalledWith(2, { limit: 1, starting_after: "tr_escrow" });
    expect(stripe.transfers.list).toHaveBeenNthCalledWith(3, { limit: 1, starting_after: "tr_payout" });
    expect(result.snapshot.transfers?.map(transfer => transfer.transferId)).toEqual(["tr_escrow", "tr_payout"]);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_123");
    expect(result.snapshot.escrows && result.snapshot.escrows[0]).toMatchObject({ transferExpected: true, releaseLedgerPresent: true, releaseAmount: 8800, stripeTransferId: "tr_escrow" });
    expect(evaluateFinancialReconciliation(result.snapshot)).toEqual({ findingCount: 0, criticalCount: 0, findings: [] });
    expect((stripe as any).transfers.create).toBeUndefined();
    expect((stripe as any).refunds.create).toBeUndefined();
  });


  it("discovers a PaymentIntent from refund_records so a missing refund ledger entry is reported", async () => {
    const db = fakeDb({
      refund_records: [{ id: "re_orphan", value: { transactionId: "pi_refundonly" } }],
    });
    const stripe = {
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({
        id: "pi_refundonly", status: "succeeded", amount_received: 1000, currency: "gbp",
      }) },
      refunds: { list: vi.fn().mockResolvedValue({
        data: [{ id: "re_orphan", payment_intent: "pi_refundonly", amount: 100, currency: "gbp", status: "succeeded" }],
        has_more: false,
      }) },
      transfers: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    };
    const result = await collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 10, maxDocumentsPerCollection: 10, maxJobs: 10, maxQuotes: 10,
      maxPaymentIntentLookups: 10, maxStripePages: 10,
    });
    const report = evaluateFinancialReconciliation(result.snapshot);
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_refundonly");
    expect(report.findings.map(item => item.code)).toContain("REFUND_ORPHANED");
  });

  it("refuses a partial snapshot when a Firestore source exceeds its document budget", async () => {
    const db = fakeDb({ payment_ledger: [{ id: "one", value: {} }, { id: "two", value: {} }] });
    const stripe = {
      paymentIntents: { retrieve: vi.fn() },
      refunds: { list: vi.fn() },
      transfers: { list: vi.fn() },
    };
    await expect(collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 10, maxDocumentsPerCollection: 1, maxJobs: 1, maxQuotes: 1,
      maxPaymentIntentLookups: 1, maxStripePages: 1,
    })).rejects.toThrow("exceeded its 1-document read budget");
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });


  it("reports a released milestone with a missing release ledger link instead of hiding it", async () => {
    const db = fakeDb({ jobs: [{ id: "job_missing", value: {} }] }, {
      job_missing: [{
        id: "quote_missing",
        value: { milestones: [{
          id: "mile_missing", status: "funds_released", releaseOperationId: "release_missing",
          escrowReleaseLedgerId: "ledger_missing", stripeTransferId: "tr_missing_ledger",
        }] },
      }],
    });
    const stripe = {
      paymentIntents: { retrieve: vi.fn() },
      refunds: { list: vi.fn() },
      transfers: { list: vi.fn().mockResolvedValue({
        data: [{ id: "tr_missing_ledger", amount: 800, currency: "gbp", destination: "acct_1",
          metadata: { jobId: "job_missing", quoteId: "quote_missing", milestoneId: "mile_missing",
            releaseOperationId: "release_missing", operationType: "ANYTRADER_ESCROW_RELEASE" } }],
        has_more: false,
      }) },
    };
    const result = await collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 10, maxDocumentsPerCollection: 10, maxJobs: 10, maxQuotes: 10,
      maxPaymentIntentLookups: 10, maxStripePages: 10,
    });
    const report = evaluateFinancialReconciliation(result.snapshot);
    expect(result.snapshot.escrows?.[0]).toMatchObject({ releaseLedgerPresent: false, stripeTransferId: "tr_missing_ledger" });
    expect(report.findings.map(item => item.code)).toContain("ESCROW_RELEASE_LEDGER_MISSING");
  });

  it("fails closed when a Stripe page budget ends before pagination is complete", async () => {
    const db = fakeDb({ payment_intents: [{ id: "intent_1", value: { paymentIntentId: "pi_123" } }] });
    const stripe = {
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({ id: "pi_123", status: "processing" }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
      transfers: { list: vi.fn()
        .mockResolvedValueOnce({ data: [{ id: "tr_1" }], has_more: true })
        .mockResolvedValueOnce({ data: [{ id: "tr_2" }], has_more: true }) },
    };
    await expect(collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 10, maxDocumentsPerCollection: 10, maxJobs: 10, maxQuotes: 10,
      maxPaymentIntentLookups: 10, stripePageSize: 1, maxStripePages: 2,
    })).rejects.toThrow("pagination exceeded its 2-page global budget");
  });


  it("uses Stripe PaymentIntent transfer_data to recognise a destination charge without relying on a milestone flag", async () => {
    const db = fakeDb({
      payment_intents: [{
        id: "intent_destination",
        value: { paymentIntentId: "pi_destination", metadata: {
          type: "milestone_funding", jobId: "job_destination", quoteId: "quote_destination", milestoneId: "mile_destination",
        } },
      }],
      payment_ledger: [{
        id: "release_destination",
        value: { entryId: "release_destination", transactionId: "pi_destination", idempotencyKey: "release_destination",
          jobId: "job_destination", quoteId: "quote_destination", milestoneId: "mile_destination",
          amount: 1000, netPayout: 880, currency: "gbp", type: "ESCROW_RELEASE", status: "completed" },
      }],
      jobs: [{ id: "job_destination", value: {} }],
    }, {
      job_destination: [{
        id: "quote_destination",
        value: { milestones: [{
          id: "mile_destination", status: "funds_released", stripePaymentIntentId: "pi_destination",
          escrowReleaseLedgerId: "release_destination",
          // Deliberately false: Stripe's PaymentIntent transfer target is authoritative.
          isDestinationCharge: false,
        }] },
      }],
    });
    const stripe = {
      paymentIntents: { retrieve: vi.fn().mockResolvedValue({
        id: "pi_destination", status: "succeeded", amount_received: 1000, currency: "gbp",
        transfer_data: { destination: "acct_connected" },
      }) },
      refunds: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
      transfers: { list: vi.fn().mockResolvedValue({ data: [], has_more: false }) },
    };
    const result = await collectFinancialReconciliationSnapshot(db as any, stripe as any, {
      pageSize: 10, maxDocumentsPerCollection: 10, maxJobs: 10, maxQuotes: 10,
      maxPaymentIntentLookups: 10, maxStripePages: 10,
    });
    expect(result.snapshot.escrows?.[0]).toMatchObject({ transferExpected: false });
    expect(evaluateFinancialReconciliation(result.snapshot).findings.map(item => item.code)).not.toContain("ESCROW_RELEASE_TRANSFER_MISSING");
  });

  it("does not require a platform transfer for an explicitly marked destination charge", () => {
    expect(evaluateFinancialReconciliation({ ledger: [], escrows: [{
      jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1", released: true, transferExpected: false,
    }] })).toEqual({ findingCount: 0, criticalCount: 0, findings: [] });
  });
});
