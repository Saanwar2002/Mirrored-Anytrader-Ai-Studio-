import { describe, expect, it } from "vitest";
import { buildSubscriptionLifecyclePatch, resolveSubscriptionProductMatch } from "../../src/server/subscriptionLifecycle.ts";

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
    expect(buildSubscriptionLifecyclePatch("gotham_saas", scheduled)).toMatchObject({ gothamCancelAtPeriodEnd: true, gothamCurrentPeriodEnd: new Date(1_800_000_000_000).toISOString() });
  });

  it("retains active entitlement when cancellation is scheduled for period end", () => {
    const scheduled = { ...active, cancel_at_period_end: true };
    expect(buildSubscriptionLifecyclePatch("membership", scheduled)).toMatchObject({
      isPro: true, isProInvoiceSubscriber: true, cancelAtPeriodEnd: true
    });
    expect(buildSubscriptionLifecyclePatch("gold_driver", scheduled)).toMatchObject({
      isGoldDriver: true, driverCancelAtPeriodEnd: true
    });
    expect(buildSubscriptionLifecyclePatch("exclusive_leads", scheduled)).toMatchObject({
      hasExclusiveAddon: true, isExclusiveActive: true, exclusiveCancelAtPeriodEnd: true
    });
    expect(buildSubscriptionLifecyclePatch("video_pro", scheduled)).toMatchObject({
      hasVerifiedVideoProSubscription: true, videoProCancelAtPeriodEnd: true
    });
    expect(buildSubscriptionLifecyclePatch("gotham_saas", scheduled)).toMatchObject({
      isGothamSubscriber: true, gothamCancelAtPeriodEnd: true
    });
  });

  it("never writes Gotham purchased door counts from Stripe quantity", () => {
    const patch = buildSubscriptionLifecyclePatch("gotham_saas", { ...active, quantity: 99 });
    expect(patch).not.toHaveProperty("purchasedDoors");
    expect(patch).not.toHaveProperty("doorAllowance");
    expect(patch).not.toHaveProperty("quantity");
    expect(patch).not.toHaveProperty("currentPeriodEnd");
  });
});


describe("Stripe subscription product resolution", () => {
  const membership = { key: "membership" as const, idField: "subscriptionId", lastCreated: "subscriptionLastEventCreated", lastId: "subscriptionLastEventId" };
  const gold = { key: "gold_driver" as const, idField: "driverSubscriptionId", lastCreated: "driverSubscriptionLastEventCreated", lastId: "driverSubscriptionLastEventId" };
  const gotham = { key: "gotham_saas" as const, idField: "gothamSubscriptionId", lastCreated: "gothamSubscriptionLastEventCreated", lastId: "gothamSubscriptionLastEventId" };
  const user = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

  it("resolves legacy generic Gold Driver subscription IDs by subscriptionType", () => {
    const result = resolveSubscriptionProductMatch([{ product: membership, userDoc: user("u1", { subscriptionType: "driver_gold" }) }]);
    expect(result?.product).toMatchObject({ key: "gold_driver", idField: "subscriptionId", lastCreated: "driverSubscriptionLastEventCreated" });
  });

  it("resolves legacy generic Gotham subscription IDs by subscriptionType", () => {
    const result = resolveSubscriptionProductMatch([{ product: membership, userDoc: user("u1", { subscriptionType: "gotham_saas" }) }]);
    expect(result?.product).toMatchObject({ key: "gotham_saas", idField: "subscriptionId", lastCreated: "gothamSubscriptionLastEventCreated" });
  });

  it("keeps generic subscription IDs mapped to membership by default", () => {
    const result = resolveSubscriptionProductMatch([{ product: membership, userDoc: user("u1", { subscriptionType: "membership" }) }]);
    expect(result?.product.key).toBe("membership");
  });

  it("prefers a dedicated product ID when the same user also has the legacy generic field", () => {
    const doc = user("u1", { subscriptionType: "driver_gold" });
    const result = resolveSubscriptionProductMatch([
      { product: membership, userDoc: doc },
      { product: gold, userDoc: doc }
    ]);
    expect(result?.product.key).toBe("gold_driver");
    expect(result?.product.idField).toBe("driverSubscriptionId");
  });

  it("rejects one subscription ID linked to two different users", () => {
    expect(() => resolveSubscriptionProductMatch([
      { product: membership, userDoc: user("u1", {}) },
      { product: gold, userDoc: user("u2", {}) }
    ])).toThrow(/multiple users/);
  });

  it("rejects one subscription ID linked to multiple dedicated product fields", () => {
    const doc = user("u1", {});
    expect(() => resolveSubscriptionProductMatch([
      { product: gold, userDoc: doc },
      { product: gotham, userDoc: doc }
    ])).toThrow(/multiple products/);
  });

  it("returns null when no product matches", () => {
    expect(resolveSubscriptionProductMatch([])).toBeNull();
  });

  it("ignores a legacy Gold Driver ID when a newer dedicated ID has replaced it", () => {
    const result = resolveSubscriptionProductMatch([{
      product: membership,
      userDoc: user("u1", { subscriptionType: "driver_gold", subscriptionId: "sub_old", driverSubscriptionId: "sub_new" })
    }]);
    expect(result).toBeNull();
  });

  it("ignores a legacy Gotham ID when a newer dedicated ID has replaced it", () => {
    const result = resolveSubscriptionProductMatch([{
      product: membership,
      userDoc: user("u1", { subscriptionType: "gotham_saas", subscriptionId: "sub_old", gothamSubscriptionId: "sub_new" })
    }]);
    expect(result).toBeNull();
  });

});