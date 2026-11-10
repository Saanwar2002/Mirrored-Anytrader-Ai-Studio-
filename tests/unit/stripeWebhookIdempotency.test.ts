import { describe, expect, it } from "vitest";
import { shouldClaimStripeWebhookEvent } from "../../src/server/stripeWebhookIdempotency.ts";

describe("Stripe webhook event claim decision", () => {
  const now = 1_800_000_000_000;

  it("claims an event with no prior record", () => {
    expect(shouldClaimStripeWebhookEvent(undefined, now)).toBe(true);
  });

  it("does not claim an already completed event", () => {
    expect(shouldClaimStripeWebhookEvent({ status: "completed" }, now)).toBe(false);
  });

  it("does not steal a recent processing claim", () => {
    expect(shouldClaimStripeWebhookEvent({
      status: "processing",
      claimedAt: { toMillis: () => now - 60_000 }
    }, now)).toBe(false);
  });

  it("allows recovery of a stale processing claim after five minutes", () => {
    expect(shouldClaimStripeWebhookEvent({
      status: "processing",
      claimedAt: { toMillis: () => now - 5 * 60 * 1000 }
    }, now)).toBe(true);
  });

  it("treats a processing record without a timestamp as fresh", () => {
    expect(shouldClaimStripeWebhookEvent({ status: "processing" }, now)).toBe(false);
  });

  it("allows failed or unknown prior records to be retried", () => {
    expect(shouldClaimStripeWebhookEvent({ status: "failed" }, now)).toBe(true);
    expect(shouldClaimStripeWebhookEvent({ status: "unknown" }, now)).toBe(true);
  });
});
