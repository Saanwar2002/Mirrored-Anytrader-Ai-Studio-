export type SubscriptionProduct = "membership" | "gold_driver" | "exclusive_leads" | "video_pro" | "gotham_saas";

export function buildSubscriptionLifecyclePatch(product: SubscriptionProduct, subscription: Record<string, any>, isDeleted = false): Record<string, any> {
  const status = String(subscription.status || (isDeleted ? "canceled" : "unknown"));
  const entitled = status === "active" || status === "trialing";
  const terminal = isDeleted || ["canceled", "unpaid", "incomplete_expired"].includes(status);
  const periodEnd = Number(subscription.current_period_end || 0);
  const periodEndIso = periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : undefined;
  const patch: Record<string, any> = {};

  if (product === "membership") {
    patch.subscriptionStatus = status;
    patch.cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (entitled) { patch.isPro = true; patch.isProInvoiceSubscriber = true; }
    else if (terminal) { patch.isPro = false; patch.isProInvoiceSubscriber = false; }
    if (periodEndIso) patch.currentPeriodEnd = periodEndIso;
  } else if (product === "gold_driver") {
    patch.driverSubscriptionStatus = status;
    patch.driverCancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (entitled) patch.isGoldDriver = true;
    else if (terminal) patch.isGoldDriver = false;
    if (periodEndIso) patch.driverCurrentPeriodEnd = periodEndIso;
  } else if (product === "exclusive_leads") {
    patch.exclusiveCancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (entitled) { patch.hasExclusiveAddon = true; patch.isExclusiveActive = true; }
    else if (terminal) { patch.hasExclusiveAddon = false; patch.isExclusiveActive = false; }
    if (periodEndIso) patch.exclusiveCurrentPeriodEnd = periodEndIso;
  } else if (product === "video_pro") {
    patch.videoProCancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (entitled) patch.hasVerifiedVideoProSubscription = true;
    else if (terminal) patch.hasVerifiedVideoProSubscription = false;
    // Video verification is an independent credential; never mutate it here.
    if (periodEndIso) patch.videoProCurrentPeriodEnd = periodEndIso;
  } else {
    patch.gothamSubscriptionStatus = status;
    patch.gothamCancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (entitled) patch.isGothamSubscriber = true;
    else if (terminal) patch.isGothamSubscriber = false;
    if (periodEndIso) { patch.gothamCurrentPeriodEnd = periodEndIso; patch.currentPeriodEnd = periodEndIso; }
    // Purchased door count is not derived from Stripe's aggregate line quantity.
  }
  return patch;
}
