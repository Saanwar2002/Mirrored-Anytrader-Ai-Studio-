import { afterEach, describe, expect, it, vi } from "vitest";
import { initiatePropertyTransfer, revokePropertyTransfer } from "../../src/services/propertyCommandService.ts";

afterEach(() => vi.unstubAllGlobals());

describe("property transfer commands", () => {
  const user = { getIdToken: async () => "transfer-test-token" };

  it("initiates a transfer through the authenticated server command", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: "TRF-ABC234", expiresAt: "2026-12-10T12:00:00.000Z" })
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await initiatePropertyTransfer(user, "property-123", {
      buyerName: "Buyer",
      buyerEmail: "buyer@example.com",
      validityDays: 30
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/properties/property-123/transfer", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer transfer-test-token" }),
      body: JSON.stringify({ buyerName: "Buyer", buyerEmail: "buyer@example.com", validityDays: 30 })
    }));
    expect(result.code).toBe("TRF-ABC234");
  });

  it("surfaces server errors when transfer initiation is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Only the current property owner can initiate a transfer." })
    }));

    await expect(initiatePropertyTransfer(user, "property-123", { validityDays: 30 }))
      .rejects.toThrow("Only the current property owner can initiate a transfer.");
  });

  it("revokes a transfer through the authenticated server command", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await revokePropertyTransfer(user, "property-123");

    expect(fetchMock).toHaveBeenCalledWith("/api/properties/property-123/transfer/revoke", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer transfer-test-token" }
    }));
  });
});
