export type CheckoutIntentBindingState = "pending" | "valid" | "mismatch";

export function evaluateCheckoutIntentBinding(
  intent: Record<string, any>,
  session: Record<string, any>
): CheckoutIntentBindingState {
  if (intent.status === "pending" && !intent.checkoutSessionId) return "pending";

  const expectedAmount = Number(intent.amount);
  const sessionPaymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : typeof session.payment_intent?.id === "string" ? session.payment_intent.id : "";

  const matches =
    intent.userId === session.client_reference_id &&
    intent.checkoutSessionId === session.id &&
    intent.mode === session.mode &&
    Number.isSafeInteger(expectedAmount) &&
    expectedAmount === Number(session.amount_total) &&
    String(intent.currency || "").toLowerCase() === String(session.currency || "").toLowerCase() &&
    (!intent.paymentIntentId || intent.paymentIntentId === sessionPaymentIntentId) &&
    ["session_created", "processing"].includes(String(intent.status));

  return matches ? "valid" : "mismatch";
}
