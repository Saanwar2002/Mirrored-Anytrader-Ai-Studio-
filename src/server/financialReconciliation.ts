/**
 * Pure, read-only FIN-05 discrepancy evaluator.
 *
 * This module accepts already-fetched snapshots only. It deliberately has no
 * Firestore, Stripe, network, clock, or mutation dependencies.
 */
export type ReconciliationSeverity = "warning" | "critical";
export type ReconciliationFindingCode =
  | "DUPLICATE_LEDGER_ID"
  | "DUPLICATE_REFUND_ID"
  | "CAPTURE_LEDGER_MISSING"
  | "CAPTURE_AMOUNT_MISMATCH"
  | "CAPTURE_CURRENCY_MISMATCH"
  | "REFUND_ORPHANED"
  | "REFUND_AMOUNT_MISMATCH"
  | "REFUND_TOTAL_OVER_CAPTURE"
  | "TRANSFER_ORPHANED"
  | "TRANSFER_AMOUNT_MISMATCH"
  | "TRANSFER_CURRENCY_MISMATCH"
  | "TRANSFER_DESTINATION_MISMATCH"
  | "ESCROW_RELEASE_TRANSFER_MISSING"
  | "PAYOUT_ALLOCATION_EXCEEDED";

export interface ReconciliationLedgerSnapshot {
  entryId: string;
  transactionId?: string;
  stripePaymentIntentId?: string;
  stripeRefundId?: string;
  stripeTransferId?: string;
  jobId?: string;
  quoteId?: string;
  milestoneId?: string;
  payeeId?: string;
  amount: number;
  currency?: string;
  type: string;
  status?: string;
  direction?: string;
}
export interface ReconciliationCaptureSnapshot {
  paymentIntentId: string;
  amount: number;
  currency: string;
}
export interface ReconciliationRefundSnapshot {
  refundId: string;
  paymentIntentId?: string;
  amount: number;
  currency: string;
  status?: string;
}
export interface ReconciliationTransferSnapshot {
  transferId: string;
  amount: number;
  currency: string;
  destination?: string;
  metadata?: Record<string, string | undefined>;
}
export interface ReconciliationPayoutSnapshot {
  operationId: string;
  transferId?: string;
  amount: number;
  currency: string;
  destination?: string;
  status?: string;
}
export interface ReconciliationEscrowSnapshot {
  jobId: string;
  quoteId?: string;
  milestoneId: string;
  released?: boolean;
  releaseOperationId?: string;
  stripeTransferId?: string;
  releaseAmount?: number;
  currency?: string;
}
export interface FinancialReconciliationSnapshot {
  ledger: readonly ReconciliationLedgerSnapshot[];
  captures?: readonly ReconciliationCaptureSnapshot[];
  refunds?: readonly ReconciliationRefundSnapshot[];
  transfers?: readonly ReconciliationTransferSnapshot[];
  payouts?: readonly ReconciliationPayoutSnapshot[];
  escrows?: readonly ReconciliationEscrowSnapshot[];
  refundedTotals?: readonly { paymentIntentId: string; amount: number }[];
  /** Explicit business-authorized caps; evaluator never infers a cap. */
  payoutAllocationCaps?: readonly { destination: string; amount: number }[];
}
export interface ReconciliationFinding {
  code: ReconciliationFindingCode;
  severity: ReconciliationSeverity;
  entityId: string;
  message: string;
  sourceIds: string[];
}
export interface FinancialReconciliationReport {
  findingCount: number;
  criticalCount: number;
  findings: ReconciliationFinding[];
}

