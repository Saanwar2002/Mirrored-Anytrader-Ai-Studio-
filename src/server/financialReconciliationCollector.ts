/**
 * Bounded, read-only Firestore/Stripe snapshot collector for FIN-05.
 *
 * No writes are issued. A truncated or malformed source scan throws instead
 * of returning a partial snapshot that could be mistaken for a full audit.
 */
import type {
  FinancialReconciliationSnapshot,
  ReconciliationLedgerSnapshot,
  ReconciliationPayoutSnapshot,
  ReconciliationEscrowSnapshot,
  ReconciliationRefundSnapshot,
  ReconciliationTransferSnapshot,
  ReconciliationCaptureSnapshot,
} from "./financialReconciliation.ts";

interface FirestoreDocumentLike {
  id: string;
  data(): Record<string, any>;
}
interface FirestoreQueryLike {
  orderBy(field: string): FirestoreQueryLike;
  limit(value: number): FirestoreQueryLike;
  startAfter(cursor: FirestoreDocumentLike): FirestoreQueryLike;
  get(): Promise<{ docs: FirestoreDocumentLike[] }>;
}
interface FirestoreCollectionLike extends FirestoreQueryLike {
  doc(id: string): { collection(name: string): FirestoreCollectionLike };
}
export interface FinancialReconciliationReadOnlyDb {
  collection(name: string): FirestoreCollectionLike;
}
export interface FinancialReconciliationReadOnlyStripe {
  paymentIntents: { retrieve(id: string): Promise<any> };
  refunds: { list(params: { payment_intent: string; limit: number; starting_after?: string }): Promise<any> };
  transfers: { list(params: { limit: number; starting_after?: string }): Promise<any> };
}
export interface FinancialReconciliationCollectorOptions {
  pageSize?: number;
  maxDocumentsPerCollection?: number;
  maxJobs?: number;
  maxQuotes?: number;
  maxPaymentIntentLookups?: number;
  stripePageSize?: number;
  maxStripePages?: number;
}
export interface FinancialReconciliationCollectionCoverage {
  firestore: Record<string, { documents: number; pages: number }>;
  paymentIntentLookups: number;
  stripeRefundPages: number;
  stripeTransferPages: number;
  complete: true;
}
export interface FinancialReconciliationCollectionResult {
  snapshot: FinancialReconciliationSnapshot;
  coverage: FinancialReconciliationCollectionCoverage;
}

function boundedInteger(value: unknown, fallback: number, maximum: number, field: string): number {
  const resolved: unknown = value === undefined ? fallback : value;
  if (typeof resolved !== "number" || !Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new Error("Invalid FIN-05 collector budget: " + field + " must be a positive integer no greater than " + maximum + ".");
  }
  return resolved;
}
function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function numeric(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}
function stripeObjectId(value: unknown): string | undefined {
  if (typeof value === "string") return text(value);
  return text(record(value).id);
}
function metadataStrings(value: unknown): Record<string, string | undefined> {
  const raw = record(value);
  return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, typeof item === "string" ? item : undefined]));
}
function refundSnapshotFingerprint(refund: ReconciliationRefundSnapshot): string {
  return JSON.stringify({
    paymentIntentId: refund.paymentIntentId || null,
    amount: refund.amount,
    currency: refund.currency.toLowerCase(),
    status: refund.status,
  });
}
function refundSourceFingerprint(refund: any, fallbackPaymentIntentId: string): string {
  return JSON.stringify({
    paymentIntentId: stripeObjectId(refund && refund.payment_intent) || fallbackPaymentIntentId,
    amount: typeof (refund && refund.amount) === "number" ? refund.amount : Number.NaN,
    currency: String((refund && refund.currency) || "").toLowerCase(),
    status: text(refund && refund.status) || "unknown",
  });
}
function transferFingerprint(transfer: ReconciliationTransferSnapshot): string {
  return JSON.stringify({
    amount: transfer.amount,
    currency: transfer.currency.toLowerCase(),
    destination: transfer.destination || null,
    metadata: Object.keys(transfer.metadata || {}).sort().map(key => [key, transfer.metadata && transfer.metadata[key]]),
  });
}
function transferSourceFingerprint(transfer: any): string {
  const metadata = metadataStrings(transfer && transfer.metadata);
  return JSON.stringify({
    amount: typeof (transfer && transfer.amount) === "number" ? transfer.amount : Number.NaN,
    currency: String((transfer && transfer.currency) || "").toLowerCase(),
    destination: stripeObjectId(transfer && transfer.destination) || null,
    metadata: Object.keys(metadata).sort().map(key => [key, metadata[key]]),
  });
}

