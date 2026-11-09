import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe platform fee settlement webhook idempotency", () => {
  it("validates GBP amount and atomically records a session before reducing pending fees", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const start = source.indexOf("meta?.type === 'fee_settlement'");
    const end = source.indexOf("meta?.type === 'taxi_trip'", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(block).toContain("Number.isSafeInteger(amountPence)");
    expect(block).toContain('session.currency !== "gbp"');
    expect(block).toContain('collection("platform_fee_settlements").doc(session.id)');
    expect(block).toContain("db.runTransaction");
    expect(block).toContain("if (settlementSnap.exists)");
    expect(block).toContain("existing?.driverId !== driverId");
    expect(block).toContain("tx.update(driverRef");
    expect(block).toContain("tx.set(settlementRef");
  });
});
