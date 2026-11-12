export interface ChargeRefundPage {
  data: any[];
  has_more: boolean;
}

export interface ChargeRefundPaginationResult {
  refunds: any[];
  pagesScanned: number;
}

export interface ChargeRefundListClient {
  refunds: {
    list(params: { charge: string; limit: number; starting_after?: string }): Promise<ChargeRefundPage>;
  };
}

/**
 * Fetch every refund for one Charge. A partial or non-advancing Stripe
 * response throws so the webhook remains retryable instead of completing
 * reconciliation against an incomplete page.
 */
export async function listAllChargeRefunds(
  stripe: ChargeRefundListClient,
  chargeId: string
): Promise<ChargeRefundPaginationResult> {
  if (typeof chargeId !== "string" || !chargeId.trim()) {
    throw new Error("A valid Stripe Charge ID is required for refund pagination.");
  }

  const refundsById = new Map<string, any>();
  const seenCursors = new Set<string>();
  let startingAfter: string | undefined;
  let pagesScanned = 0;

  for (;;) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    pagesScanned += 1;

    if (!page || !Array.isArray(page.data) || typeof page.has_more !== "boolean") {
      throw new Error("Stripe returned an incomplete Charge refund page.");
    }

    for (const refund of page.data) {
      const refundId = typeof refund?.id === "string" ? refund.id.trim() : "";
      if (!refundId) throw new Error("Stripe returned a refund without a valid ID.");

      const fingerprint = JSON.stringify({
        charge: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null,
        payment_intent: typeof refund.payment_intent === "string"
          ? refund.payment_intent : refund.payment_intent?.id ?? null,
        amount: refund.amount ?? null,
        currency: String(refund.currency ?? "").toLowerCase(),
        status: refund.status ?? null,
      });
      const existing = refundsById.get(refundId);
      if (existing) {
        const existingFingerprint = JSON.stringify({
          charge: typeof existing.charge === "string" ? existing.charge : existing.charge?.id ?? null,
          payment_intent: typeof existing.payment_intent === "string"
            ? existing.payment_intent : existing.payment_intent?.id ?? null,
          amount: existing.amount ?? null,
          currency: String(existing.currency ?? "").toLowerCase(),
          status: existing.status ?? null,
        });
        if (existingFingerprint !== fingerprint) {
          throw new Error("Stripe returned conflicting data for a duplicate refund ID.");
        }
      } else {
        refundsById.set(refundId, refund);
      }
    }

    if (!page.has_more) break;
    const lastId = page.data[page.data.length - 1]?.id;
    if (typeof lastId !== "string" || !lastId.trim() || seenCursors.has(lastId)) {
      throw new Error("Stripe Charge refund pagination did not advance; reconciliation is incomplete.");
    }
    seenCursors.add(lastId);
    startingAfter = lastId;
  }

  return { refunds: [...refundsById.values()], pagesScanned };
}
