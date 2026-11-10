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
    return nowMs - claimedAtMs >= staleAfterMs;
  }
  return true;
}
