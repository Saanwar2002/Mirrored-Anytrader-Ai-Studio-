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
