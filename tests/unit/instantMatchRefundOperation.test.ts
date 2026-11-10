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
    const { db, store, matchRef } = memoryDb({ status: "searching", stripePaymentIntentId: "pi_123" });
    const create = vi.fn().mockResolvedValue({ id: "re_123", status: "succeeded" });
    await expireAndRefundInstantMatch(db, matchRef, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].payment_intent).toBe("pi_123");
    expect(create.mock.calls[0][1].idempotencyKey).toBe("instant-match-expiry:match-1");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "succeeded", stripeRefundId: "re_123" });
    expect(store.get("instant_matches/match-1")).toMatchObject({ status: "expired", refundStatus: "succeeded", stripeRefundId: "re_123" });
  });
  it("places missing PaymentIntent identity into manual review without calling Stripe", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching" });
    const create = vi.fn();
    await expireAndRefundInstantMatch(db, matchRef, { refunds: { create } } as any, "no_eligible_traders");
    expect(create).not.toHaveBeenCalled();
    expect(store.get("instant_match_refunds/match-1").status).toBe("manual_review");
  });
  it("records an ambiguous Stripe exception and never automatically replays it", async () => {
    const { db, store, matchRef } = memoryDb({ status: "searching", stripePaymentIntentId: "pi_123" });
    const create = vi.fn().mockRejectedValue(new Error("network timeout"));
    await expireAndRefundInstantMatch(db, matchRef, { refunds: { create } } as any, "attempts_exhausted");
    expect(store.get("instant_match_refunds/match-1")).toMatchObject({ status: "reconciliation_required" });
    await expireAndRefundInstantMatch(db, matchRef, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("does not replay a completed operation", async () => {
    const { db, store, matchRef } = memoryDb({ status: "expired", stripePaymentIntentId: "pi_123" });
    store.set("instant_match_refunds/match-1", { status: "succeeded", stripeRefundId: "re_existing" });
    const create = vi.fn();
    await expireAndRefundInstantMatch(db, matchRef, { refunds: { create } } as any, "attempts_exhausted");
    expect(create).not.toHaveBeenCalled();
  });
});
