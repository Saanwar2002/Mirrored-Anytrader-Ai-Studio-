import { describe, expect, it } from "vitest";
import { buildSubscriptionLifecyclePatch } from "../../src/server/subscriptionLifecycle.ts";

const active = { id: "sub_test", status: "active", cancel_at_period_end: false, current_period_end: 1_800_000_000 };

describe("Stripe subscription lifecycle patch mapping", () => {
  it.each([
    ["membership", { isPro: true, isProInvoiceSubscriber: true, subscriptionStatus: "active" }],
    ["gold_driver", { isGoldDriver: true, driverSubscriptionStatus: "active" }],
    ["exclusive_leads", { hasExclusiveAddon: true, isExclusiveActive: true }],
    ["video_pro", { hasVerifiedVideoProSubscription: true }],
    ["gotham_saas", { isGothamSubscriber: true, gothamSubscriptionStatus: "active" }],
  ] as const)("maps active state to %s only", (product, expected) => {
    const patch = buildSubscriptionLifecyclePatch(product, active);
    for (const [key, value] of Object.entries(expected)) expect(patch[key]).toBe(value);
  });

  it.each([
    ["membership", { isPro: false, isProInvoiceSubscriber: false }],
    ["gold_driver", { isGoldDriver: false }],
    ["exclusive_leads", { hasExclusiveAddon: false, isExclusiveActive: false }],
    ["video_pro", { hasVerifiedVideoProSubscription: false }],
    ["gotham_saas", { isGothamSubscriber: false }],
  ] as const)("revokes terminal %s state", (product, expected) => {
    const patch = buildSubscriptionLifecyclePatch(product, { ...active, status: "canceled" });
    for (const [key, value] of Object.entries(expected)) expect(patch[key]).toBe(value);
  });

  it.each(["past_due", "incomplete", "paused", "unknown"])("preserves entitlement fields for %s", (status) => {
    const fields = {
      membership: ["isPro", "isProInvoiceSubscriber"],
      gold_driver: ["isGoldDriver"],
      exclusive_leads: ["hasExclusiveAddon", "isExclusiveActive"],
      video_pro: ["hasVerifiedVideoProSubscription"],
      gotham_saas: ["isGothamSubscriber"],
    } as const;
    for (const product of Object.keys(fields) as (keyof typeof fields)[]) {
      const patch = buildSubscriptionLifecyclePatch(product, { ...active, status });
      for (const field of fields[product]) expect(patch).not.toHaveProperty(field);
    }
  });

  it("treats deleted events as terminal when status is missing", () => {
    expect(buildSubscriptionLifecyclePatch("gold_driver", { ...active, status: undefined }, true))
      .toMatchObject({ driverSubscriptionStatus: "canceled", isGoldDriver: false });
  });

  it("does not erase the independent Video Pro verification credential", () => {
    const patch = buildSubscriptionLifecyclePatch("video_pro", { ...active, status: "canceled" });
    expect(patch.hasVerifiedVideoProSubscription).toBe(false);
    expect(patch).not.toHaveProperty("videoVerificationStatus");
  });

  it("retains cancellation schedule and period end by product", () => {
    const scheduled = { ...active, cancel_at_period_end: true };
    expect(buildSubscriptionLifecyclePatch("gold_driver", scheduled)).toMatchObject({ driverCancelAtPeriodEnd: true, driverCurrentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
    expect(buildSubscriptionLifecyclePatch("exclusive_leads", scheduled)).toMatchObject({ exclusiveCancelAtPeriodEnd: true });
    expect(buildSubscriptionLifecyclePatch("video_pro", scheduled)).toMatchObject({ videoProCancelAtPeriodEnd: true });
    expect(buildSubscriptionLifecyclePatch("gotham_saas", scheduled)).toMatchObject({ gothamCancelAtPeriodEnd: true, currentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
  });

  it("never writes Gotham purchased door counts from Stripe quantity", () => {
    const patch = buildSubscriptionLifecyclePatch("gotham_saas", { ...active, quantity: 99 });
    expect(patch).not.toHaveProperty("purchasedDoors");
    expect(patch).not.toHaveProperty("doorAllowance");
    expect(patch).not.toHaveProperty("quantity");
  });
});
