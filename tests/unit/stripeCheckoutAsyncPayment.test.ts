import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe delayed Checkout payment fulfilment", () => {
  it("routes async payment success through the same verified paid-session fulfilment path", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const branchStart = serverSource.indexOf(
      "if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')"
    );
    expect(branchStart).toBeGreaterThan(-1);

    const branchEnd = serverSource.indexOf("} else if (event.type === 'customer.subscription.updated')", branchStart);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const checkoutBranch = serverSource.slice(branchStart, branchEnd);

    expect(checkoutBranch).toContain("session.payment_status !== 'paid'");
    expect(checkoutBranch).toContain("meta?.type === 'ad_wallet_topup'");
    expect(checkoutBranch).toContain("meta?.type === 'milestone_funding'");
    expect(checkoutBranch).toContain("meta?.type === 'taxi_trip'");
    expect(checkoutBranch).toContain("Ignoring legacy mediation stake Checkout Session");
  });

  it("does not allow an unpaid completed session to enter paid fulfilment", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const branchStart = serverSource.indexOf(
      "if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded')"
    );
    const unpaidGuard = serverSource.indexOf("if (session.payment_status !== 'paid')", branchStart);
    const paidFulfilment = serverSource.indexOf("const userId = session.client_reference_id", branchStart);
    expect(unpaidGuard).toBeGreaterThan(branchStart);
    expect(paidFulfilment).toBeGreaterThan(unpaidGuard);
  });
});
