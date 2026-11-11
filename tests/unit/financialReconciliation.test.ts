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
  transfers: [{ transferId: "tr_1", amount: 9000, currency: "gbp", destination: "acct_1" }],
  payouts: [],
  escrows: [{ jobId: "job_1", quoteId: "quote_1", milestoneId: "milestone_1", released: true, stripeTransferId: "tr_1", releaseAmount: 9000, currency: "gbp" }],
};

describe("FIN-05 pure financial reconciliation", () => {
  it("returns no findings for a balanced lifecycle", () => {
    expect(evaluateFinancialReconciliation(balanced)).toEqual({ findingCount: 0, criticalCount: 0, findings: [] });
  });

  it("reports missing capture ledger, amount/currency mismatch and duplicate ledger IDs", () => {
    const report = evaluateFinancialReconciliation({
      captures: [{ paymentIntentId: "pi_missing", amount: 100, currency: "usd" }],
      ledger: [
        { entryId: "dup", transactionId: "pi_other", amount: 99, currency: "gbp", type: "ESCROW_DEPOSIT" },
        { entryId: "dup", transactionId: "pi_other", amount: 99, currency: "gbp", type: "ESCROW_DEPOSIT" },
        { entryId: "wrong", transactionId: "pi_mismatch", amount: 50, currency: "gbp", type: "ESCROW_DEPOSIT" },
      ],
    });
    expect(report.findings.map(x => x.code)).toContain("CAPTURE_LEDGER_MISSING");
    expect(report.findings.map(x => x.code)).toContain("DUPLICATE_LEDGER_ID");
    const mismatch = evaluateFinancialReconciliation({
      captures: [{ paymentIntentId: "pi_mismatch", amount: 51, currency: "usd" }],
      ledger: [{ entryId: "wrong", transactionId: "pi_mismatch", amount: 50, currency: "gbp", type: "ESCROW_DEPOSIT" }],
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
      ledger:[{entryId:"refund_bad",stripeRefundId:"re_bad",amount:250,currency:"gbp",type:"REFUND"}],
      refundedTotals:[{paymentIntentId:"pi_1",amount:1200}],
    });
    expect(report.findings.map(x=>x.code)).toContain("REFUND_ORPHANED");
    expect(report.findings.map(x=>x.code)).toContain("REFUND_AMOUNT_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("REFUND_TOTAL_OVER_CAPTURE");
  });

  it("detects released escrow without transfer and transfer/payout mismatches", () => {
    const report=evaluateFinancialReconciliation({
      ledger:[],
      escrows:[{jobId:"job_2",milestoneId:"mile_2",released:true}],
      payouts:[{operationId:"payout_1",transferId:"tr_2",amount:500,currency:"gbp",destination:"acct_expected",status:"stripe_succeeded"}],
      transfers:[{transferId:"tr_2",amount:600,currency:"usd",destination:"acct_other"}],
    });
    expect(report.findings.map(x=>x.code)).toContain("ESCROW_RELEASE_TRANSFER_MISSING");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_AMOUNT_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_CURRENCY_MISMATCH");
    expect(report.findings.map(x=>x.code)).toContain("TRANSFER_DESTINATION_MISMATCH");
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
