import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("correlated domain event idempotency", () => {
  it("derives a stable event ID and persists it transactionally only once", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/domainEvents.ts"), "utf8");
    expect(source).toContain('crypto.createHash("sha256").update(eventType + ":" + aggregateId + ":" + correlationId)');
    expect(source).toContain('collection("domain_events").doc(event.eventId)');
    expect(source).toContain("firestoreDb.runTransaction");
    expect(source).toContain("if (existing.exists) return false");
    expect(source).toContain("transaction.set(eventRef, event)");
    expect(source).toContain("if (!created) return event");
    expect(source).toContain("if (correlationId) {");
    expect(source).toContain("throw dbErr");
  });
});
