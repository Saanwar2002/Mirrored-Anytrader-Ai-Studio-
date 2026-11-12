import { describe, expect, it } from "vitest";
import { createInstantMatchAttempt } from "../../instantMatchWorker.ts";

function createMemoryDb(initialMatch: any = { status: "searching", currentAttempt: 0 }) {
  const store = new Map<string, any>([["instant_matches/match-1", { ...initialMatch }]]);
  const ref = (collection: string, id: string) => ({ id, key: collection + "/" + id });
  const db: any = {
    collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
    runTransaction: async (callback: any) => callback({
      get: async (documentRef: any) => ({ exists: store.has(documentRef.key), data: () => store.get(documentRef.key) }),
      create: (documentRef: any, value: any) => { if (store.has(documentRef.key)) throw new Error("already exists"); store.set(documentRef.key, value); },
      update: (documentRef: any, value: any) => store.set(documentRef.key, { ...store.get(documentRef.key), ...value })
    })
  };
  return { db, store, matchRef: ref("instant_matches", "match-1") };
}

describe("Instant Match transactional attempt creation", () => {
  it("creates one deterministic attempt and advances the match atomically", async () => {
    const { db, store, matchRef } = createMemoryDb();
    expect(await createInstantMatchAttempt(db, matchRef, 1, { id: "trader-1" }, 60)).toBe(true);
    expect(store.get("instant_match_attempts/match-1_1")).toMatchObject({ instantMatchId: "match-1", attemptNumber: 1, traderId: "trader-1", status: "pending" });
    expect(store.get("instant_matches/match-1").currentAttempt).toBe(1);
  });
  it("does not create a duplicate when another trigger already created the attempt", async () => {
    const { db, store, matchRef } = createMemoryDb();
    expect(await createInstantMatchAttempt(db, matchRef, 1, { id: "trader-1" }, 60)).toBe(true);
    expect(await createInstantMatchAttempt(db, matchRef, 1, { id: "trader-2" }, 60)).toBe(false);
    expect(store.get("instant_match_attempts/match-1_1").traderId).toBe("trader-1");
    expect([...store.keys()].filter(key => key.startsWith("instant_match_attempts/"))).toHaveLength(1);
  });
  it("does not create an attempt after the match has left searching", async () => {
    const { db, store, matchRef } = createMemoryDb({ status: "expired", currentAttempt: 0 });
    expect(await createInstantMatchAttempt(db, matchRef, 1, { id: "trader-1" }, 60)).toBe(false);
    expect(store.has("instant_match_attempts/match-1_1")).toBe(false);
  });
  it("does not skip an attempt number when the match counter is out of sequence", async () => {
    const { db, store, matchRef } = createMemoryDb();
    expect(await createInstantMatchAttempt(db, matchRef, 2, { id: "trader-1" }, 60)).toBe(false);
    expect(store.has("instant_match_attempts/match-1_2")).toBe(false);
  });
});
