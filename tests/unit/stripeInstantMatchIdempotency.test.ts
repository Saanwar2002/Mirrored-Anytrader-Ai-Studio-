import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Stripe instant-match checkout idempotency", () => {
  it("uses a stable session key and atomically creates the match and job link", () => {
    const source = readFileSync(resolve(process.cwd(), "server.ts"), "utf8");
    const marker = "const createdOrAlreadyLinked = await db.runTransaction";
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf("} else if (meta?.type === 'milestone_funding'", start);
    expect(end).toBeGreaterThan(start);
    const block = source.slice(start, end);

    expect(source).toContain('const matchRef = db.collection("instant_matches").doc(session.id)');
    expect(block).toContain("tx.get(matchRef)");
    expect(block).toContain("tx.get(jobRef)");
    expect(block).toContain("if (!matchSnap.exists)");
    expect(block).toContain("tx.create(matchRef");
    expect(block).toContain("tx.set(jobRef");
    expect(block).toContain("linkedMatchId !== matchRef.id");
    expect(block).not.toContain('collection("instant_matches").doc()');
  });
});
