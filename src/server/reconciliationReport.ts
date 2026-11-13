import { BadRequestError, ForbiddenError } from "./httpErrors.ts";

export const MAX_RECONCILIATION_REPORT_LIMIT = 100;
export const DEFAULT_RECONCILIATION_REPORT_LIMIT = 20;

export interface ReconciliationReportQuery {
  limit?: number | string;
  offset?: number | string;
  statusFilter?: string;
}

export interface SanitizedReconciliationRecord {
  ledgerId: string;
  jobId: string;
  quoteId: string;
  milestoneId: string;
  amountPence: number;
  formattedAmount: string;
  platformFeePence: number;
  netPayoutPence: number;
  status: string;
  transferStatus: string;
  reconciliationStatus: "reconciled" | "failed" | "pending_transfer" | "ambiguous" | "legacy_unstructured";
  timestamp: string;
  stripeTransferIdMasked?: string;
  schemaVariant: "v8_structured" | "v7_transitional" | "v6_legacy";
}

export interface ReconciliationReportResult {
  generatedAt: string;
  recordsCount: number;
  limit: number;
  offset: number;
  summary: {
    totalPence: number;
    reconciledCount: number;
    failedCount: number;
    pendingCount: number;
    legacyCount: number;
    ambiguousCount: number;
  };
  records: SanitizedReconciliationRecord[];
  isReadOnly: true;
}

/**
 * Validates and sanitizes report input parameters with fail-closed bounds checking.
 */
export function validateReconciliationReportParams(rawQuery: ReconciliationReportQuery): {
  limit: number;
  offset: number;
  statusFilter?: string;
} {
  let limit = DEFAULT_RECONCILIATION_REPORT_LIMIT;
  if (rawQuery.limit !== undefined) {
    const parsedLimit = Number(rawQuery.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestError("Invalid limit parameter: must be a positive integer >= 1");
    }
    if (parsedLimit > MAX_RECONCILIATION_REPORT_LIMIT) {
      throw new BadRequestError(
        `Requested limit ${parsedLimit} exceeds maximum allowed limit of ${MAX_RECONCILIATION_REPORT_LIMIT}`
      );
    }
    limit = parsedLimit;
  }

  let offset = 0;
  if (rawQuery.offset !== undefined) {
    const parsedOffset = Number(rawQuery.offset);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      throw new BadRequestError("Invalid offset parameter: must be a non-negative integer >= 0");
    }
    offset = parsedOffset;
  }

  let statusFilter: string | undefined;
  if (rawQuery.statusFilter) {
    const allowedFilters = ["all", "completed", "failed", "pending", "released", "disputed"];
    const sanitized = String(rawQuery.statusFilter).trim().toLowerCase();
    if (!allowedFilters.includes(sanitized)) {
      throw new BadRequestError(
        `Invalid statusFilter: '${sanitized}'. Allowed values: ${allowedFilters.join(", ")}`
      );
    }
    if (sanitized !== "all") {
      statusFilter = sanitized;
    }
  }

  return { limit, offset, statusFilter };
}

/**
 * Normalizes historical ledger entries across V6, V7, and V8 schemas while strictly redacting secrets.
 */
