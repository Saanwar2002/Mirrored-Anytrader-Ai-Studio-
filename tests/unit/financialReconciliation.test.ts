import { describe, expect, it } from "vitest";
import { evaluateFinancialReconciliation, type FinancialReconciliationSnapshot } from "../../src/server/financialReconciliation.ts";

const balanced: FinancialReconciliationSnapshot = {
  captures: [{ paymentIntentId: "pi_1", amount: 10000, currency: "gbp" }],
  ledger: [
    { entryId: "ledg_capture", transactionId: "pi_1", amount: 10000, currency: "GBP", type: "ESCROW_DEPOSIT", status: "completed" },
    { entryId: "ledg_refund", transactionId: "pi_1", stripeRefundId: "re_1", amount: 1000, currency: "gbp", type: "REFUND", status: "completed" },
    { entryId: "ledg_release", stripeTransferId: "tr_1", amount: 9000, currency: "gbp", type: "ESCROW_RELEASE", status: "completed" },
  ],
  refunds: [{ refundId: "re_1", paymentIntentId: "pi_1", amount: 1000, currency: "gbp", status: "succeeded" }],
  refundedTotals: [{ paymentIntentId: "pi_1", amount: 1000 }],
  transfers: [{ transferId: "tr_1", amount: 9000, currency: "gbp", destination: "acct_1",
    metadata: { jobId: "job_1", quoteId: "quote_1", milestoneId: "milestone_1", releaseOperationId: "release_1", operationType: "ANYTRADER_ESCROW_RELEASE" } }],
  payouts: [],
  escrows: [{ jobId: "job_1", quoteId: "quote_1", milestoneId: "milestone_1", released: true, releaseOperationId: "release_1", stripeTransferId: "tr_1", releaseAmount: 9000, currency: "gbp", transferExpected: true }],
};