/** Reads all documents up to maxDocuments and probes one extra row for truncation. */
async function readBoundedDocuments(
  collection: FirestoreCollectionLike,
  pageSize: number,
  maxDocuments: number,
  source: string
): Promise<{ docs: FirestoreDocumentLike[]; pages: number }> {
  const docs: FirestoreDocumentLike[] = [];
  let cursor: FirestoreDocumentLike | undefined;
  let pages = 0;
  for (;;) {
    const remaining = maxDocuments - docs.length;
    const requested = Math.min(pageSize, remaining + 1);
    let query = collection.orderBy("__name__").limit(requested);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    pages += 1;
    if (!page || !Array.isArray(page.docs)) {
      throw new Error("FIN-05 collection " + source + " returned a malformed Firestore page.");
    }
    if (page.docs.length > remaining) {
      throw new Error("FIN-05 collection " + source + " exceeded its " + maxDocuments + "-document read budget; no partial report was returned.");
    }
    if (page.docs.length === 0) break;
    const next = page.docs[page.docs.length - 1];
    if (!next || !next.id || (cursor && next.id === cursor.id)) {
      throw new Error("FIN-05 collection " + source + " pagination did not advance.");
    }
    docs.push(...page.docs);
    cursor = next;
    if (page.docs.length < requested) break;
  }
  return { docs, pages };
}

async function readStripePages(
  list: (params: any) => Promise<any>,
  baseParams: Record<string, unknown>,
  pageSize: number,
  budget: { pages: number; maxPages: number },
  source: string,
  visit: (item: any) => void
): Promise<number> {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  let localPages = 0;
  for (;;) {
    if (budget.pages >= budget.maxPages) {
      throw new Error("FIN-05 Stripe " + source + " pagination exceeded its " + budget.maxPages + "-page global budget; no partial report was returned.");
    }
    const page = await list(Object.assign({}, baseParams, { limit: pageSize }, cursor ? { starting_after: cursor } : {}));
    budget.pages += 1;
    localPages += 1;
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned a malformed FIN-05 " + source + " page.");
    }
    for (const item of page.data) visit(item);
    if (!page.has_more) return localPages;
    const lastId = text(page.data.length ? page.data[page.data.length - 1].id : undefined);
    if (!lastId || seenCursors.has(lastId)) {
      throw new Error("Stripe FIN-05 " + source + " pagination did not advance; no partial report was returned.");
    }
    seenCursors.add(lastId);
    cursor = lastId;
  }
}

