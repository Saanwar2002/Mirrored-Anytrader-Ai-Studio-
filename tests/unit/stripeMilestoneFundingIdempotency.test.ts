import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe milestone funding webhook idempotency", () => {
  it("guards quote funding by PaymentIntent and creates one notification per Checkout Session", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const start = source.indexOf("meta?.type === 'milestone_funding'");
    const end = source.indexOf("} else if (meta?.type === 'fee_settlement'", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(block).toContain("db.runTransaction");
    expect(block).toContain("currentMilestone.status === \"funded\"");
    expect(block).toContain("currentMilestone.stripePaymentIntentId !== paymentIntentId");
    expect(block).toContain("validateMilestoneTransition(currentMilestone.status || \"pending\", \"funded\")");
    expect(block).toContain('doc(`milestone_funded_${session.id}`)');
    expect(block).toContain("if (notificationSnap.exists) return");
    expect(block).toContain("tx.create(notificationRef");
    expect(block).not.toContain('domainEvents.dispatch("MILESTONE_FUNDED"');
    expect(block).toContain("PaymentLedgerEngine.recordEscrowFunding");
  });
});
