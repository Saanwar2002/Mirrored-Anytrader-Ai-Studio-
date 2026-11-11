import { describe, expect, it } from "vitest";
import { recordConfirmedRefund, reserveRefundOperation } from "../../src/server/refundReconciliation.ts";
import { BadRequestError, ConflictError } from "../../src/server/httpErrors.ts";

function createMemoryDb(seed: Record<string, any> = {}) {
  const store = new Map<string, any>(Object.entries(seed));
  const ref = (collection: string, id: string) => ({
    key: `${collection}/${id}`,
    collection,
    id,
  });
  return {
    store,
    collection: (collection: string) => ({
      doc: (id: string) => ref(collection, id),
    }),
    runTransaction: async (callback: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (documentRef: any) => ({
          exists: store.has(documentRef.key),
          data: () => store.get(documentRef.key),
        }),
        set: (documentRef: any, data: any, options?: any) => {
          const previous = store.get(documentRef.key);
          store.set(documentRef.key, options?.merge ? { ...(previous || {}), ...data } : data);
        },
        create: (documentRef: any, data: any) => {
          if (store.has(documentRef.key)) throw new Error("already exists");
          store.set(documentRef.key, data);
        },
      };
      return callback(tx);
    },
  };
}

const original = {
  entryId: "ledg_original",
  transactionId: "pi_original",
  payerId: "customer_1",
  payeeId: "trader_1",
  amount: 10000,
  platformFee: 1200,
  netPayout: 8800,
  currency: "gbp",
  type: "ESCROW_DEPOSIT",
  status: "completed",
};

describe("refund reconciliation", () => {
  it("reserves one stable refund operation and replays matching requests", async () => {
    const db = createMemoryDb();
    const input = {
      operationId: "instant-match-timeout_match_1",
      paymentIntentId: "pi_original",
      requestedAmountPence: 299,
      currency: "gbp",
    };

    const first = await reserveRefundOperation(db, input);
    const replay = await reserveRefundOperation(db, input);

    expect(first.wasReplayed).toBe(false);
    expect(replay.wasReplayed).toBe(true);
    expect(replay.operation.idempotencyKey).toBe("refund:instant-match-timeout_match_1");
    expect(db.store.size).toBe(1);
  });

  it("rejects reuse of an operation ID with different payment details", async () => {
    const db = createMemoryDb();
    await reserveRefundOperation(db, {
      operationId: "operation_1",
      paymentIntentId: "pi_original",
      requestedAmountPence: 299,
      currency: "gbp",
    });

    await expect(reserveRefundOperation(db, {
      operationId: "operation_1",
      paymentIntentId: "pi_other",
      requestedAmountPence: 299,
      currency: "gbp",
    })).rejects.toThrow(ConflictError);
  });

  it("records one immutable refund ledger entry and deduplicates the Stripe refund ID", async () => {
    const db = createMemoryDb({ "payment_ledger/ledg_original": original });
    const input = {
      refundId: "re_123",
      chargeId: "ch_123",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 2500,
      currency: "gbp",
    };

    const first = await recordConfirmedRefund(db, input);
    const replay = await recordConfirmedRefund(db, input);

    expect(first.wasReplayed).toBe(false);
    expect(first.cumulativeRefundedPence).toBe(2500);
    expect(replay.wasReplayed).toBe(true);
    expect(replay.entry.entryId).toBe(first.entry.entryId);
    expect(db.store.get(`payment_ledger/${first.entry.entryId}`).direction).toBe("outflow");
    expect(db.store.get("payment_ledger/ledg_original").amount).toBe(10000);
    expect(db.store.get(Object.keys(Object.fromEntries(db.store)).find(k => k.startsWith("payment_refund_totals/"))!)?.remainingAmountPence).toBe(7500);
  });

  it("rejects replay of a Stripe refund ID with a different charge or currency", async () => {
    const db = createMemoryDb({ "payment_ledger/ledg_original": original });
    const input = {
      refundId: "re_replay_mismatch",
      chargeId: "ch_original",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 500,
      currency: "gbp",
    };
    await recordConfirmedRefund(db, input);
    await expect(recordConfirmedRefund(db, { ...input, chargeId: "ch_other" }))
      .rejects.toThrow(ConflictError);
    await expect(recordConfirmedRefund(db, { ...input, currency: "usd" }))
      .rejects.toThrow(ConflictError);
  });

  it("marks a reserved operation succeeded when its Stripe refund is confirmed", async () => {
    const db = createMemoryDb({ "payment_ledger/ledg_original": original });
    await reserveRefundOperation(db, {
      operationId: "instant_match_match_1",
      paymentIntentId: "pi_original",
      requestedAmountPence: 299,
      currency: "gbp",
    });

    await recordConfirmedRefund(db, {
      refundId: "re_instant_match",
      chargeId: "ch_original",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 299,
      currency: "gbp",
      operationId: "instant_match_match_1",
    });

    const operation = db.store.get("refund_operations/instant_match_match_1");
    expect(operation.status).toBe("succeeded");
    expect(operation.stripeRefundId).toBe("re_instant_match");
    expect(operation.confirmedAmountPence).toBe(299);
  });

  it("prevents cumulative partial refunds from exceeding the original payment", async () => {
    const db = createMemoryDb({ "payment_ledger/ledg_original": original });
    await recordConfirmedRefund(db, {
      refundId: "re_first",
      chargeId: "ch_123",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 7000,
      currency: "gbp",
    });

    await expect(recordConfirmedRefund(db, {
      refundId: "re_second",
      chargeId: "ch_123",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 3001,
      currency: "gbp",
    })).rejects.toThrow(ConflictError);
  });


  it("does not accept taxi ride or direct-payout ledger entries in the AnyTrader refund path", async () => {
    for (const type of ["RIDE_PAYMENT", "DIRECT_PAYOUT"]) {
      const db = createMemoryDb({
        "payment_ledger/ledg_original": { ...original, type },
      });
      await expect(recordConfirmedRefund(db, {
        refundId: `re_taxi_${type.toLowerCase()}`,
        chargeId: "ch_taxi",
        paymentIntentId: "pi_original",
        originalLedgerEntryId: "ledg_original",
        amountPence: 1000,
        currency: "gbp",
      })).rejects.toThrow(ConflictError);
    }
  });

  it("rejects invalid minor-unit refund amounts", async () => {
    const db = createMemoryDb({ "payment_ledger/ledg_original": original });
    await expect(recordConfirmedRefund(db, {
      refundId: "re_invalid",
      chargeId: "ch_123",
      paymentIntentId: "pi_original",
      originalLedgerEntryId: "ledg_original",
      amountPence: 1.5,
      currency: "gbp",
    })).rejects.toThrow(BadRequestError);
  });
});
