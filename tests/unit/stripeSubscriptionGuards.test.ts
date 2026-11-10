import { describe, expect, it } from "vitest";
import { getSubscriptionIdForProduct, isExplicitMockSubscriptionAllowed, isMockSubscriptionId } from "../../src/server/stripeSubscriptionGuards.ts";

describe("explicit mock Stripe subscription guard", () => {
  it("recognizes mock subscription IDs", () => {
    expect(isMockSubscriptionId("mock_sub_123")).toBe(true);
    expect(isMockSubscriptionId("sub_live_123")).toBe(false);
    expect(isMockSubscriptionId(undefined)).toBe(false);
  });

  it("allows mock IDs only when explicitly enabled outside production", () => {
    expect(isExplicitMockSubscriptionAllowed("mock_sub_123", "development", "true")).toBe(true);
    expect(isExplicitMockSubscriptionAllowed("mock_sub_123", "test", "true")).toBe(true);
  });

  it("rejects mock IDs in production even when the flag is enabled", () => {
    expect(isExplicitMockSubscriptionAllowed("mock_sub_123", "production", "true")).toBe(false);
  });

  it("rejects mock IDs when the opt-in flag is missing or false", () => {
    expect(isExplicitMockSubscriptionAllowed("mock_sub_123", "development", undefined)).toBe(false);
    expect(isExplicitMockSubscriptionAllowed("mock_sub_123", "development", "false")).toBe(false);
  });

  it("does not classify real Stripe IDs as mock IDs", () => {
    expect(isExplicitMockSubscriptionAllowed("sub_real_123", "development", "true")).toBe(false);
  });
});


describe("product-specific subscription ID selection", () => {
  it("uses the dedicated Gold Driver ID before any legacy fallback", () => {
    expect(getSubscriptionIdForProduct({ driverSubscriptionId: "sub_driver", subscriptionId: "sub_membership" }, "driver_gold")).toBe("sub_driver");
  });

  it("allows the legacy Gold Driver generic ID only with matching subscriptionType", () => {
    expect(getSubscriptionIdForProduct({ subscriptionId: "sub_legacy", subscriptionType: "driver_gold" }, "driver_gold")).toBe("sub_legacy");
    expect(getSubscriptionIdForProduct({ subscriptionId: "sub_membership", subscriptionType: "tier" }, "driver_gold")).toBeUndefined();
  });

  it("uses a dedicated Gotham ID even when a membership ID is also present", () => {
    expect(getSubscriptionIdForProduct({
      gothamSubscriptionId: "sub_gotham",
      subscriptionId: "sub_membership",
      subscriptionType: "gotham_saas"
    }, "gotham_saas")).toBe("sub_gotham");
  });

  it("allows the legacy Gotham generic ID only with matching subscriptionType", () => {
    expect(getSubscriptionIdForProduct({ subscriptionId: "sub_legacy", subscriptionType: "gotham_saas" }, "gotham_saas")).toBe("sub_legacy");
    expect(getSubscriptionIdForProduct({ subscriptionId: "sub_membership", subscriptionType: "tier" }, "gotham_saas")).toBeUndefined();
  });

  it("uses dedicated IDs for Exclusive Leads and Video Pro", () => {
    expect(getSubscriptionIdForProduct({ exclusiveSubscriptionId: "sub_excl" }, "exclusive_leads")).toBe("sub_excl");
    expect(getSubscriptionIdForProduct({ videoProSubscriptionId: "sub_video" }, "video_pro")).toBe("sub_video");
  });

  it("uses the generic subscription ID for membership only", () => {
    expect(getSubscriptionIdForProduct({ subscriptionId: "sub_member" }, "tier")).toBe("sub_member");
  });
});

it("only uses the generic subscription ID for an explicitly landlord subscription", () => {
  expect(getSubscriptionIdForProduct({ subscriptionType: "landlord", subscriptionId: "sub_landlord" }, "landlord")).toBe("sub_landlord");
  expect(getSubscriptionIdForProduct({ subscriptionType: "tier", subscriptionId: "sub_membership" }, "landlord")).toBeUndefined();
});
