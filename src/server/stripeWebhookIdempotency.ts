export function shouldClaimStripeWebhookEvent(
  existingData: Record<string, any> | undefined,
  nowMs: number,
  staleAfterMs = 5 * 60 * 1000
): boolean {
  if (!existingData) return true;
  if (existingData.status === "completed") return false;
  if (existingData.status === "processing") {
    const claimedAtMs = existingData.claimedAt?.toMillis
      ? Number(existingData.claimedAt.toMillis())
      : nowMs;
    const ageMs = nowMs - claimedAtMs;
    return !(ageMs < staleAfterMs);
  }
  return true;
}


export function ownsStripeWebhookClaim(
  existingData: Record<string, any> | undefined,
  claimToken: string | null | undefined
): boolean {
  return Boolean(
    claimToken &&
    existingData?.status === "processing" &&
    existingData?.claimToken === claimToken
  );
}

/** Complete a webhook only while the transaction still owns its processing lease. */
export async function completeStripeWebhookClaim(
  db: any,
  eventRef: any,
  claimToken: string | null | undefined,
  deleteField: any
): Promise<void> {
  await db.runTransaction(async (tx: any) => {
    const latest = await tx.get(eventRef);
    const data = latest.data() || {};
    if (!ownsStripeWebhookClaim(data, claimToken)) {
      throw new Error("Webhook claim lost before completion; reconciliation required.");
    }
    tx.update(eventRef, { status: "completed", claimToken: deleteField });
  });
}

/** A stale worker must not mark its successor's lease failed. */
export async function failStripeWebhookClaimIfOwned(
  db: any,
  eventRef: any,
  claimToken: string | null | undefined,
  errorMessage: string,
  serverTimestamp: any,
  deleteField: any
): Promise<boolean> {
  return db.runTransaction(async (tx: any) => {
    const latest = await tx.get(eventRef);
    const data = latest.data() || {};
    if (!ownsStripeWebhookClaim(data, claimToken)) return false;
    tx.update(eventRef, {
      status: "failed",
      error: errorMessage,
      failedAt: serverTimestamp,
      claimToken: deleteField
    });
    return true;
  });
}
