import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe webhook in-flight delivery recovery", () => {
  it("does not acknowledge an event while another worker may still fail", () => {
    const serverSource = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const claimStart = serverSource.indexOf("const claimResult = await db.runTransaction");
    expect(claimStart).toBeGreaterThan(-1);

    const claimEnd = serverSource.indexOf("} catch (txErr)", claimStart);
    expect(claimEnd).toBeGreaterThan(claimStart);
    const claimBlock = serverSource.slice(claimStart, claimEnd);

    expect(claimBlock).toContain("return 'already_finalized'");
    expect(claimBlock).toContain("return 'currently_processing'");
    expect(claimBlock).toContain("return 'claimed'");
    expect(claimBlock).toContain("res.status(200).send(\"Already processed\")");
    expect(claimBlock).toContain("res.status(503).send(\"Webhook is still processing; retry delivery\")");
    expect(claimBlock).not.toContain("Already processed or currently processing");
  });
});
