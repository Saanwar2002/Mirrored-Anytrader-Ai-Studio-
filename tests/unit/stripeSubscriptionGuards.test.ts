import { describe, expect, it } from "vitest";
import { isExplicitMockSubscriptionAllowed, isMockSubscriptionId } from "../../src/server/stripeSubscriptionGuards.ts";

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
