import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe ad wallet top-up idempotency", () => {
  it("credits each Checkout Session once using a transactional ledger record", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const marker = 'const topupRef = db.collection("ad_wallet_topups").doc(session.id)';
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("} else if (meta?.type === 'mediation_stake')", start);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(block).toContain("db.runTransaction");
    expect(block).toContain("tx.get(topupRef)");
    expect(block).toContain("if (topupSnap.exists)");
    expect(block).toContain("existing?.userId !== userId");
    expect(block).toContain("tx.update(userRef");
    expect(block).toContain("FieldValue.increment(topupAmount)");
    expect(block).toContain("tx.create(topupRef");
    expect(block).toContain("checkoutSessionId: session.id");
    expect(block).not.toContain("userRef.set(");
  });
});