export function sanitizeAndClassifyLedgerRecord(docId: string, rawData: any): SanitizedReconciliationRecord {
  const data = rawData || {};

  let schemaVariant: "v8_structured" | "v7_transitional" | "v6_legacy" = "v6_legacy";
  if (data.idempotencyKey && String(data.idempotencyKey).startsWith("release:") && data.transferStatus) {
    schemaVariant = "v8_structured";
  } else if (data.verifiedAmount !== undefined || data.platformFeePence !== undefined || data.amountPence !== undefined) {
    schemaVariant = "v7_transitional";
  }

  let amountPence = 0;
  if (typeof data.verifiedAmount === "number") {
    amountPence = Math.round(data.verifiedAmount);
  } else if (typeof data.amountPence === "number") {
    amountPence = Math.round(data.amountPence);
  } else if (typeof data.amount === "number") {
    amountPence = Math.round(data.amount * 100);
  } else if (typeof data.totalAmount === "number") {
    amountPence = Math.round(data.totalAmount * 100);
  }

  let platformFeePence = 0;
  if (typeof data.platformFeePence === "number") {
    platformFeePence = Math.round(data.platformFeePence);
  } else if (typeof data.platformFee === "number") {
    platformFeePence = Math.round(data.platformFee * 100);
  } else {
    platformFeePence = Math.round(amountPence * 0.12);
  }

  let netPayoutPence = 0;
  if (typeof data.netPayoutPence === "number") {
    netPayoutPence = Math.round(data.netPayoutPence);
  } else if (typeof data.netPayout === "number") {
    netPayoutPence = Math.round(data.netPayout * 100);
  } else {
    netPayoutPence = Math.max(0, amountPence - platformFeePence);
  }

  const transferStatus = String(data.transferStatus || "none").toLowerCase();
  const rawStatus = String(data.status || "none").toLowerCase();
  let reconciliationStatus: "reconciled" | "failed" | "pending_transfer" | "ambiguous" | "legacy_unstructured" =
    "legacy_unstructured";

  if (transferStatus === "completed" && data.stripeTransferId) {
    reconciliationStatus = "reconciled";
  } else if (transferStatus === "failed") {
    reconciliationStatus = "failed";
  } else if (rawStatus === "released" && transferStatus !== "completed") {
    reconciliationStatus = "pending_transfer";
  } else if (schemaVariant === "v8_structured") {
    reconciliationStatus = transferStatus === "completed" ? "reconciled" : "pending_transfer";
  } else {
    reconciliationStatus = "legacy_unstructured";
  }

  let stripeTransferIdMasked: string | undefined;
  if (data.stripeTransferId && typeof data.stripeTransferId === "string") {
    const rawId = data.stripeTransferId;
    if (rawId.length > 8) {
      stripeTransferIdMasked = `${rawId.substring(0, 4)}...${rawId.substring(rawId.length - 4)}`;
    } else {
      stripeTransferIdMasked = "***";
    }
  }

  return {
    ledgerId: docId,
    jobId: String(data.jobId || "unknown_job"),
    quoteId: String(data.quoteId || "unknown_quote"),
    milestoneId: String(data.milestoneId || "m0"),
    amountPence,
    formattedAmount: `£${(amountPence / 100).toFixed(2)}`,
    platformFeePence,
    netPayoutPence,
    status: rawStatus,
    transferStatus,
    reconciliationStatus,
    timestamp: data.createdAt || data.timestamp || new Date().toISOString(),
    stripeTransferIdMasked,
    schemaVariant,
  };
}

/**
 * Generates an operator-only, bounded, read-only financial reconciliation report.
 */
export async function generateFinancialReconciliationReport(
  db: any,
  rawParams: ReconciliationReportQuery,
  caller: { uid: string; isAdmin: boolean }
): Promise<ReconciliationReportResult> {
  if (!caller || !caller.isAdmin) {
    throw new ForbiddenError("Administrator privilege required to access financial reconciliation reports");
  }

  if (!db) {
    throw new BadRequestError("Database connection unavailable for reconciliation reporting");
  }

  const { limit, offset, statusFilter } = validateReconciliationReportParams(rawParams);

  let queryRef = db.collection("payment_ledger");
  if (statusFilter) {
    queryRef = queryRef.where("transferStatus", "==", statusFilter);
  }

  const snapshot = await queryRef.limit(limit).get();
  const docs = snapshot?.docs || [];

  const records: SanitizedReconciliationRecord[] = [];
  let totalPence = 0;
  let reconciledCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let legacyCount = 0;
  let ambiguousCount = 0;

  for (const doc of docs) {
    const docData = typeof doc.data === "function" ? doc.data() : doc.data;
    const sanitized = sanitizeAndClassifyLedgerRecord(doc.id, docData);
    records.push(sanitized);

    totalPence += sanitized.amountPence;
    if (sanitized.reconciliationStatus === "reconciled") reconciledCount++;
    else if (sanitized.reconciliationStatus === "failed") failedCount++;
    else if (sanitized.reconciliationStatus === "pending_transfer") pendingCount++;
    else if (sanitized.reconciliationStatus === "ambiguous") ambiguousCount++;
    else legacyCount++;
  }

  return {
    generatedAt: new Date().toISOString(),
    recordsCount: records.length,
    limit,
    offset,
    summary: {
      totalPence,
      reconciledCount,
      failedCount,
      pendingCount,
      legacyCount,
      ambiguousCount,
    },
    records,
    isReadOnly: true,
  };
}