export async function collectFinancialReconciliationSnapshot(
  db: FinancialReconciliationReadOnlyDb,
  stripe: FinancialReconciliationReadOnlyStripe,
  options: FinancialReconciliationCollectorOptions = {}
): Promise<FinancialReconciliationCollectionResult> {
  if (!db || typeof db.collection !== "function" || !stripe || !stripe.paymentIntents ||
      !stripe.paymentIntents.retrieve || !stripe.refunds || !stripe.refunds.list ||
      !stripe.transfers || !stripe.transfers.list) {
    throw new Error("FIN-05 requires Firestore read access and Stripe read-only PaymentIntent, refund, and transfer methods.");
  }
  const pageSize = boundedInteger(options.pageSize, 100, 500, "pageSize");
  const maxDocuments = boundedInteger(options.maxDocumentsPerCollection, 2000, 20000, "maxDocumentsPerCollection");
  const maxJobs = boundedInteger(options.maxJobs, 1000, 10000, "maxJobs");
  const maxQuotes = boundedInteger(options.maxQuotes, 5000, 50000, "maxQuotes");
  const maxPaymentIntents = boundedInteger(options.maxPaymentIntentLookups, 1000, 10000, "maxPaymentIntentLookups");
  const stripePageSize = boundedInteger(options.stripePageSize, 100, 100, "stripePageSize");
  const maxStripePages = boundedInteger(options.maxStripePages, 100, 2000, "maxStripePages");
  const coverage: FinancialReconciliationCollectionCoverage = {
    firestore: {},
    paymentIntentLookups: 0,
    stripeRefundPages: 0,
    stripeTransferPages: 0,
    complete: true,
  };
  const readCollection = async (name: string, limit = maxDocuments) => {
    const result = await readBoundedDocuments(db.collection(name), pageSize, limit, name);
    coverage.firestore[name] = { documents: result.docs.length, pages: result.pages };
    return result.docs;
  };
  const [ledgerDocs, payoutDocs, paymentIntentDocs, refundTotalDocs, refundOperationDocs, refundRecordDocs, jobDocs] = await Promise.all([
    readCollection("payment_ledger"),
    readCollection("driver_payout_operations"),
    readCollection("payment_intents"),
    readCollection("payment_refund_totals"),
    readCollection("refund_operations"),
    readCollection("refund_records"),
    readCollection("jobs", maxJobs),
  ]);

  const ledger: ReconciliationLedgerSnapshot[] = ledgerDocs.map(doc => {
    const item = record(doc.data());
    return {
      entryId: text(item.entryId) || doc.id,
      transactionId: text(item.transactionId),
      stripePaymentIntentId: text(item.stripePaymentIntentId),
      stripeRefundId: text(item.stripeRefundId),
      stripeTransferId: text(item.stripeTransferId),
      jobId: text(item.jobId),
      quoteId: text(item.quoteId),
      milestoneId: text(item.milestoneId),
      payeeId: text(item.payeeId),
      amount: numeric(item.amount),
      currency: text(item.currency),
      type: text(item.type) || "UNKNOWN",
      status: text(item.status),
      direction: text(item.direction),
    };
  });
  const ledgerById = new Map(ledger.map(entry => [entry.entryId, entry]));
  const ledgerDocByEntryId = new Map(ledgerDocs.map(doc => {
    const raw = record(doc.data());
    return [text(raw.entryId) || doc.id, raw] as const;
  }));
  const payouts: ReconciliationPayoutSnapshot[] = payoutDocs.map(doc => {
    const item = record(doc.data());
    return {
      operationId: text(item.operationId) || doc.id,
      transferId: text(item.stripeTransferId),
      rideId: text(item.rideId),
      driverId: text(item.driverId),
      amount: numeric(item.amountPence),
      currency: text(item.currency) || "gbp",
      destination: text(item.stripeAccountId),
      status: text(item.status),
    };
  });
  const refundedTotals = refundTotalDocs.map(doc => {
    const item = record(doc.data());
    return { paymentIntentId: text(item.paymentIntentId) || doc.id, amount: numeric(item.refundedAmountPence) };
  });

  const paymentIntentIds = new Set<string>();
  const paymentIntentByMilestone = new Map<string, string>();
  const addPaymentIntentId = (value: unknown) => {
    const id = text(value);
    if (!id) return;
    if (!/^pi_[A-Za-z0-9]+$/.test(id)) {
      throw new Error("FIN-05 encountered a malformed PaymentIntent identity; no partial report was returned.");
    }
    paymentIntentIds.add(id);
  };
  for (const doc of paymentIntentDocs) {
    const item = record(doc.data());
    const metadata = record(item.metadata);
    const paymentType = text(metadata.type);
    const paymentIntentId = text(item.paymentIntentId);
    if (paymentType === "milestone_funding" || paymentType === "ride_payment") addPaymentIntentId(paymentIntentId);
    if (paymentType === "milestone_funding" && paymentIntentId) {
      const jobId = text(metadata.jobId);
      const quoteId = text(metadata.quoteId);
      const milestoneId = text(metadata.milestoneId);
      if (jobId && quoteId && milestoneId) {
        paymentIntentByMilestone.set(JSON.stringify([jobId, quoteId, milestoneId]), paymentIntentId);
      }
    }
  }
  for (const entry of ledger) {
    addPaymentIntentId(entry.stripePaymentIntentId);
    if (entry.transactionId && entry.transactionId.startsWith("pi_")) addPaymentIntentId(entry.transactionId);
  }
  for (const doc of refundTotalDocs) addPaymentIntentId(record(doc.data()).paymentIntentId);
  for (const doc of refundOperationDocs) addPaymentIntentId(record(doc.data()).paymentIntentId);
  // refund_records are durable Stripe-refund evidence; they must still drive a
  // Stripe lookup when a corresponding payment_ledger row is absent.
  for (const doc of refundRecordDocs) addPaymentIntentId(record(doc.data()).transactionId);
  if (paymentIntentIds.size > maxPaymentIntents) {
    throw new Error("FIN-05 has " + paymentIntentIds.size + " PaymentIntents, exceeding the " + maxPaymentIntents + "-lookup budget; no partial report was returned.");
  }

  const stripeBudget = { pages: 0, maxPages: maxStripePages };
  const captures: ReconciliationCaptureSnapshot[] = [];
  const destinationChargePaymentIntentIds = new Set<string>();
  const refundsById = new Map<string, ReconciliationRefundSnapshot>();
  for (const paymentIntentId of [...paymentIntentIds].sort()) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    coverage.paymentIntentLookups += 1;
    if (!intent || stripeObjectId(intent) !== paymentIntentId) {
      throw new Error("Stripe PaymentIntent lookup did not return the requested identity " + paymentIntentId + "; no partial report was returned.");
    }
    if (intent.status === "succeeded") {
      captures.push({
        paymentIntentId,
        amount: numeric(intent.amount_received),
        currency: String(intent.currency || "").toLowerCase(),
      });
    }
    // A destination charge is evidenced by Stripe's own PaymentIntent transfer
    // target, not by a client- or legacy milestone flag.
    if (stripeObjectId(record(intent.transfer_data).destination)) {
      destinationChargePaymentIntentIds.add(paymentIntentId);
    }
    const refundPages = await readStripePages(
      params => stripe.refunds.list(params),
      { payment_intent: paymentIntentId },
      stripePageSize,
      stripeBudget,
      "refunds for " + paymentIntentId,
      refund => {
        const refundId = text(refund && refund.id);
        if (!refundId) throw new Error("Stripe returned a refund without an ID; no partial report was returned.");
        const linkedPaymentIntent = stripeObjectId(refund.payment_intent) || paymentIntentId;
        const candidate: ReconciliationRefundSnapshot = {
          refundId,
          paymentIntentId: linkedPaymentIntent,
          amount: numeric(refund.amount),
          currency: String(refund.currency || "").toLowerCase(),
          status: text(refund.status) || "unknown",
        };
        const existing = refundsById.get(refundId);
        if (existing && refundSnapshotFingerprint(existing) !== refundSourceFingerprint(refund, paymentIntentId)) {
          throw new Error("Stripe returned conflicting financial evidence for refund " + refundId + "; no partial report was returned.");
        }
        if (!existing) refundsById.set(refundId, candidate);
      }
    );
    coverage.stripeRefundPages += refundPages;
  }

  let quotesRead = 0;
  let quotePages = 0;
  const quoteDocsByJob = new Map<string, FirestoreDocumentLike[]>();
  for (const jobDoc of jobDocs) {
    const quoteResult = await readBoundedDocuments(
      db.collection("jobs").doc(jobDoc.id).collection("quotes"),
      pageSize,
      maxQuotes - quotesRead,
      "jobs/" + jobDoc.id + "/quotes"
    );
    quotesRead += quoteResult.docs.length;
    quotePages += quoteResult.pages;
    quoteDocsByJob.set(jobDoc.id, quoteResult.docs);
  }
  coverage.firestore.jobQuotes = { documents: quotesRead, pages: quotePages };

  const expectedTransferIds = new Set<string>();
  for (const entry of ledger) if (entry.stripeTransferId) expectedTransferIds.add(entry.stripeTransferId);
  for (const payout of payouts) if (payout.transferId) expectedTransferIds.add(payout.transferId);
  for (const quoteDocs of quoteDocsByJob.values()) {
    for (const quoteDoc of quoteDocs) {
      const quote = record(quoteDoc.data());
      for (const milestoneValue of Array.isArray(quote.milestones) ? quote.milestones : []) {
        const milestone = record(milestoneValue);
        const directTransferId = text(milestone.stripeTransferId);
        if (directTransferId) expectedTransferIds.add(directTransferId);
        const releaseLedgerId = text(milestone.escrowReleaseLedgerId);
        const releaseLedger = releaseLedgerId ? ledgerById.get(releaseLedgerId) : undefined;
        if (releaseLedger && releaseLedger.stripeTransferId) expectedTransferIds.add(releaseLedger.stripeTransferId);
      }
    }
  }

  const transfersById = new Map<string, ReconciliationTransferSnapshot>();
  const transferPages = await readStripePages(
    params => stripe.transfers.list(params),
    {},
    stripePageSize,
    stripeBudget,
    "transfers",
    transfer => {
      const transferId = text(transfer && transfer.id);
      if (!transferId) throw new Error("Stripe returned a transfer without an ID; no partial report was returned.");
      const transferMetadata = metadataStrings(transfer.metadata);
      const isAnyTraderTransfer = expectedTransferIds.has(transferId) ||
        transferMetadata.operationType === "ANYTRADER_ESCROW_RELEASE" ||
        transferMetadata.type === "orchestrated_driver_payout";
      if (!isAnyTraderTransfer) return;
      const candidate: ReconciliationTransferSnapshot = {
        transferId,
        amount: numeric(transfer.amount),
        currency: String(transfer.currency || "").toLowerCase(),
        destination: stripeObjectId(transfer.destination),
        metadata: transferMetadata,
      };
      const existing = transfersById.get(transferId);
      if (existing && transferFingerprint(existing) !== transferSourceFingerprint(transfer)) {
        throw new Error("Stripe returned conflicting financial evidence for transfer " + transferId + "; no partial report was returned.");
      }
      if (!existing) transfersById.set(transferId, candidate);
    }
  );
  coverage.stripeTransferPages = transferPages;

  const escrows: ReconciliationEscrowSnapshot[] = [];
  for (const [jobId, quoteDocs] of quoteDocsByJob) {
    for (const quoteDoc of quoteDocs) {
      const quote = record(quoteDoc.data());
      const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
      for (const milestoneValue of milestones) {
        const milestone = record(milestoneValue);
        const released = milestone.status === "released" || milestone.status === "funds_released" || Boolean(milestone.releasedAt);
        if (!released) continue;
        const milestoneId = text(milestone.id);
        if (!milestoneId) {
          throw new Error("FIN-05 found a released milestone without an ID in job " + jobId + ", quote " + quoteDoc.id + "; no partial report was returned.");
        }
        const explicitLedgerId = text(milestone.escrowReleaseLedgerId);
        let releaseLedger = explicitLedgerId ? ledgerById.get(explicitLedgerId) : undefined;
        if (!releaseLedger && !explicitLedgerId) {
          const candidates = ledger.filter(entry => entry.type === "ESCROW_RELEASE" &&
            entry.jobId === jobId && entry.quoteId === quoteDoc.id && entry.milestoneId === milestoneId);
          if (candidates.length > 1) {
            throw new Error("FIN-05 found multiple release ledger entries for " + jobId + "/" + quoteDoc.id + "/" + milestoneId + "; manual review is required.");
          }
          releaseLedger = candidates[0];
        }
        if (releaseLedger && (releaseLedger.type !== "ESCROW_RELEASE" || releaseLedger.jobId !== jobId ||
            releaseLedger.quoteId !== quoteDoc.id || releaseLedger.milestoneId !== milestoneId)) {
          throw new Error("FIN-05 escrow release ledger link does not match " + jobId + "/" + quoteDoc.id + "/" + milestoneId + "; manual review is required.");
        }
        const rawLedger = releaseLedger ? ledgerDocByEntryId.get(releaseLedger.entryId) || {} : {};
        const milestonePaymentIntentId = text(milestone.stripePaymentIntentId) ||
          paymentIntentByMilestone.get(JSON.stringify([jobId, quoteDoc.id, milestoneId]));
        const destinationCharge = Boolean(
          milestonePaymentIntentId && destinationChargePaymentIntentIds.has(milestonePaymentIntentId)
        );
        escrows.push({
          jobId,
          quoteId: quoteDoc.id,
          milestoneId,
          released: true,
          releaseOperationId: text(milestone.releaseOperationId) || text(rawLedger.idempotencyKey),
          stripeTransferId: releaseLedger && releaseLedger.stripeTransferId || text(milestone.stripeTransferId),
          // Stripe escrow transfers use netPayout, not gross milestone amount.
          releaseAmount: typeof rawLedger.netPayout === "number" ? rawLedger.netPayout : undefined,
          currency: releaseLedger && releaseLedger.currency,
          transferExpected: !destinationCharge && milestone.isDestinationCharge !== true,
          releaseLedgerPresent: Boolean(releaseLedger),
        });
      }
    }
  }

  return {
    snapshot: {
      ledger,
      captures,
      refunds: [...refundsById.values()],
      transfers: [...transfersById.values()],
      payouts,
      escrows,
      refundedTotals,
    },
    coverage,
  };
}
