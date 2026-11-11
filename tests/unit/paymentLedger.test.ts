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
    await PaymentLedgerEngine.executeIdempotentOperation(db, "key", "PAYMENT_CAPTURE", async () => "done");
    await expect(PaymentLedgerEngine.executeIdempotentOperation(db, "key", "REFUND", async () => "wrong"))
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
    await expect(PaymentLedgerEngine.executeIdempotentOperation(db, "claim", "CAPTURE", async () => {
      store.set("claim", { operationName: "CAPTURE", status: "in_progress", claimToken: "successor", startedAt: new Date().toISOString() });
      return { transfer: "tr_1" };
    })).rejects.toThrow("superseded");
    expect(store.get("claim").claimToken).toBe("successor");
    expect(store.get("claim").status).toBe("in_progress");
  });

});
