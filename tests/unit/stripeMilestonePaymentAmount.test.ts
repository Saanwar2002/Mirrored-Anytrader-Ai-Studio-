import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe milestone funding amount validation", () => {
  it("rejects missing milestones and any amount that does not exactly match the milestone", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const marker = "const expectedPence = targetMilestone";
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("const paymentIntentId = session.payment_intent", start);
    expect(end).toBeGreaterThan(start);
    const validation = source.slice(start, end);

    expect(validation).toContain("!targetMilestone");
    expect(validation).toContain("expectedPence <= 0");
    expect(validation).toContain("session.amount_total !== expectedPence");
    expect(validation).toContain('status: "rejected"');
    expect(validation).toContain('rejectionReason: "milestone_payment_amount_mismatch"');
    expect(validation).toContain('res.status(400).send("Milestone payment amount mismatch")');
  });
});
