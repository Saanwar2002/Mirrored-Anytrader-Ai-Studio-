import { describe, expect, it, vi } from "vitest";
import { inspectInstantMatchRefunds } from "../../src/server/instantMatchRefundReconciliation.ts";

const evidence = { instantMatchId: "im_session_1", paymentIntentId: "pi_123", amount: 2500, currency: "gbp" };
const refund = (overrides: any = {}) => ({
  id: "re_123", payment_intent: "pi_123", amount: 2500, currency: "gbp", status: "succeeded",
  metadata: { instantMatchId: "im_session_1", operationType: "ANYTRADER_INSTANT_MATCH_EXPIRY" },
  ...overrides
});

describe("read-only Instant Match refund reconciliation", () => {
  it("finds an exact refund after following all PaymentIntent pages", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: "re_other", metadata: {} }], has_more: true })
      .mockResolvedValueOnce({ data: [refund()], has_more: false });
    const result = await inspectInstantMatchRefunds({ refunds: { list } }, evidence);
    expect(list).toHaveBeenNthCalledWith(1, { payment_intent: "pi_123", limit: 100 });
    expect(list).toHaveBeenNthCalledWith(2, { payment_intent: "pi_123", limit: 100, starting_after: "re_other" });
    expect(result).toEqual({ outcome: "matched", refunds: [{ id: "re_123", status: "succeeded", amount: 2500, currency: "gbp" }], pagesScanned: 2 });
  });
  it("returns not_found only after the complete list has no operation metadata match", async () => {
    const list = vi.fn().mockResolvedValue({ data: [refund({ metadata: {} })], has_more: false });
    await expect(inspectInstantMatchRefunds({ refunds: { list } }, evidence)).resolves.toMatchObject({ outcome: "not_found", pagesScanned: 1 });
  });
  it("does not treat pending, failed, or canceled refunds as successful reconciliation", async () => {
    for (const status of ["pending", "failed", "canceled", null]) {
      const list = vi.fn().mockResolvedValue({ data: [refund({ status })], has_more: false });
      await expect(inspectInstantMatchRefunds({ refunds: { list } }, evidence))
        .resolves.toMatchObject({ outcome: "not_succeeded" });
    }
  });
  it("deduplicates the same refund appearing across pages but flags duplicate distinct refunds", async () => {
    const same = refund();
    const repeated = vi.fn()
      .mockResolvedValueOnce({ data: [same], has_more: true })
      .mockResolvedValueOnce({ data: [same], has_more: false });
    await expect(inspectInstantMatchRefunds({ refunds: { list: repeated } }, evidence))
      .resolves.toMatchObject({ outcome: "matched", refunds: [{ id: "re_123" }], pagesScanned: 2 });
    const distinct = vi.fn()
      .mockResolvedValueOnce({ data: [refund()], has_more: true })
      .mockResolvedValueOnce({ data: [refund({ id: "re_456" })], has_more: false });
    await expect(inspectInstantMatchRefunds({ refunds: { list: distinct } }, evidence))
      .resolves.toMatchObject({ outcome: "conflict" });
  });
  it("rejects a matching metadata record without a Stripe refund ID", async () => {
    const list = vi.fn().mockResolvedValue({ data: [refund({ id: "" })], has_more: false });
    await expect(inspectInstantMatchRefunds({ refunds: { list } }, evidence))
      .resolves.toMatchObject({ outcome: "conflict" });
  });
  it("reports conflict when matching metadata has a different amount or currency", async () => {
    const list = vi.fn().mockResolvedValue({ data: [refund({ amount: 2400 })], has_more: false });
    await expect(inspectInstantMatchRefunds({ refunds: { list } }, evidence)).resolves.toMatchObject({ outcome: "conflict" });
  });
  it("fails closed when a page is malformed or pagination does not advance", async () => {
    const malformed = vi.fn().mockResolvedValue({ data: [], has_more: true });
    await expect(inspectInstantMatchRefunds({ refunds: { list: malformed } }, evidence)).rejects.toThrow("did not advance");
    const invalid = vi.fn().mockResolvedValue({ data: [] });
    await expect(inspectInstantMatchRefunds({ refunds: { list: invalid } }, evidence)).rejects.toThrow("incomplete refund page");
  });
  it("rejects missing or invalid local evidence before making a Stripe request", async () => {
    const list = vi.fn();
    await expect(inspectInstantMatchRefunds({ refunds: { list } }, { ...evidence, amount: 0 })).rejects.toThrow("Insufficient or invalid local refund evidence");
    expect(list).not.toHaveBeenCalled();
  });
});
