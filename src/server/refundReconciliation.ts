import crypto from "crypto";
import { BadRequestError, ConflictError, NotFoundError } from "./httpErrors.ts";

export type RefundOperationStatus = "pending" | "submitted" | "failed" | "succeeded" | "requires_review";

export interface RefundOperation {
  operationId: string;
  paymentIntentId: string;
  requestedAmountPence: number;
  currency: string;
  idempotencyKey: string;
  status: RefundOperationStatus;
  stripeRefundId?: string;
  createdAt: string;
  updatedAt: string;
}

export function getRefundEventReconciliationStatus(
  requiresReview: boolean,
  requiresPaginationReview: boolean
): "reconciled" | "requires_review" {
  return requiresReview || requiresPaginationReview ? "requires_review" : "reconciled";
}

export interface ConfirmedRefundInput {
  refundId: string;
  chargeId: string;
  paymentIntentId: string;
  originalLedgerEntryId: string;
  amountPence: number;
  currency: string;
  operationId?: string;
  reason?: string | null;
  stripeRefundStatus: string;
}

export interface RefundLedgerEntry {
  entryId: string;
  transactionId: string;
  idempotencyKey: string;
  payerId: string;
  payeeId: string;
  amount: number;
  platformFee: number;
  netPayout: number;
  currency: string;
  type: "REFUND";
  status: "completed";
  direction: "outflow";
  stripeRefundId: string;
  stripeChargeId: string;
  operationId?: string;
  reversalOfEntryId: string;
  createdAt: string;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${field} is required.`);
  }
  return value.trim();
}

function requirePositiveMinorAmount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestError(`${field} must be a positive integer in minor currency units.`);
  }
  return value;
}

/**
 * Reserves the durable business operation before calling Stripe.
 * The caller must pass this operation's stable idempotencyKey to Stripe's
 * refunds.create request. This function deliberately performs no Stripe I/O.
 */
export async function reserveRefundOperation(
  db: any,
  input: {
    operationId: string;
    paymentIntentId: string;
    requestedAmountPence: number;
    currency: string;
  }
): Promise<{ operation: RefundOperation; wasReplayed: boolean }> {
  if (!db || typeof db.runTransaction !== "function") {
    throw new BadRequestError("A database is required to reserve a refund operation.");
  }
  const operationId = requireText(input.operationId, "operationId");
  const paymentIntentId = requireText(input.paymentIntentId, "paymentIntentId");
  const requestedAmountPence = requirePositiveMinorAmount(input.requestedAmountPence, "requestedAmountPence");
  const currency = requireText(input.currency, "currency").toLowerCase();
  const idempotencyKey = `refund:${operationId}`;
  const ref = db.collection("refund_operations").doc(operationId);

  return db.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const existing = snapshot.data() as RefundOperation;
      if (
        existing.paymentIntentId !== paymentIntentId ||
        existing.requestedAmountPence !== requestedAmountPence ||
        existing.currency !== currency ||
        existing.idempotencyKey !== idempotencyKey
      ) {
        throw new ConflictError("Refund operation ID was already reserved with different payment details.");
      }
      return { operation: existing, wasReplayed: true };
    }

    const now = new Date().toISOString();
    const operation: RefundOperation = {
      operationId,
      paymentIntentId,
      requestedAmountPence,
      currency,
      idempotencyKey,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    tx.create ? tx.create(ref, operation) : tx.set(ref, operation);
    return { operation, wasReplayed: false };
  });
}

/**
 * Reconciles one Stripe refund object into the immutable financial ledger.
 * Refund documents are keyed by Stripe refund ID (not webhook event ID), and
 * a per-payment aggregate is updated in the same transaction to prevent
 * concurrent partial refunds from exceeding the original captured amount.
 *
 * amountPence is the individual refund amount, not Charge.amount_refunded
 * (which is a cumulative charge-level total).
 */
export async function recordConfirmedRefund(
  db: any,
  input: ConfirmedRefundInput
): Promise<{ entry: RefundLedgerEntry; wasReplayed: boolean; cumulativeRefundedPence: number }> {
  if (!db || typeof db.runTransaction !== "function") {
    throw new BadRequestError("A database is required to reconcile a confirmed refund.");
  }
  const refundId = requireText(input.refundId, "refundId");
  const chargeId = requireText(input.chargeId, "chargeId");
  const paymentIntentId = requireText(input.paymentIntentId, "paymentIntentId");
  const originalLedgerEntryId = requireText(input.originalLedgerEntryId, "originalLedgerEntryId");
  const amountPence = requirePositiveMinorAmount(input.amountPence, "amountPence");
  const currency = requireText(input.currency, "currency").toLowerCase();
  const stripeRefundStatus = requireText(input.stripeRefundStatus, "stripeRefundStatus");
  if (stripeRefundStatus !== "succeeded") {
    throw new ConflictError("Only Stripe refunds with succeeded status can be recorded in the financial ledger.");
  }
  const operationId = input.operationId ? requireText(input.operationId, "operationId") : undefined;

  const refundRef = db.collection("refund_records").doc(refundId);
  const originalRef = db.collection("payment_ledger").doc(originalLedgerEntryId);
  const paymentHash = crypto.createHash("sha256").update(paymentIntentId).digest("hex").slice(0, 32);
  const totalRef = db.collection("payment_refund_totals").doc(paymentHash);
  const operationRef = operationId ? db.collection("refund_operations").doc(operationId) : null;

  return db.runTransaction(async (tx: any) => {
    const [refundSnap, originalSnap, totalSnap, operationSnap] = await Promise.all([
      tx.get(refundRef),
      tx.get(originalRef),
      tx.get(totalRef),
      operationRef ? tx.get(operationRef) : Promise.resolve(null),
    ]);

    if (refundSnap.exists) {
      const existing = refundSnap.data() as RefundLedgerEntry;
      if (
        existing.transactionId !== paymentIntentId ||
        existing.amount !== amountPence ||
        existing.currency?.toLowerCase() !== currency ||
        existing.stripeChargeId !== chargeId ||
        existing.reversalOfEntryId !== originalLedgerEntryId
      ) {
        throw new ConflictError("Stripe refund ID already exists with conflicting payment details.");
      }
      if (operationId) {
        if (!operationSnap?.exists) {
          throw new NotFoundError("The reserved refund operation was not found for an existing refund.");
        }
        const replayOperation = operationSnap.data();
        if (
          replayOperation.paymentIntentId !== paymentIntentId ||
          replayOperation.requestedAmountPence !== amountPence ||
          String(replayOperation.currency || "").toLowerCase() !== currency ||
          replayOperation.status !== "succeeded" ||
          replayOperation.stripeRefundId !== refundId
        ) {
          throw new ConflictError("Existing refund is not linked to the supplied succeeded refund operation.");
        }
      }
      if (!originalSnap.exists) {
        throw new ConflictError("Original payment ledger entry is missing for an existing refund.");
      }
      const replayOriginal = originalSnap.data();
      if (
        replayOriginal.transactionId !== paymentIntentId ||
        String(replayOriginal.currency || "").toLowerCase() !== currency ||
        replayOriginal.status !== "completed" ||
        !["ESCROW_DEPOSIT", "PLATFORM_COMMISSION"].includes(replayOriginal.type) ||
        !Number.isSafeInteger(replayOriginal.amount) ||
        replayOriginal.amount <= 0 ||
        !totalSnap?.exists
      ) {
        throw new ConflictError("Stored refund totals are missing or do not match an eligible original payment.");
      }
      const replayTotal = totalSnap.data();
      const total = Number(replayTotal.refundedAmountPence);
      if (
        replayTotal.paymentIntentId !== paymentIntentId ||
        replayTotal.originalLedgerEntryId !== originalLedgerEntryId ||
        replayTotal.originalAmountPence !== replayOriginal.amount ||
        String(replayTotal.currency || "").toLowerCase() !== currency ||
        !Number.isSafeInteger(total) ||
        total < amountPence ||
        total > replayOriginal.amount
      ) {
        throw new ConflictError("Stored refund total is inconsistent with the existing refund.");
      }
      return { entry: existing, wasReplayed: true, cumulativeRefundedPence: total };
    }

    if (!originalSnap.exists) throw new NotFoundError("Original payment ledger entry was not found.");
    const original = originalSnap.data();
    if (original.transactionId !== paymentIntentId) {
      throw new ConflictError("Original ledger entry does not belong to the supplied PaymentIntent.");
    }
    if (String(original.currency || "").toLowerCase() !== currency) {
      throw new ConflictError("Refund currency does not match the original payment.");
    }
    if (
      original.status !== "completed" ||
      !["ESCROW_DEPOSIT", "PLATFORM_COMMISSION"].includes(original.type)
    ) {
      throw new ConflictError("Only completed original payment entries can be refunded.");
    }

    const originalAmount = requirePositiveMinorAmount(original.amount, "original payment amount");
    const totalData = totalSnap?.exists ? totalSnap.data() : null;
    if (totalData && (
      totalData.originalLedgerEntryId !== originalLedgerEntryId ||
      totalData.originalAmountPence !== originalAmount ||
      String(totalData.currency || "").toLowerCase() !== currency
    )) {
      throw new ConflictError("Existing refund totals are bound to a different original payment.");
    }
    const previousRefunded = totalData ? Number(totalData.refundedAmountPence || 0) : 0;
    if (!Number.isSafeInteger(previousRefunded) || previousRefunded < 0 || previousRefunded > originalAmount) {
      throw new ConflictError("Stored refund total is inconsistent with the original payment.");
    }
    if (amountPence > originalAmount - previousRefunded) {
      throw new ConflictError("Refund amount exceeds the remaining refundable balance.");
    }

    if (operationRef && !operationSnap?.exists) {
      throw new NotFoundError("The reserved refund operation was not found.");
    }
    if (operationSnap?.exists) {
      const operation = operationSnap.data();
      if (
        operation.paymentIntentId !== paymentIntentId ||
        operation.requestedAmountPence !== amountPence ||
        String(operation.currency || "").toLowerCase() !== currency ||
        (operation.stripeRefundId && operation.stripeRefundId !== refundId) ||
        !["pending", "submitted", "requires_review"].includes(operation.status)
      ) {
        throw new ConflictError("Refund operation does not match an eligible confirmed Stripe refund.");
      }
    }

    const cumulativeRefundedPence = previousRefunded + amountPence;
    const entryId = `ledg_ref_${crypto.createHash("sha256").update(refundId).digest("hex").slice(0, 24)}`;
    const entry: RefundLedgerEntry = {
      entryId,
      transactionId: paymentIntentId,
      idempotencyKey: `stripe_refund:${refundId}`,
      payerId: String(original.payerId || ""),
      payeeId: String(original.payeeId || ""),
      amount: amountPence,
      platformFee: 0,
      netPayout: 0,
      currency,
      type: "REFUND",
      status: "completed",
      direction: "outflow",
      stripeRefundId: refundId,
      stripeChargeId: chargeId,
      ...(operationId ? { operationId } : {}),
      reversalOfEntryId: originalLedgerEntryId,
      createdAt: new Date().toISOString(),
    };

    tx.create ? tx.create(refundRef, entry) : tx.set(refundRef, entry);
    tx.create ? tx.create(db.collection("payment_ledger").doc(entryId), entry) : tx.set(db.collection("payment_ledger").doc(entryId), entry);
    tx.set(totalRef, {
      paymentIntentId,
      originalLedgerEntryId,
      originalAmountPence: originalAmount,
      refundedAmountPence: cumulativeRefundedPence,
      remainingAmountPence: originalAmount - cumulativeRefundedPence,
      currency,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    if (operationRef) {
      tx.set(operationRef, {
        status: "succeeded",
        stripeRefundId: refundId,
        confirmedAmountPence: amountPence,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    return { entry, wasReplayed: false, cumulativeRefundedPence };
  });
}
