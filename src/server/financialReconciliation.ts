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
  | "DUPLICATE_TRANSFER_ID"
  | "CAPTURE_LEDGER_MISSING"
  | "CAPTURE_AMOUNT_MISMATCH"
  | "CAPTURE_CURRENCY_MISMATCH"
  | "CAPTURE_LEDGER_NOT_COMPLETED"
  | "REFUND_ORPHANED"
  | "REFUND_LEDGER_NOT_COMPLETED"
  | "REFUND_AMOUNT_MISMATCH"
  | "REFUND_TOTAL_OVER_CAPTURE"
  | "TRANSFER_ORPHANED"
  | "TRANSFER_AMOUNT_MISMATCH"
  | "TRANSFER_CURRENCY_MISMATCH"
  | "TRANSFER_DESTINATION_MISMATCH"
  | "TRANSFER_METADATA_MISMATCH"
  | "PAYOUT_TRANSFER_ID_MISSING"
  | "ESCROW_RELEASE_LEDGER_MISSING"
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
  status: string;
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
  rideId?: string;
  driverId?: string;
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
  /** False for destination charges, where no platform transfer is expected. */
  transferExpected?: boolean;
  /** Whether the matching immutable ESCROW_RELEASE ledger row was resolved. */
  releaseLedgerPresent?: boolean;
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
    const candidates = captureLedger.filter(x => x.transactionId === capture.paymentIntentId || x.stripePaymentIntentId === capture.paymentIntentId);
    if (!candidates.length) {
      add("CAPTURE_LEDGER_MISSING", "critical", capture.paymentIntentId, "Confirmed capture has no matching original payment ledger entry.", [capture.paymentIntentId]);
      continue;
    }
    const rows = candidates.filter(x => x.status === "completed");
    if (!rows.length) {
      add("CAPTURE_LEDGER_NOT_COMPLETED", "critical", capture.paymentIntentId, "Matching capture ledger entries exist, but none is completed.", [capture.paymentIntentId, ...candidates.map(x=>x.entryId)]);
      continue;
    }
    const amountsValid = rows.every(row => safeAmount(row.amount));
    const amount = rows.reduce((sum, row) => sum + (safeAmount(row.amount) ? row.amount : 0), 0);
    if (!amountsValid || amount !== capture.amount) add("CAPTURE_AMOUNT_MISMATCH", "critical", capture.paymentIntentId, "Capture amount differs from matching completed ledger amount.", [capture.paymentIntentId, ...rows.map(x=>x.entryId)]);
    const currencies = new Set(rows.map(x=>normalizeCurrency(x.currency)));
    if (currencies.size !== 1 || !currencies.has(normalizeCurrency(capture.currency))) {
      add("CAPTURE_CURRENCY_MISMATCH", "critical", capture.paymentIntentId, "Capture currency differs from matching completed ledger currency.", [capture.paymentIntentId, ...rows.map(x=>x.entryId)]);
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
    if (refund.status !== "succeeded") continue;
    const candidates = ledger.filter(x => x.type === "REFUND" && x.stripeRefundId === refund.refundId);
    if (!candidates.length) {
      add("REFUND_ORPHANED", "critical", refund.refundId, "Succeeded Stripe refund has no matching refund ledger entry.", [refund.refundId, refund.paymentIntentId || ""]);
      continue;
    }
    const refundLedger = candidates.filter(x => x.status === "completed");
    if (!refundLedger.length) {
      add("REFUND_LEDGER_NOT_COMPLETED", "critical", refund.refundId, "Matching refund ledger entries exist, but none is completed.", [refund.refundId, ...candidates.map(x=>x.entryId)]);
      continue;
    }
    if (refund.paymentIntentId && refundLedger.some(x => (x.stripePaymentIntentId || x.transactionId) !== refund.paymentIntentId)) add("REFUND_AMOUNT_MISMATCH", "critical", refund.refundId, "Refund ledger entry references a different payment intent.", [refund.refundId, ...refundLedger.map(x=>x.entryId)]);
    const amountsValid = refundLedger.every(row => safeAmount(row.amount));
    const ledgerAmount = refundLedger.reduce((sum,row)=>sum+(safeAmount(row.amount)?row.amount:0),0);
    if (!amountsValid || ledgerAmount !== refund.amount) add("REFUND_AMOUNT_MISMATCH","critical",refund.refundId,"Stripe refund amount differs from completed refund ledger amount.",[refund.refundId,...refundLedger.map(x=>x.entryId)]);
    if (refundLedger.some(x=>normalizeCurrency(x.currency)!==normalizeCurrency(refund.currency))) add("REFUND_AMOUNT_MISMATCH","critical",refund.refundId,"Stripe refund currency differs from completed refund ledger currency.",[refund.refundId,...refundLedger.map(x=>x.entryId)]);
  }
  for (const total of totals) {
    const capture = captures.find(x=>x.paymentIntentId===total.paymentIntentId);
    if (capture && total.amount > capture.amount) add("REFUND_TOTAL_OVER_CAPTURE","critical",total.paymentIntentId,"Recorded cumulative refunds exceed the captured amount.",[total.paymentIntentId]);
  }

  const transfersById = new Map<string, ReconciliationTransferSnapshot[]>();
  for (const transfer of transfers) {
    const rows=transfersById.get(transfer.transferId)||[]; rows.push(transfer); transfersById.set(transfer.transferId,rows);
  }
  for (const [id, rows] of transfersById) if (rows.length > 1) {
    add("DUPLICATE_TRANSFER_ID", "critical", id, "Stripe transfer ID occurs more than once in the supplied snapshot.", [id]);
  }
  const linkedTransferIds = new Set<string>();
  for (const payout of payouts) {
    if (!payout.transferId || !payout.transferId.trim()) {
      if (payout.status === "stripe_succeeded" || payout.status === "completed" || payout.status === "reconciliation_required") {
        add("PAYOUT_TRANSFER_ID_MISSING", "critical", payout.operationId, "Payout operation may have completed or requires reconciliation but has no Stripe transfer identity.", [payout.operationId]);
      }
      continue;
    }
    linkedTransferIds.add(payout.transferId);
    const candidates=transfersById.get(payout.transferId)||[];
    if (!candidates.length) {
      if (payout.status==="stripe_succeeded" || payout.status==="completed") add("TRANSFER_ORPHANED","critical",payout.transferId,"Payout operation claims a Stripe transfer absent from the supplied Stripe snapshot.",[payout.operationId,payout.transferId]);
      continue;
    }
    for(const transfer of candidates) {
      if(transfer.amount!==payout.amount) add("TRANSFER_AMOUNT_MISMATCH","critical",transfer.transferId,"Stripe transfer amount differs from payout operation amount.",[payout.operationId,transfer.transferId]);
      if(normalizeCurrency(transfer.currency)!==normalizeCurrency(payout.currency)) add("TRANSFER_CURRENCY_MISMATCH","critical",transfer.transferId,"Stripe transfer currency differs from payout operation currency.",[payout.operationId,transfer.transferId]);
      if(payout.destination && payout.destination!==transfer.destination) add("TRANSFER_DESTINATION_MISMATCH","critical",transfer.transferId,"Stripe transfer destination is missing or differs from payout operation destination.",[payout.operationId,transfer.transferId]);
      const payoutMetadataChecks: Array<[string, string | undefined]> = [
        ["rideId", payout.rideId],
        ["driverId", payout.driverId],
        ["type", payout.rideId || payout.driverId ? "orchestrated_driver_payout" : undefined],
      ];
      for (const [key, expected] of payoutMetadataChecks) {
        if (expected !== undefined && transfer.metadata?.[key] !== expected) {
          add("TRANSFER_METADATA_MISMATCH", "critical", transfer.transferId, `Stripe transfer metadata ${key} is missing or differs from payout operation evidence.`, [payout.operationId, transfer.transferId]);
        }
      }
    }
  }
  for(const escrow of escrows) {
    if(!escrow.released) continue;
    if (escrow.releaseLedgerPresent === false) {
      add("ESCROW_RELEASE_LEDGER_MISSING", "critical", escrow.milestoneId, "Released escrow has no matching immutable ESCROW_RELEASE ledger entry.", [escrow.jobId, escrow.quoteId || "", escrow.milestoneId, escrow.releaseOperationId || ""]);
    }
    const linkedId=escrow.stripeTransferId;
    if(!linkedId) {
      if (escrow.transferExpected !== false) {
        add("ESCROW_RELEASE_TRANSFER_MISSING","critical",escrow.milestoneId,"Released escrow expected a Stripe transfer but has no transfer identity.",[escrow.jobId,escrow.quoteId||"",escrow.milestoneId,escrow.releaseOperationId||""]);
      }
      continue;
    }
    linkedTransferIds.add(linkedId);
    const rows=transfersById.get(linkedId)||[];
    if(!rows.length) add("TRANSFER_ORPHANED","critical",linkedId,"Released escrow references a Stripe transfer absent from the supplied Stripe snapshot.",[escrow.jobId,escrow.milestoneId,linkedId]);
    for(const transfer of rows) {
      if(typeof escrow.releaseAmount==="number" && transfer.amount!==escrow.releaseAmount) add("TRANSFER_AMOUNT_MISMATCH","critical",linkedId,"Stripe transfer amount differs from escrow release amount.",[escrow.milestoneId,linkedId]);
      if(escrow.currency && normalizeCurrency(transfer.currency)!==normalizeCurrency(escrow.currency)) add("TRANSFER_CURRENCY_MISMATCH","critical",linkedId,"Stripe transfer currency differs from escrow release currency.",[escrow.milestoneId,linkedId]);
      const escrowMetadataChecks: Array<[string, string | undefined]> = [
        ["jobId", escrow.jobId],
        ["quoteId", escrow.quoteId],
        ["milestoneId", escrow.milestoneId],
        ["releaseOperationId", escrow.releaseOperationId],
        ["operationType", "ANYTRADER_ESCROW_RELEASE"],
      ];
      for (const [key, expected] of escrowMetadataChecks) {
        if (expected !== undefined && transfer.metadata?.[key] !== expected) {
          add("TRANSFER_METADATA_MISMATCH", "critical", linkedId, `Stripe transfer metadata ${key} is missing or differs from released escrow evidence.`, [escrow.jobId, escrow.milestoneId, linkedId]);
        }
      }
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
