import { describe, it, expect } from "vitest";
import { PaymentLedgerEngine } from "../../src/server/paymentLedger.ts";
import { BadRequestError } from "../../src/server/httpErrors.ts";
import { InvalidStateTransitionError } from "../../src/server/stateMachine.ts";

describe("Payment Ledger & Invariants", () => {
  it("rejects non-positive deposit amounts", async () => {
    await expect(
      PaymentLedgerEngine.recordEscrowFunding(null, {
        jobId: "job_1",
        milestoneId: "ms_1",
        customerId: "cust_1",
        traderId: "trader_1",
        verifiedAmount: -500,
        currency: "gbp",
        paymentIntentId: "pi_123",
        idempotencyKey: "idem_1",
      })
    ).rejects.toThrow(BadRequestError);

    await expect(
      PaymentLedgerEngine.recordEscrowFunding(null, {
        jobId: "job_1",
        milestoneId: "ms_1",
        customerId: "cust_1",
        traderId: "trader_1",
        verifiedAmount: 0,
        currency: "gbp",
        paymentIntentId: "pi_123",
        idempotencyKey: "idem_1",
      })
    ).rejects.toThrow(BadRequestError);
  });

  it("calculates platform fee (12%) and net payout deterministically", async () => {
    const entry = await PaymentLedgerEngine.recordEscrowFunding(null, {
      jobId: "job_1",
      milestoneId: "ms_1",
      customerId: "cust_1",
      traderId: "trader_1",
      verifiedAmount: 10000, // £100.00
      currency: "gbp",
      paymentIntentId: "pi_123",
      idempotencyKey: "idem_test_calc",
    });

    expect(entry.amount).toBe(10000);
    expect(entry.platformFee).toBe(1200); // 12%
    expect(entry.netPayout).toBe(8800); // 88%
    expect(entry.status).toBe("completed");
    expect(entry.type).toBe("ESCROW_DEPOSIT");
  });

  it("prevents duplicate execution under simulated in-memory idempotency", async () => {
    // Test in-memory mock db
    const memoryStore = new Map<string, any>();
    const mockDb = {
      collection: (colName: string) => ({
        doc: (docId: string) => ({
          get: async () => ({
            exists: memoryStore.has(docId),
            data: () => memoryStore.get(docId),
          }),
          set: async (data: any, options?: any) => {
            if (options?.merge) {
              const prev = memoryStore.get(docId) || {};
              memoryStore.set(docId, { ...prev, ...data });
            } else {
              memoryStore.set(docId, data);
            }
          },
          update: async (data: any) => {
            const prev = memoryStore.get(docId) || {};
            memoryStore.set(docId, { ...prev, ...data });
          },
          delete: async () => {
            memoryStore.delete(docId);
          }
        }),
      }),
      runTransaction: async (fn: any) => {
        const transaction = {
          get: async (ref: any) => {
            const key = "test_key_1";
            return {
              exists: memoryStore.has(key),
              data: () => memoryStore.get(key),
            };
          },
          set: (ref: any, data: any) => {
            memoryStore.set("test_key_1", data);
          },
          update: (ref: any, data: any) => {
            const existing = memoryStore.get("test_key_1") || {};
            memoryStore.set("test_key_1", { ...existing, ...data });
          },
          delete: () => {
            memoryStore.delete("test_key_1");
          },
        };
        return await fn(transaction);
      },
    };

    let executionCount = 0;
    const task = async () => {
      executionCount++;
      return { status: "ok", count: executionCount };
    };

    // First call
    const firstCall = await PaymentLedgerEngine.executeIdempotentOperation(
      mockDb,
      "test_key_1",
      "TEST_OP",
      { version: 1, testResource: "resource-1" },
      task
    );
    expect(firstCall.wasReplayed).toBe(false);
    expect(firstCall.result.count).toBe(1);

    // Second call with same idempotency key
    const secondCall = await PaymentLedgerEngine.executeIdempotentOperation(
      mockDb,
      "test_key_1",
      "TEST_OP",
      { version: 1, testResource: "resource-1" },
      task
    );
    expect(secondCall.wasReplayed).toBe(true);
    expect(secondCall.result.count).toBe(1); // Not re-executed!
    expect(executionCount).toBe(1); // Function was only called once
  });
  it("rejects reuse of a completed idempotency key for a different operation", async () => {
    const store = new Map<string, any>();
    const db = {
      collection: () => ({ doc: (id: string) => ({ update: async (v: any) => store.set(id, {...store.get(id), ...v}), set: async (v: any) => store.set(id,v), delete: async () => store.delete(id) }) }),
      runTransaction: async (fn: any) => fn({
        get: async (ref: any) => ({ exists: store.has("key"), data: () => store.get("key") }),
        set: (ref: any, value: any) => store.set("key", value),
        update: (ref: any, value: any) => store.set("key", {...store.get("key"), ...value}),
        delete: () => store.delete("key"),
      }),
    };
    await PaymentLedgerEngine.executeIdempotentOperation(db, "key", "PAYMENT_CAPTURE", { version: 1, resource: "payment-1" }, async () => "done");
    await expect(PaymentLedgerEngine.executeIdempotentOperation(db, "key", "REFUND", { version: 1, resource: "payment-1" }, async () => "wrong"))
      .rejects.toThrow("different financial operation");
  });

  it("rejects reuse of a completed idempotency key for different transaction details", async () => {
    const store = new Map<string, any>();
    const db = {
      collection: () => ({ doc: (id: string) => ({ id, update: async (v: any) => store.set(id, {...store.get(id), ...v}), set: async (v: any) => store.set(id,v), delete: async () => store.delete(id) }) }),
      runTransaction: async (fn: any) => fn({
        get: async (ref: any) => ({ exists: store.has(ref.id), data: () => store.get(ref.id) }),
        set: (ref: any, value: any) => store.set(ref.id, value),
        update: (ref: any, value: any) => store.set(ref.id, {...store.get(ref.id), ...value}),
        delete: (ref: any) => store.delete(ref.id),
      }),
    };
    const binding = { version: 1, jobId: "job-A", milestoneId: "milestone-A", amountPence: 5000 };
    await PaymentLedgerEngine.executeIdempotentOperation(db, "semantic-key", "RELEASE_MILESTONE", binding, async () => "released");
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      db, "semantic-key", "RELEASE_MILESTONE",
      { ...binding, amountPence: 9000 }, async () => "wrong"
    )).rejects.toThrow("different transaction details");
  });

  it("does not let a stale executor complete or delete a successor idempotency claim", async () => {
    const store = new Map<string, any>();
    const db = {
      collection: (_name: string) => ({ doc: (id: string) => ({
        id,
        update: async (v: any) => store.set(id, {...store.get(id), ...v}),
        set: async (v: any) => store.set(id,v),
        delete: async () => store.delete(id),
      }) }),
      runTransaction: async (fn: any) => fn({
        get: async (ref: any) => ({ exists: store.has(ref.id), data: () => store.get(ref.id) }),
        set: (ref: any, value: any) => store.set(ref.id, value),
        update: (ref: any, value: any) => store.set(ref.id, {...store.get(ref.id), ...value}),
        delete: (ref: any) => store.delete(ref.id),
      }),
    };
    await expect(PaymentLedgerEngine.executeIdempotentOperation(db, "claim", "CAPTURE", { version: 1, resource: "capture-1" }, async () => {
      store.set("claim", { operationName: "CAPTURE", status: "in_progress", claimToken: "successor", startedAt: new Date().toISOString() });
      return { transfer: "tr_1" };
    })).rejects.toThrow("superseded");
    expect(store.get("claim").claimToken).toBe("successor");
    expect(store.get("claim").status).toBe("in_progress");
  });

  it("blocks automatic replay of an expired in-progress financial claim", async () => {
    const store = new Map<string, any>([["expired-key", {
      operationName: "TRANSFER", bindingHash: "2430f1a2ad2982d0067885488a4c89e21ad1d7c83b115ba8f1b20acc88dfaea8", status: "in_progress",
      startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(), claimToken: "old-worker",
    }]]);
    const db = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      runTransaction: async (fn: any) => fn({
        get: async (ref: any) => ({ exists: store.has(ref.id), data: () => store.get(ref.id) }),
        set: (ref: any, value: any) => store.set(ref.id, value),
        update: (ref: any, value: any) => store.set(ref.id, { ...store.get(ref.id), ...value }),
        delete: (ref: any) => store.delete(ref.id),
      }),
    };
    let executions = 0;
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      db, "expired-key", "TRANSFER", { version: 1 }, async () => { executions++; return "transferred"; }
    )).rejects.toThrow("requires reconciliation");
    expect(executions).toBe(0);
    expect(store.get("expired-key").status).toBe("reconciliation_required");
    expect(store.get("expired-key").claimToken).toBe("old-worker");

    // A subsequent retry must not replace the reconciliation stop state with
    // a fresh in-progress claim and repeat a possibly completed external effect.
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      db, "expired-key", "TRANSFER", { version: 1 }, async () => { executions++; return "duplicate"; }
    )).rejects.toThrow("automatic replay remains blocked");
    expect(executions).toBe(0);
    expect(store.get("expired-key").status).toBe("reconciliation_required");
    expect(store.get("expired-key").claimToken).toBe("old-worker");
  });

  it("canonicalizes semantic bindings and rejects owner or resource changes", async () => {
    const store = new Map<string, any>();
    const db = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      runTransaction: async (fn: any) => fn({
        get: async (ref: any) => ({ exists: store.has(ref.id), data: () => store.get(ref.id) }),
        set: (ref: any, value: any) => store.set(ref.id, value),
        update: (ref: any, value: any) => store.set(ref.id, { ...store.get(ref.id), ...value }),
        delete: (ref: any) => store.delete(ref.id),
      }),
    };
    let executions = 0;
    const first = await PaymentLedgerEngine.executeIdempotentOperation(
      db, "canonical-binding-key", "FUND_ESCROW",
      { version: 1, ownerId: "customer-1", resourceId: "milestone-1", amountPence: 5000 },
      async () => { executions++; return { ledgerEntryId: "ledger-1" }; }
    );
    const reordered = await PaymentLedgerEngine.executeIdempotentOperation(
      db, "canonical-binding-key", "FUND_ESCROW",
      { amountPence: 5000, resourceId: "milestone-1", ownerId: "customer-1", version: 1 },
      async () => { executions++; return { ledgerEntryId: "wrong" }; }
    );
    expect(first.wasReplayed).toBe(false);
    expect(reordered.wasReplayed).toBe(true);
    expect(reordered.result).toEqual({ ledgerEntryId: "ledger-1" });

    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      db, "canonical-binding-key", "FUND_ESCROW",
      { version: 1, ownerId: "customer-2", resourceId: "milestone-1", amountPence: 5000 },
      async () => { executions++; return "wrong-owner"; }
    )).rejects.toThrow("different transaction details");
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      db, "canonical-binding-key", "FUND_ESCROW",
      { version: 1, ownerId: "customer-1", resourceId: "milestone-2", amountPence: 5000 },
      async () => { executions++; return "wrong-resource"; }
    )).rejects.toThrow("different transaction details");
    expect(executions).toBe(1);
  });

  it("rejects slash-containing or oversized idempotency keys before Firestore access", async () => {
    const executor = async () => "must-not-run";
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      null, "unsafe/path/key", "TEST", { version: 1 }, executor
    )).rejects.toThrow("cannot contain");
    await expect(PaymentLedgerEngine.executeIdempotentOperation(
      null, "x".repeat(201), "TEST", { version: 1 }, executor
    )).rejects.toThrow("at most 200");
  });

});
