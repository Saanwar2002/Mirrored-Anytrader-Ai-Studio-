export type SubscriptionProduct = "membership" | "landlord" | "gold_driver" | "exclusive_leads" | "video_pro" | "gotham_saas";

export function buildSubscriptionLifecyclePatch(product: SubscriptionProduct, subscription: Record<string, any>, isDeleted = false): Record<string, any> {
  const status = isDeleted ? "canceled" : String(subscription.status || "unknown");
  const entitled = !isDeleted && (status === "active" || status === "trialing");
  const terminal = isDeleted || ["canceled", "unpaid", "incomplete_expired"].includes(status);
  const periodEnd = Number(subscription.current_period_end || 0);
  const periodEndIso = periodEnd > 0 ? new Date(periodEnd * 1000).toISOString() : undefined;
  const patch: Record<string, any> = {};

  if (product === "landlord") {
    patch.homeownerSubscriptionStatus = status;
    patch.homeownerCancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);
    if (periodEndIso) patch.homeownerCurrentPeriodEnd = periodEndIso;
  } else if (product === "membership") {
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
    if (periodEndIso) patch.gothamCurrentPeriodEnd = periodEndIso;
    // Purchased door count is not derived from Stripe's aggregate line quantity.
  }
  return patch;
}


export function buildLandlordCheckoutFulfillmentPatch(
  subscriptionId: string,
  subscription: Record<string, any>
): Record<string, any> {
  if (!subscriptionId) throw new Error("Landlord checkout fulfillment requires a Stripe subscription ID.");
  return {
    subscriptionId,
    subscriptionType: "landlord",
    isLandlord: true,
    homeownerTierId: "landlord",
    ...buildSubscriptionLifecyclePatch("landlord", subscription)
  };
}

export interface SubscriptionProductMatch {
  product: {
    key: SubscriptionProduct;
    idField: string;
    lastCreated: string;
    lastId: string;
  };
  userDoc: any;
}

export function resolveSubscriptionProductMatch(
  matches: Array<SubscriptionProductMatch>
): SubscriptionProductMatch | null {
  if (matches.length === 0) return null;

  const userIds = new Set(matches.map((match) => String(match.userDoc.id)));
  if (userIds.size !== 1) {
    throw new Error("Stripe subscription is linked to multiple users; manual reconciliation required.");
  }

  const dedicated = matches.filter((match) => match.product.key !== "membership");
  if (dedicated.length > 1) {
    throw new Error("Stripe subscription ID is linked across multiple products; manual reconciliation required.");
  }

  const generic = matches.find((match) => match.product.idField === "subscriptionId");
  if (dedicated.length === 1) {
    if (generic) {
      const userData = generic.userDoc.data ? generic.userDoc.data() : {};
      const legacyType = String(userData.subscriptionType || "");
      const legacyProduct: SubscriptionProduct =
        legacyType === "driver_gold" ? "gold_driver" :
        legacyType === "gotham_saas" ? "gotham_saas" :
        legacyType === "landlord" ? "landlord" : "membership";
      if (legacyProduct !== dedicated[0].product.key) {
        throw new Error("Stripe subscription ID is linked to conflicting product fields; manual reconciliation required.");
      }
    }
    return dedicated[0];
  }
  if (!generic) return null;

  const userData = generic.userDoc.data ? generic.userDoc.data() : {};
  const legacyType = String(userData.subscriptionType || "");
  if (legacyType === "landlord") {
    return {
      ...generic,
      product: {
        ...generic.product,
        key: "landlord",
        idField: "subscriptionId",
        lastCreated: "homeownerSubscriptionLastEventCreated",
        lastId: "homeownerSubscriptionLastEventId"
      }
    };
  }
  if (legacyType === "driver_gold") {
    // A newer dedicated subscription supersedes this legacy generic ID.
    if (userData.driverSubscriptionId && userData.driverSubscriptionId !== userData.subscriptionId) return null;
    return {
      ...generic,
      product: {
        ...generic.product,
        key: "gold_driver",
        idField: "subscriptionId",
        lastCreated: "driverSubscriptionLastEventCreated",
        lastId: "driverSubscriptionLastEventId"
      }
    };
  }
  if (legacyType === "gotham_saas") {
    // A newer dedicated subscription supersedes this legacy generic ID.
    if (userData.gothamSubscriptionId && userData.gothamSubscriptionId !== userData.subscriptionId) return null;
    return {
      ...generic,
      product: {
        ...generic.product,
        key: "gotham_saas",
        idField: "subscriptionId",
        lastCreated: "gothamSubscriptionLastEventCreated",
        lastId: "gothamSubscriptionLastEventId"
      }
    };
  }
  return generic;
}

export function extractInvoiceSubscriptionId(invoice: any): string {
  const subscription = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription;
  if (typeof subscription === "string") return subscription;
  if (subscription && typeof subscription.id === "string") return subscription.id;
  return "";
}

export function isStripeSubscriptionLifecycleEventType(eventType: string): boolean {
  return [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
    "invoice.paid"
  ].includes(eventType);
}
