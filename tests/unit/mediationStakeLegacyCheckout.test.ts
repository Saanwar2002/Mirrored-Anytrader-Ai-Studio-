import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legacy mediation stake Checkout Session webhook", () => {
  it("cannot fulfil a mediation stake or mutate dispute payment state", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const branchStart = serverSource.indexOf("else if (meta?.type === 'mediation_stake')");
    expect(branchStart).toBeGreaterThan(-1);

    const branchEnd = serverSource.indexOf("if (meta?.type === 'boost'", branchStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const legacyBranch = serverSource.slice(branchStart, branchEnd);

    expect(legacyBranch).toContain("Ignoring legacy mediation stake Checkout Session");
    expect(legacyBranch).not.toMatch(/mediationStakePaid|stakePaymentStatus|pending_arbitration|confirmMediationStakePayment|reserveMediationStakeAttempt/);
    expect(legacyBranch).not.toMatch(/\.collection\(["']jobs["']\).*\.update|\.update\s*\(/s);
  });
});
