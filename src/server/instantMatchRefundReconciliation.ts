export interface InstantMatchRefundEvidence {
  instantMatchId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface InstantMatchRefundReconciliationResult {
  outcome: "matched" | "not_found" | "conflict" | "not_succeeded";
  refunds: Array<{ id: string; status: string | null; amount: number; currency: string }>;
  pagesScanned: number;
}

/**
 * Read-only Stripe lookup. It never creates, updates, or cancels a refund and
 * only reports a match after the complete PaymentIntent refund list is scanned.
 */
export async function inspectInstantMatchRefunds(
  stripe: { refunds: { list: (params: any) => Promise<any> } },
  evidence: InstantMatchRefundEvidence
): Promise<InstantMatchRefundReconciliationResult> {
  if (!evidence.instantMatchId || !/^pi_[A-Za-z0-9]+$/.test(evidence.paymentIntentId) ||
      !Number.isSafeInteger(evidence.amount) || evidence.amount <= 0 ||
      !/^[a-z]{3}$/.test(evidence.currency)) {
    throw new Error("Insufficient or invalid local refund evidence.");
  }

  const matches: InstantMatchRefundReconciliationResult["refunds"] = [];
  let startingAfter: string | undefined;
  let pagesScanned = 0;
  const seenCursors = new Set<string>();
  const seenRefunds = new Map<string, string>();

  for (;;) {
    const params: any = { payment_intent: evidence.paymentIntentId, limit: 100 };
    if (startingAfter) params.starting_after = startingAfter;
    const page = await stripe.refunds.list(params);
    pagesScanned += 1;
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an incomplete refund page.");
    }

    for (const refund of page.data) {
      const paymentIntent = typeof refund.payment_intent === "string"
        ? refund.payment_intent
        : refund.payment_intent?.id;
      if (refund.metadata?.instantMatchId !== evidence.instantMatchId ||
          refund.metadata?.operationType !== "ANYTRADER_INSTANT_MATCH_EXPIRY") continue;

      const refundId = typeof refund.id === "string" ? refund.id.trim() : "";
      if (!refundId || paymentIntent !== evidence.paymentIntentId ||
          refund.amount !== evidence.amount ||
          String(refund.currency || "").toLowerCase() !== evidence.currency) {
        return {
          outcome: "conflict",
          refunds: [{ id: refundId, status: refund.status || null,
            amount: Number(refund.amount), currency: String(refund.currency || "").toLowerCase() }],
          pagesScanned
        };
      }
      const candidate = {
        id: refundId, status: typeof refund.status === "string" ? refund.status : null,
        amount: refund.amount, currency: String(refund.currency).toLowerCase()
      };
      const fingerprint = JSON.stringify(candidate);
      const priorFingerprint = seenRefunds.get(refundId);
      if (priorFingerprint && priorFingerprint !== fingerprint) {
        return { outcome: "conflict", refunds: [matches.find((item) => item.id === refundId) || candidate], pagesScanned };
      }
      if (!priorFingerprint) {
        seenRefunds.set(refundId, fingerprint);
        matches.push(candidate);
      }
    }

    if (!page.has_more) break;
    const lastId = page.data[page.data.length - 1]?.id;
    if (!lastId || seenCursors.has(lastId)) {
      throw new Error("Stripe refund pagination did not advance; reconciliation is incomplete.");
    }
    seenCursors.add(lastId);
    startingAfter = lastId;
  }

  if (matches.length > 1) return { outcome: "conflict", refunds: matches, pagesScanned };
  if (matches.length === 0) return { outcome: "not_found", refunds: matches, pagesScanned };
  if (matches[0].status !== "succeeded") return { outcome: "not_succeeded", refunds: matches, pagesScanned };
  return { outcome: "matched", refunds: matches, pagesScanned };
}
