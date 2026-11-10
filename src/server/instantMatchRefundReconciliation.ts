export interface InstantMatchRefundEvidence {
  instantMatchId: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface InstantMatchRefundReconciliationResult {
  outcome: "matched" | "not_found" | "conflict";
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

      if (paymentIntent !== evidence.paymentIntentId ||
          refund.amount !== evidence.amount ||
          String(refund.currency || "").toLowerCase() !== evidence.currency) {
        return {
          outcome: "conflict",
          refunds: [{ id: String(refund.id || ""), status: refund.status || null,
            amount: Number(refund.amount), currency: String(refund.currency || "").toLowerCase() }],
          pagesScanned
        };
      }
      matches.push({ id: String(refund.id), status: refund.status || null,
        amount: refund.amount, currency: String(refund.currency).toLowerCase() });
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
  return { outcome: matches.length === 1 ? "matched" : "not_found", refunds: matches, pagesScanned };
}
