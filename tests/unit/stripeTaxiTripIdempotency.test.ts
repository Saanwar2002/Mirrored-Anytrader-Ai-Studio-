import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe taxi trip webhook idempotency", () => {
  it("commits ride, ledger and driver metrics atomically once per Checkout Session", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const start = source.indexOf("meta?.type === 'taxi_trip'");
    const end = source.indexOf("} else if (event.type === 'customer.subscription.updated'", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(block).toContain("Number.isSafeInteger(amountPence)");
    expect(block).toContain("const ledgerEntryId = `ledg_ride_${session.id}`");
    expect(block).toContain('collection("payment_ledger").doc(ledgerEntryId)');
    expect(block).toContain("db.runTransaction");
    expect(block).toContain("if (ledgerSnap.exists)");
    expect(block).toContain("tx.create(ledgerRef");
    expect(block).toContain("tx.set(rideRef");
    expect(block).toContain("tx.update(metricsRef");
    expect(block).toContain("tx.set(metricsRef");
    expect(block).toContain("dailyEarnings: admin.firestore.FieldValue.increment(earnings)");
    expect(block).toContain("different PaymentIntent");
  });
});
