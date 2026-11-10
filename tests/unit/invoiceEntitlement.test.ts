import { describe, expect, it } from "vitest";
import { isProInvoiceUser } from "../../src/services/invoiceService.ts";

describe("Pro invoice entitlement", () => {
  it.each(["canceled", "unpaid", "incomplete_expired"])("does not let stale tier labels override terminal Stripe membership status %s", (status) => {
    expect(isProInvoiceUser({
      tierId: "Pro",
      subscriptionType: "tier",
      subscriptionStatus: status,
      isPro: false,
      isProInvoiceSubscriber: false
    })).toBe(false);
  });

  it.each(["active", "trialing", "past_due", "incomplete", "paused"])("preserves the existing tier entitlement for non-terminal status %s", (status) => {
    expect(isProInvoiceUser({
      tierId: "Pro",
      subscriptionType: "tier",
      subscriptionStatus: status
    })).toBe(true);
  });

  it("preserves independent Video Pro entitlement after membership cancellation", () => {
    expect(isProInvoiceUser({
      tierId: "Pro",
      subscriptionType: "tier",
      subscriptionStatus: "canceled",
      hasVerifiedVideoProSubscription: true,
      isPro: false,
      isProInvoiceSubscriber: false
    })).toBe(true);
  });

  it("retains legacy tier-only profiles without a Stripe-managed membership marker", () => {
    expect(isProInvoiceUser({ tierId: "Pro" })).toBe(true);
  });
});
