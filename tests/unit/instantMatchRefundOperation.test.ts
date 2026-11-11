import { describe, expect, it, vi } from "vitest";
import { expireAndRefundInstantMatch } from "../../instantMatchWorker.ts";

function memoryDb(match: any) {
  const store = new Map<string, any>([["instant_matches/match-1", { ...match }]]);
  const ref = (collection: string, id: string) => ({
    id, key: collection + "/" + id,
    set: async (value: any, options?: any) => { const prior = store.get(collection + "/" + id) || {}; store.set(collection + "/" + id, options?.merge ? { ...prior, ...value } : value); }
  });
  const db: any = {
    collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
    runTransaction: async (callback: any) => callback({
      get: async (documentRef: any) => ({ exists: store.has(documentRef.key), data: () => store.get(documentRef.key) }),
      set: (documentRef: any, value: any, options?: any) => { const prior = store.get(documentRef.key) || {}; store.set(documentRef.key, options?.merge ? { ...prior, ...value } : value); },
      update: (documentRef: any, value: any) => store.set(documentRef.key, { ...store.get(documentRef.key), ...value })
    })
  };
  return { db, store, matchRef: ref("instant_matches", "match-1") };
}

describe("Instant Match expiry refund operation", () => {
  it("records a successful refund and its Stripe identity", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp" });
    const create = vi.fn().mockResolvedValue({ id: "re_123", payment_intent: "pi_123", amount: 299, currency: "gbp", status: "succeeded" });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].payment_intent).toBe("pi_123");
    expect(create.mock.calls[0][0].amount).toBe(299);
    expect(create.mock.calls[0][1].idempotencyKey).toBe("instant-match-expiry:match-1");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "succeeded", stripeRefundId: "re_123" });
    expect(store.get("instant_matches/match-1")).toMatchObject({ status: "expired", refundStatus: "succeeded", stripeRefundId: "re_123" });
  });

  it("does not mark a mismatched Stripe refund response as succeeded", async () => {
    const { db, store, matchRef } = memoryDb({
      status: "searching", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp"
    });
    const create = vi.fn().mockResolvedValue({
      id: "re_mismatch", payment_intent: "pi_other", amount: 299, currency: "gbp", status: "succeeded"
    });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({
      status: "manual_review", stripeRefundId: "re_mismatch", error: "stripe_refund_response_mismatch"
    });
    expect(store.get("instant_matches/match-1").refundStatus).toBe("manual_review");
  });
  it("does not overwrite an operator resolution after the Stripe request returns", async () => {
    const { db, store, matchRef } = memoryDb({
      status: "searching", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp"
    });
    const create = vi.fn().mockImplementation(async () => {
      store.set("instant_match_refunds/match-1", {
        ...store.get("instant_match_refunds/match-1"), status: "operator_resolved"
      });
      return { id: "re_123", payment_intent: "pi_123", amount: 299, currency: "gbp", status: "succeeded" };
    });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(store.get("instant_match_refunds/match-1").status).toBe("operator_resolved");
    expect(store.get("instant_matches/match-1").refundStatus).toBe("processing");
  });

  it("places missing PaymentIntent identity into manual review without calling Stripe", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching" });
    const create = vi.fn();
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "no_eligible_traders");
    expect(create).not.toHaveBeenCalled();
    expect(store.get("instant_match_refunds/match-1").status).toBe("manual_review");
  });
  it("records an ambiguous Stripe exception and never automatically replays it", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp" });
    const create = vi.fn().mockRejectedValue(new Error("network timeout"));
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "reconciliation_required" });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("reclaims an expired processing lease with the same Stripe idempotency key", async () => {
    const { db, store, matchRef } = memoryDb({
      status: "expired", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp"
    });
    store.set("instant_match_refunds/match-1", {
      status: "processing", paymentIntentId: "pi_123", amount: 299, currency: "gbp",
      idempotencyKey: "instant-match-expiry:match-1", createdAtMs: Date.now() - 60_000,
      leaseExpiresAtMs: Date.now() - 1, claimToken: "stale-claim", attemptCount: 1
    });
    const create = vi.fn().mockResolvedValue({ id: "re_recovered", payment_intent: "pi_123", amount: 299, currency: "gbp", status: "succeeded" });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1].idempotencyKey).toBe("instant-match-expiry:match-1");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "succeeded", stripeRefundId: "re_recovered", attemptCount: 2 });
  });

  it("does not let an expired worker overwrite a successor's refund claim", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp" });
    const create = vi.fn().mockImplementation(async () => {
      const current = store.get("instant_match_refunds/match-1");
      store.set("instant_match_refunds/match-1", { ...current, claimToken: "successor-claim" });
      return { id: "re_stale", payment_intent: "pi_123", amount: 299, currency: "gbp", status: "succeeded" };
    });
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "processing", claimToken: "successor-claim" });
    expect(store.get("instant_matches/match-1").refundStatus).toBe("processing");
  });

  it("does not reclaim an operation after the safe Stripe idempotency retry window", async () => {
    const { db, store, matchRef } = memoryDb({
      status: "expired", stripePaymentIntentId: "pi_123", chargeAmountPence: 299, currency: "gbp"
    });
    store.set("instant_match_refunds/match-1", {
      status: "processing", paymentIntentId: "pi_123", amount: 299, currency: "gbp",
      idempotencyKey: "instant-match-expiry:match-1", createdAtMs: Date.now() - 24 * 60 * 60 * 1000,
      leaseExpiresAtMs: Date.now() - 1, claimToken: "old-claim"
    });
    const create = vi.fn();
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).not.toHaveBeenCalled();
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "reconciliation_required", error: "refund_idempotency_window_expired_or_unknown" });
  });

  it("does not replay a completed operation", async () => {
    const { db, store, matchRef } = memoryDb({ status: "expired", stripePaymentIntentId: "pi_123" });
    store.set("instant_match_refunds/match-1", { status: "succeeded", stripeRefundId: "re_existing" });
    const create = vi.fn();
    await expireAndRefundInstantMatch(db, matchRef as any, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).not.toHaveBeenCalled();
  });
});
