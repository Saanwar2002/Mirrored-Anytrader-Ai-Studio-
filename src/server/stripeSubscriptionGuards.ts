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


export function getSubscriptionIdForProduct(userData: Record<string, any>, subscriptionType: string): string | undefined {
  if (subscriptionType === "tier") return typeof userData.subscriptionId === "string" ? userData.subscriptionId : undefined;
  if (subscriptionType === "landlord") {
    return userData.subscriptionType === "landlord" && typeof userData.subscriptionId === "string"
      ? userData.subscriptionId
      : undefined;
  }
  if (subscriptionType === "exclusive_leads") return typeof userData.exclusiveSubscriptionId === "string" ? userData.exclusiveSubscriptionId : undefined;
  if (subscriptionType === "video_pro") return typeof userData.videoProSubscriptionId === "string" ? userData.videoProSubscriptionId : undefined;
  if (subscriptionType === "gotham_saas") {
    if (typeof userData.gothamSubscriptionId === "string" && userData.gothamSubscriptionId) return userData.gothamSubscriptionId;
    return userData.subscriptionType === "gotham_saas" && typeof userData.subscriptionId === "string" ? userData.subscriptionId : undefined;
  }
  if (subscriptionType === "driver_gold") {
    if (typeof userData.driverSubscriptionId === "string" && userData.driverSubscriptionId) return userData.driverSubscriptionId;
    return userData.subscriptionType === "driver_gold" && typeof userData.subscriptionId === "string" ? userData.subscriptionId : undefined;
  }
  return undefined;
}
