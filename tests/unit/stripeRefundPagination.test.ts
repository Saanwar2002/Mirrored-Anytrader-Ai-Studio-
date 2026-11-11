import { describe, expect, it, vi } from "vitest";
import { listAllChargeRefunds } from "../../src/server/stripeRefundPagination.ts";

const refund = (id: string, overrides: Record<string, any> = {}) => ({
  id, charge: "ch_123", payment_intent: "pi_123", amount: 500,
  currency: "gbp", status: "succeeded", ...overrides,
});

describe("listAllChargeRefunds", () => {
  it("retrieves every page using the last refund ID as the next cursor", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [refund("re_1"), refund("re_2")], has_more: true })
      .mockResolvedValueOnce({ data: [refund("re_3")], has_more: false });

    const result = await listAllChargeRefunds({ refunds: { list } }, "ch_123");

    expect(list).toHaveBeenNthCalledWith(1, { charge: "ch_123", limit: 100 });
    expect(list).toHaveBeenNthCalledWith(2, { charge: "ch_123", limit: 100, starting_after: "re_2" });
    expect(result.pagesScanned).toBe(2);
    expect(result.refunds.map((item) => item.id)).toEqual(["re_1", "re_2", "re_3"]);
  });

  it("deduplicates an identical refund repeated across page boundaries", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [refund("re_1"), refund("re_2")], has_more: true })
      .mockResolvedValueOnce({ data: [refund("re_2"), refund("re_3")], has_more: false });

    const result = await listAllChargeRefunds({ refunds: { list } }, "ch_123");
    expect(result.refunds.map((item) => item.id)).toEqual(["re_1", "re_2", "re_3"]);
  });

  it("fails closed when a duplicate refund ID has conflicting financial details", async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [refund("re_1")], has_more: true })
      .mockResolvedValueOnce({ data: [refund("re_1", { amount: 501 })], has_more: false });

    await expect(listAllChargeRefunds({ refunds: { list } }, "ch_123"))
      .rejects.toThrow("conflicting data");
  });

  it("fails closed when Stripe reports more pages but supplies no advancing cursor", async () => {
    const list = vi.fn().mockResolvedValue({ data: [], has_more: true });
    await expect(listAllChargeRefunds({ refunds: { list } }, "ch_123"))
      .rejects.toThrow("did not advance");
  });

  it("does not treat a malformed Stripe response as a complete refund list", async () => {
    const list = vi.fn().mockResolvedValue({ data: [] });
    await expect(listAllChargeRefunds({ refunds: { list } }, "ch_123"))
      .rejects.toThrow("incomplete");
  });

  it("rejects an empty Charge ID before making a Stripe request", async () => {
    const list = vi.fn();
    await expect(listAllChargeRefunds({ refunds: { list } }, " "))
      .rejects.toThrow("Charge ID");
    expect(list).not.toHaveBeenCalled();
  });
});
