import { afterEach, describe, expect, it, vi } from "vitest";
import { createPropertyViaCommand } from "../../src/services/propertyCommandService.ts";

afterEach(() => vi.unstubAllGlobals());

describe("property creation client idempotency", () => {
  const user = (uid: string) => ({ uid, getIdToken: async () => "test-token" });
  const payload = { name: "Test property", propertyType: "flat", address: { line1: "1 High Street" } };

  it("reuses the same key after a network failure so a committed request can be safely retried", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "property-1" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createPropertyViaCommand(user("idempotency-user-a"), payload)).rejects.toThrow("network timeout");
    await createPropertyViaCommand(user("idempotency-user-a"), payload);

    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const retryKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(retryKey).toBe(firstKey);
  });

  it("starts a new idempotency key after a successful create", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "property-2" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createPropertyViaCommand(user("idempotency-user-b"), payload);
    await createPropertyViaCommand(user("idempotency-user-b"), payload);

    const firstKey = fetchMock.mock.calls[0][1].headers["Idempotency-Key"];
    const secondKey = fetchMock.mock.calls[1][1].headers["Idempotency-Key"];
    expect(secondKey).not.toBe(firstKey);
  });

  it("accepts a caller-supplied stable idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "property-3" }) });
    vi.stubGlobal("fetch", fetchMock);

    await createPropertyViaCommand(user("idempotency-user-c"), payload, "stable-operation-key-123");
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe("stable-operation-key-123");
  });

  it("rejects malformed caller-supplied idempotency keys", async () => {
    await expect(createPropertyViaCommand(user("idempotency-user-d"), payload, "bad"))
      .rejects.toThrow("Property creation idempotency key is invalid.");
  });
});