describe("FIN-05 pure financial reconciliation", () => {
  it("returns no findings for a balanced lifecycle", () => {
    expect(evaluateFinancialReconciliation(balanced)).toEqual({ findingCount: 0, criticalCount: 0, findings: [] });
  });

  it("reports missing capture ledger, amount/currency mismatch and duplicate ledger IDs", () => {
    const report = evaluateFinancialReconciliation({
      captures: [{ paymentIntentId: "pi_missing", amount: 100, currency: "usd" }],
      ledger: [
        { entryId: "dup", transactionId: "pi_other", amount: 99, currency: "gbp", type: "ESCROW_DEPOSIT", status: "completed" },
        { entryId: "dup", transactionId: "pi_other", amount: 99, currency: "gbp", type: "ESCROW_DEPOSIT", status: "completed" },
        { entryId: "wrong", transactionId: "pi_mismatch", amount: 50, currency: "gbp", type: "ESCROW_DEPOSIT", status: "completed" },
      ],
    });
    expect(report.findings.map(x => x.code)).toContain("CAPTURE_LEDGER_MISSING");
    expect(report.findings.map(x => x.code)).toContain("DUPLICATE_LEDGER_ID");
    const mismatch = evaluateFinancialReconciliation({
      captures: [{ paymentIntentId: "pi_mismatch", amount: 51, currency: "usd" }],
      ledger: [{ entryId: "wrong", transactionId: "pi_mismatch", amount: 50, currency: "gbp", type: "ESCROW_DEPOSIT", status: "completed" }],
    });
    expect(mismatch.findings.map(x=>x.code)).toContain("CAPTURE_AMOUNT_MISMATCH");
    expect(mismatch.findings.map(x=>x.code)).toContain("CAPTURE_CURRENCY_MISMATCH");
  });

  it("detects orphaned refunds, mismatched refund amounts and over-refunding", () => {
    const report=evaluateFinancialReconciliation({
      captures:[{paymentIntentId:"pi_1",amount:1000,currency:"gbp"}],
      refunds:[
        {refundId:"re_orphan",paymentIntentId:"pi_1",amount:200,currency:"gbp",status:"succeeded"},
        {refundId:"re_bad",paymentIntentId:"pi_1",amount:300,currency:"gbp",status:"succeeded"},
      ],
      ledger:[{entryId:"refund_bad",stripeRefundId:"re_bad",amount:250,currency:"gbp",type:"REFUND",status:"completed"}],
      refundedTotals:[{paymentIntentId:"pi_1",amount:1200}],
    });
    expect(report.findings.map(x=>x.code)).toContain("REFUND_ORPHANED");
    expect(report.findings.map(x=>x.code)).toContain("REFUND_AMOUNT_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("REFUND_TOTAL_OVER_CAPTURE");
  });

  it("detects released escrow without transfer and transfer/payout mismatches", () => {
    const report=evaluateFinancialReconciliation({
      ledger:[],
      escrows:[{jobId:"job_2",milestoneId:"mile_2",released:true,transferExpected:true}],
      payouts:[{operationId:"payout_1",transferId:"tr_2",amount:500,currency:"gbp",destination:"acct_expected",status:"stripe_succeeded"}],
      transfers:[{transferId:"tr_2",amount:600,currency:"usd",destination:"acct_other"}],
    });
    expect(report.findings.map(x=>x.code)).toContain("ESCROW_RELEASE_TRANSFER_MISSING");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_AMOUNT_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_CURRENCY_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_DESTINATION_MISMATCH");
  });

  it("detects payout totals above an explicit allocation cap", () => {
    const report=evaluateFinancialReconciliation({ledger:[],payouts:[
      {operationId:"p1",amount:700,currency:"gbp",destination:"acct_1"},
      {operationId:"p2",amount:400,currency:"gbp",destination:"acct_1"},
    ],payoutAllocationCaps:[{destination:"acct_1",amount:1000}]});
    expect(report.findings.map(x=>x.code)).toContain("PAYOUT_ALLOCATION_EXCEEDED");
  });


  it("flags duplicate Stripe transfer identities and refund ledger PI mislinkage", () => {
    const report=evaluateFinancialReconciliation({
      ledger:[{entryId:"r1",stripeRefundId:"re_2",stripePaymentIntentId:"pi_wrong",amount:100,currency:"gbp",type:"REFUND",status:"completed"}],
      refunds:[{refundId:"re_2",paymentIntentId:"pi_expected",amount:100,currency:"gbp",status:"succeeded"}],
      transfers:[
        {transferId:"tr_dup",amount:50,currency:"gbp"},
        {transferId:"tr_dup",amount:50,currency:"gbp"},
      ],
    });
    expect(report.findings.map(x=>x.code)).toContain("DUPLICATE_TRANSFER_ID");
    expect(report.findings.map(x=>x.code)).toContain("REFUND_AMOUNT_MISMATCH");
  });


  it("does not accept pending capture or refund ledger rows as completed financial evidence", () => {
    const report = evaluateFinancialReconciliation({
      captures: [{ paymentIntentId: "pi_pending", amount: 1000, currency: "gbp" }],
      refunds: [{ refundId: "re_pending", paymentIntentId: "pi_pending", amount: 200, currency: "gbp", status: "succeeded" }],
      ledger: [
        { entryId: "capture_pending", transactionId: "pi_pending", amount: 1000, currency: "gbp", type: "ESCROW_DEPOSIT", status: "pending" },
        { entryId: "refund_pending", transactionId: "pi_pending", stripeRefundId: "re_pending", amount: 200, currency: "gbp", type: "REFUND", status: "pending" },
      ],
    });
    expect(report.findings.map(x => x.code)).toContain("CAPTURE_LEDGER_NOT_COMPLETED");
    expect(report.findings.map(x => x.code)).toContain("REFUND_LEDGER_NOT_COMPLETED");
    expect(report.findings.map(x => x.code)).not.toContain("CAPTURE_LEDGER_MISSING");
    expect(report.findings.map(x => x.code)).not.toContain("REFUND_ORPHANED");
  });

  it("checks Stripe transfer metadata against payout and escrow identities", () => {
    const payoutReport = evaluateFinancialReconciliation({
      ledger: [],
      payouts: [{ operationId: "payout_op", transferId: "tr_payout", rideId: "ride_1", driverId: "driver_1",
        amount: 500, currency: "gbp", destination: "acct_1", status: "stripe_succeeded" }],
      transfers: [{ transferId: "tr_payout", amount: 500, currency: "gbp", destination: "acct_1",
        metadata: { rideId: "ride_other", driverId: "driver_1", type: "orchestrated_driver_payout" } }],
    });
    expect(payoutReport.findings.map(x => x.code)).toContain("TRANSFER_METADATA_MISMATCH");

    const escrowReport = evaluateFinancialReconciliation({
      ledger: [],
      escrows: [{ jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1", released: true,
        releaseOperationId: "release_1", stripeTransferId: "tr_escrow", releaseAmount: 900, currency: "gbp", transferExpected: true }],
      transfers: [{ transferId: "tr_escrow", amount: 900, currency: "gbp", destination: "acct_1",
        metadata: { jobId: "job_other", quoteId: "quote_1", milestoneId: "mile_1",
          releaseOperationId: "release_1", operationType: "ANYTRADER_ESCROW_RELEASE" } }],
    });
    expect(escrowReport.findings.map(x => x.code)).toContain("TRANSFER_METADATA_MISMATCH");
  });


  it("reports a successful payout operation that has no Stripe transfer ID", () => {
    const report = evaluateFinancialReconciliation({
      ledger: [],
      payouts: [{ operationId: "payout_missing_transfer", amount: 500, currency: "gbp",
        destination: "acct_1", status: "stripe_succeeded" }],
      transfers: [],
    });
    expect(report.findings.map(x => x.code)).toContain("PAYOUT_TRANSFER_ID_MISSING");
    expect(report.criticalCount).toBe(1);
  });


  it("reports a missing escrow release ledger row even when transfer evidence is present", () => {
    const report = evaluateFinancialReconciliation({
      ledger: [],
      transfers: [{ transferId: "tr_escrow", amount: 800, currency: "gbp", destination: "acct_1",
        metadata: { jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1",
          releaseOperationId: "release_1", operationType: "ANYTRADER_ESCROW_RELEASE" } }],
      escrows: [{ jobId: "job_1", quoteId: "quote_1", milestoneId: "mile_1",
        released: true, releaseLedgerPresent: false, stripeTransferId: "tr_escrow",
        releaseOperationId: "release_1", transferExpected: true }],
    });
    expect(report.findings.map(item => item.code)).toContain("ESCROW_RELEASE_LEDGER_MISSING");
    expect(report.findings.map(item => item.code)).not.toContain("ESCROW_RELEASE_TRANSFER_MISSING");
  });

  it("flags reconciliation-required payouts whose Stripe transfer ID is absent", () => {
    const report = evaluateFinancialReconciliation({
      ledger: [],
      payouts: [{ operationId: "payout_ambiguous", amount: 500, currency: "gbp",
        destination: "acct_1", status: "reconciliation_required" }],
      transfers: [],
    });
    expect(report.findings.map(item => item.code)).toContain("PAYOUT_TRANSFER_ID_MISSING");
  });

  it("does not mutate any input snapshot", () => {
    const snapshot=structuredClone(balanced);
    const before=JSON.stringify(snapshot);
    evaluateFinancialReconciliation(snapshot);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("returns deterministic sorted findings across input ordering", () => {
    const reversed={...balanced, refunds:[...balanced.refunds!].reverse(), ledger:[...balanced.ledger].reverse()};
    expect(evaluateFinancialReconciliation(reversed)).toEqual(evaluateFinancialReconciliation(balanced));
  });
});