const normalizeCurrency = (value?: string) => (value || "").trim().toLowerCase();
const safeAmount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Evaluates immutable snapshots and returns stable, sorted findings. No input is mutated. */
export function evaluateFinancialReconciliation(
  snapshot: FinancialReconciliationSnapshot
): FinancialReconciliationReport {
  const findings: ReconciliationFinding[] = [];
  const add = (code: ReconciliationFindingCode, severity: ReconciliationSeverity, entityId: string, message: string, sourceIds: string[]) => {
    findings.push({ code, severity, entityId, message, sourceIds: [...new Set(sourceIds)].sort() });
  };
  const ledger = snapshot.ledger || [];
  const captures = snapshot.captures || [];
  const refunds = snapshot.refunds || [];
  const transfers = snapshot.transfers || [];
  const payouts = snapshot.payouts || [];
  const escrows = snapshot.escrows || [];
  const totals = snapshot.refundedTotals || [];

  const ledgerById = new Map<string, ReconciliationLedgerSnapshot[]>();
  for (const entry of ledger) {
    const rows = ledgerById.get(entry.entryId) || [];
    rows.push(entry); ledgerById.set(entry.entryId, rows);
  }
  for (const [id, rows] of ledgerById) if (rows.length > 1) {
    add("DUPLICATE_LEDGER_ID", "critical", id, "Ledger entry ID occurs more than once in the supplied snapshot.", rows.map(x => x.entryId));
  }

  const captureLedger = ledger.filter(x => x.type === "ESCROW_DEPOSIT" || x.type === "RIDE_PAYMENT");
  for (const capture of captures) {
    const rows = captureLedger.filter(x => x.transactionId === capture.paymentIntentId || x.stripePaymentIntentId === capture.paymentIntentId);
    if (!rows.length) {
      add("CAPTURE_LEDGER_MISSING", "critical", capture.paymentIntentId, "Confirmed capture has no matching original payment ledger entry.", [capture.paymentIntentId]);
      continue;
    }
    const amount = rows.reduce((sum, row) => sum + (safeAmount(row.amount) ? row.amount : 0), 0);
    if (amount !== capture.amount) add("CAPTURE_AMOUNT_MISMATCH", "critical", capture.paymentIntentId, "Capture amount differs from matching original ledger amount.", [capture.paymentIntentId, ...rows.map(x=>x.entryId)]);
    const currencies = new Set(rows.map(x=>normalizeCurrency(x.currency)));
    if (currencies.size !== 1 || !currencies.has(normalizeCurrency(capture.currency))) {
      add("CAPTURE_CURRENCY_MISMATCH", "critical", capture.paymentIntentId, "Capture currency differs from matching original ledger currency.", [capture.paymentIntentId, ...rows.map(x=>x.entryId)]);
    }
  }

  const refundsById = new Map<string, ReconciliationRefundSnapshot[]>();
  for (const refund of refunds) {
    const rows = refundsById.get(refund.refundId) || [];
    rows.push(refund); refundsById.set(refund.refundId, rows);
  }
  for (const [id, rows] of refundsById) if (rows.length > 1) {
    add("DUPLICATE_REFUND_ID", "critical", id, "Stripe refund ID occurs more than once in the supplied snapshot.", [id]);
  }
  for (const refund of refunds) {
    if (refund.status && refund.status !== "succeeded") continue;
    const refundLedger = ledger.filter(x => x.type === "REFUND" && x.stripeRefundId === refund.refundId);
    if (!refundLedger.length) {
      add("REFUND_ORPHANED", "critical", refund.refundId, "Succeeded Stripe refund has no matching refund ledger entry.", [refund.refundId, refund.paymentIntentId || ""]);
      continue;
    }
    const ledgerAmount = refundLedger.reduce((sum,row)=>sum+(safeAmount(row.amount)?row.amount:0),0);
    if (ledgerAmount !== refund.amount) add("REFUND_AMOUNT_MISMATCH","critical",refund.refundId,"Stripe refund amount differs from refund ledger amount.",[refund.refundId,...refundLedger.map(x=>x.entryId)]);
    if (refundLedger.some(x=>normalizeCurrency(x.currency)!==normalizeCurrency(refund.currency))) add("REFUND_AMOUNT_MISMATCH","critical",refund.refundId,"Stripe refund currency differs from refund ledger currency.",[refund.refundId,...refundLedger.map(x=>x.entryId)]);
  }
  for (const total of totals) {
    const capture = captures.find(x=>x.paymentIntentId===total.paymentIntentId);
    if (capture && total.amount > capture.amount) add("REFUND_TOTAL_OVER_CAPTURE","critical",total.paymentIntentId,"Recorded cumulative refunds exceed the captured amount.",[total.paymentIntentId]);
  }

  const transfersById = new Map<string, ReconciliationTransferSnapshot[]>();
  for (const transfer of transfers) {
    const rows=transfersById.get(transfer.transferId)||[]; rows.push(transfer); transfersById.set(transfer.transferId,rows);
  }
  const linkedTransferIds = new Set<string>();
  for (const payout of payouts) {
    if (!payout.transferId) continue;
    linkedTransferIds.add(payout.transferId);
    const candidates=transfersById.get(payout.transferId)||[];
    if (!candidates.length) {
      if (payout.status==="stripe_succeeded" || payout.status==="completed") add("TRANSFER_ORPHANED","critical",payout.transferId,"Payout operation claims a Stripe transfer absent from the supplied Stripe snapshot.",[payout.operationId,payout.transferId]);
      continue;
    }
    for(const transfer of candidates) {
      if(transfer.amount!==payout.amount) add("TRANSFER_AMOUNT_MISMATCH","critical",transfer.transferId,"Stripe transfer amount differs from payout operation amount.",[payout.operationId,transfer.transferId]);
      if(normalizeCurrency(transfer.currency)!==normalizeCurrency(payout.currency)) add("TRANSFER_CURRENCY_MISMATCH","critical",transfer.transferId,"Stripe transfer currency differs from payout operation currency.",[payout.operationId,transfer.transferId]);
      if(payout.destination && transfer.destination && payout.destination!==transfer.destination) add("TRANSFER_DESTINATION_MISMATCH","critical",transfer.transferId,"Stripe transfer destination differs from payout operation destination.",[payout.operationId,transfer.transferId]);
    }
  }
  for(const escrow of escrows) {
    if(!escrow.released) continue;
    const linkedId=escrow.stripeTransferId;
    if(!linkedId) {
      add("ESCROW_RELEASE_TRANSFER_MISSING","critical",escrow.milestoneId,"Released escrow has no Stripe transfer identity.",[escrow.jobId,escrow.quoteId||"",escrow.milestoneId,escrow.releaseOperationId||""]);
      continue;
    }
    linkedTransferIds.add(linkedId);
    const rows=transfersById.get(linkedId)||[];
    if(!rows.length) add("TRANSFER_ORPHANED","critical",linkedId,"Released escrow references a Stripe transfer absent from the supplied Stripe snapshot.",[escrow.jobId,escrow.milestoneId,linkedId]);
    for(const transfer of rows) {
      if(typeof escrow.releaseAmount==="number" && transfer.amount!==escrow.releaseAmount) add("TRANSFER_AMOUNT_MISMATCH","critical",linkedId,"Stripe transfer amount differs from escrow release amount.",[escrow.milestoneId,linkedId]);
      if(escrow.currency && normalizeCurrency(transfer.currency)!==normalizeCurrency(escrow.currency)) add("TRANSFER_CURRENCY_MISMATCH","critical",linkedId,"Stripe transfer currency differs from escrow release currency.",[escrow.milestoneId,linkedId]);
    }
  }
  for(const transfer of transfers) {
    if(linkedTransferIds.has(transfer.transferId)) continue;
    const hasLedger=ledger.some(x=>x.stripeTransferId===transfer.transferId && (x.type==="ESCROW_RELEASE" || x.type==="PLATFORM_COMMISSION"));
    if(!hasLedger) add("TRANSFER_ORPHANED","warning",transfer.transferId,"Stripe transfer has no matching payout, escrow or transfer ledger reference.",[transfer.transferId]);
  }

  const allocationByKey=new Map<string,number>();
  for(const payout of payouts) {
    const key=payout.destination||payout.operationId;
    allocationByKey.set(key,(allocationByKey.get(key)||0)+(safeAmount(payout.amount)?payout.amount:0));
  }
  // An allocation cap is meaningful only when a caller supplies a finite, positive
  // authorised amount in the snapshot. Avoid guessing a cap from ledger arithmetic.
  for(const cap of snapshot.payoutAllocationCaps||[]) {
    const allocated=allocationByKey.get(cap.destination)||0;
    if(safeAmount(cap.amount)&&allocated>cap.amount) add("PAYOUT_ALLOCATION_EXCEEDED","critical",cap.destination,"Payout operations exceed the explicitly supplied authorised allocation cap.",[cap.destination]);
  }

  findings.sort((a,b)=>a.code.localeCompare(b.code)||a.entityId.localeCompare(b.entityId)||a.message.localeCompare(b.message));
  return {findingCount:findings.length,criticalCount:findings.filter(x=>x.severity==="critical").length,findings};
}
