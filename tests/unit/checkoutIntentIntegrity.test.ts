import { describe, expect, it } from "vitest";
import { evaluateCheckoutIntentBinding } from "../../src/server/checkoutIntentIntegrity.ts";

const intent = {
  userId: "user-1",
  checkoutSessionId: "cs_test_1",
  mode: "subscription",
  amount: 1900,
  currency: "gbp",
  paymentIntentId: null,
  status: "session_created"
};
const session = {
  id: "cs_test_1",
  client_reference_id: "user-1",
  mode: "subscription",
  amount_total: 1900,
  currency: "gbp",
  payment_intent: null
};

describe("Stripe checkout intent binding", () => {
  it("accepts an exact server-intent/session binding", () => {
    expect(evaluateCheckoutIntentBinding(intent, session)).toBe("valid");
  });

  it("normalizes currency casing and expanded PaymentIntent objects", () => {
    expect(evaluateCheckoutIntentBinding(
      { ...intent, currency: "GBP", paymentIntentId: "pi_123" },
      { ...session, currency: "GBP", payment_intent: { id: "pi_123" } }
    )).toBe("valid");
  });

  it("treats a session arriving before the server binding write as retryable", () => {
    expect(evaluateCheckoutIntentBinding(
      { ...intent, checkoutSessionId: undefined, status: "pending" },
      session
    )).toBe("pending");
  });

  it.each([
    [{ userId: "other-user" }, {}],
    [{ checkoutSessionId: "cs_other" }, {}],
    [{ mode: "payment" }, {}],
    [{ amount: 2000 }, {}],
    [{ currency: "usd" }, {}],
    [{ paymentIntentId: "pi_other" }, {}],
    [{ status: "pending" }, {}],
  ])("rejects a mismatched checkout binding", (intentPatch, sessionPatch) => {
    expect(evaluateCheckoutIntentBinding(
      { ...intent, ...intentPatch },
      { ...session, ...sessionPatch }
    )).toBe("mismatch");
  });

  it("rejects a mismatched client reference or session amount", () => {
    expect(evaluateCheckoutIntentBinding(intent, { ...session, client_reference_id: "user-2" })).toBe("mismatch");
    expect(evaluateCheckoutIntentBinding(intent, { ...session, amount_total: 1899 })).toBe("mismatch");
  });
});
