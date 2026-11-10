export function isMockSubscriptionId(subscriptionId: unknown): boolean {
  return typeof subscriptionId === "string" && subscriptionId.startsWith("mock_");
}

export function isExplicitMockSubscriptionAllowed(
  subscriptionId: unknown,
  nodeEnv: string | undefined,
  allowMockPayments: string | undefined
): boolean {
  return isMockSubscriptionId(subscriptionId) &&
    nodeEnv !== "production" &&
    allowMockPayments === "true";
}
