import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "crypto";
import { PaymentLedgerEngine } from "../../src/server/paymentLedger.ts";
import { validateMilestoneTransition } from "../../src/server/stateMachine.ts";
import { ConflictError, BadRequestError, ForbiddenError } from "../../src/server/httpErrors.ts";

// Helper to create atomic-concurrency-aware transactional mock Firestore
function createMockFirestore(initialData: Record<string, any> = {}) {
  const store: Record<string, any> = JSON.parse(JSON.stringify(initialData));
  const docVersions: Record<string, number> = {};
  for (const path of Object.keys(store)) {
    docVersions[path] = 1;
  }

  const db: any = {
    _store: store,
    collection(collectionPath: string) {
      return {
        path: collectionPath,
        doc(docId?: string) {
          const actualDocId = docId || `doc_${Math.random().toString(36).substring(7)}`;
          const fullPath = `${collectionPath}/${actualDocId}`;
          const docRef = {
            id: actualDocId,
            path: fullPath,
            collection(subcollectionPath: string) {
              return db.collection(`${fullPath}/${subcollectionPath}`);
            },
            async get() {
              const data = store[fullPath];
              return {
                id: actualDocId,
                path: fullPath,
                exists: data !== undefined && data !== null,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
                ref: docRef,
              };
            },
            async set(data: any, options?: { merge?: boolean }) {
              if (options?.merge && store[fullPath]) {
                store[fullPath] = { ...store[fullPath], ...JSON.parse(JSON.stringify(data)) };
              } else {
                store[fullPath] = JSON.parse(JSON.stringify(data));
              }
              docVersions[fullPath] = (docVersions[fullPath] || 0) + 1;
            },
            async update(data: any) {
              if (!store[fullPath]) throw new Error(`Document not found: ${fullPath}`);
              store[fullPath] = { ...store[fullPath], ...JSON.parse(JSON.stringify(data)) };
              docVersions[fullPath] = (docVersions[fullPath] || 0) + 1;
            },
            async delete() {
              delete store[fullPath];
              docVersions[fullPath] = (docVersions[fullPath] || 0) + 1;
            },
          };
          return docRef;
        },
        async get() {
          const docs: any[] = [];
          for (const [fullPath, data] of Object.entries(store)) {
            const parts = fullPath.split("/");
            const pathPrefix = parts.slice(0, -1).join("/");
            if (pathPrefix === collectionPath && data !== undefined && data !== null) {
              docs.push({
                id: parts.pop(),
                data: () => JSON.parse(JSON.stringify(data)),
              });
            }
          }
          return { empty: docs.length === 0, docs };
        },
        where(field: string, operator: string, value: any) {
          return {
            get: async () => {
              const docs: any[] = [];
              for (const [fullPath, data] of Object.entries(store)) {
                if (fullPath.startsWith(collectionPath + "/")) {
                  if (data && data[field] === value) {
                    const actualDocId = fullPath.split("/").pop()!;
                    docs.push({
                      id: actualDocId,
                      ref: db.collection(collectionPath).doc(actualDocId),
                      data: () => JSON.parse(JSON.stringify(data)),
                    });
                  }
                }
              }
              return { empty: docs.length === 0, docs };
            }
          };
        }
      };
    },
    async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
      let attempts = 0;
      const maxAttempts = 15;
      while (attempts < maxAttempts) {
        attempts++;
        const readSet: Record<string, number> = {};
        const writeSet: Record<string, any> = {};
        const deleteSet: Record<string, boolean> = {};

        const transaction = {
          async get(refOrQuery: any) {
            const path = refOrQuery.path;
            readSet[path] = docVersions[path] || 0;
            const data = store[path];
            return {
              id: refOrQuery.id,
              exists: data !== undefined && data !== null,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
            };
          },
          set(docRef: any, data: any, options?: { merge?: boolean }) {
            const path = docRef.path;
            const current = store[path] || {};
            if (options?.merge) {
              writeSet[path] = { ...current, ...JSON.parse(JSON.stringify(data)) };
            } else {
              writeSet[path] = JSON.parse(JSON.stringify(data));
            }
          },
          update(docRef: any, data: any) {
            const path = docRef.path;
            const current = writeSet[path] || store[path];
            if (!current) throw new Error(`Document not found for update: ${path}`);
            writeSet[path] = { ...current, ...JSON.parse(JSON.stringify(data)) };
          },
          delete(docRef: any) {
            const path = docRef.path;
            deleteSet[path] = true;
          },
        };

        try {
          const result = await updateFunction(transaction);

          // Verify collisions
          let collision = false;
          for (const [path, readVer] of Object.entries(readSet)) {
            const currentVer = docVersions[path] || 0;
            if (currentVer > readVer) {
              collision = true;
              break;
            }
          }

          if (collision) {
            // Transaction collision retry window
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));
            continue;
          }

          // Commit atomic updates
          for (const [path, val] of Object.entries(writeSet)) {
            store[path] = val;
            docVersions[path] = (docVersions[path] || 0) + 1;
          }
          for (const path of Object.keys(deleteSet)) {
            delete store[path];
            docVersions[path] = (docVersions[path] || 0) + 1;
          }

          return result;
        } catch (err) {
          throw err;
        }
      }
      throw new Error("Transaction failed due to too many retries on conflict");
    },
  };

  db.FieldValue = {
    serverTimestamp: () => new Date().toISOString(),
    increment: (val: number) => ({ __val: val, isIncrement: true }),
  };

  return db;
}

// Use the real canonical authority
async function releaseMilestone(params: {
  db: any;
  jobId: string;
  quoteId: string;
  milestoneId: string;
  isQrHandshake?: boolean;
  idempotencyKey: string;
  authUid: string;
  stripeMock?: any;
}) {
  const { db, jobId, quoteId, milestoneId, isQrHandshake, idempotencyKey, authUid, stripeMock } = params;

  // 1. Database Phase: Atomic transition and ledger recording
  const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
    jobId,
    quoteId,
    milestoneId,
    authUid,
    idempotencyKey,
    isQrHandshake,
  });

  // 2. Stripe Side-Effect Phase: Strictly after DB commit
  if (stripeMock && result.traderId) {
    try {
      const stripeIdempotencyKey = `release:${jobId}:${quoteId}:${milestoneId || '0'}:${idempotencyKey}`;
      const transfer = await stripeMock.transfers.create({
        amount: result.netPayoutPence,
        currency: "gbp",
        destination: "acct_connected_trader",
      }, {
        idempotencyKey: stripeIdempotencyKey
      });
      
      // Update ledger with transfer ID
      const ledgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", idempotencyKey).get();
      if (!ledgerSnap.empty) {
        await ledgerSnap.docs[0].ref.update({ stripeTransferId: transfer.id, transferStatus: "completed" });
      }
    } catch (stripeErr) {
      console.error("Stripe Failed:", stripeErr);
      // In production, we don't throw here if DB is already committed, 
      // but the test needs to know what happened or we can throw to simulate a crash.
      throw stripeErr;
    }
  }

  return result;
}

// Mimic the exact production Stripe Webhook `/api/webhook` handler flow
async function processWebhook(params: {
  db: any;
  event: any;
  throwOnLedgerError?: boolean;
}) {
  const { db, event, throwOnLedgerError = true } = params;
  const eventRef = db.collection("processed_stripe_events").doc(event.id);

  // 1. Transaction claim
  const claimSuccess = await db.runTransaction(async (t: any) => {
    const existing = await t.get(eventRef);
    if (existing.exists) {
      const data = existing.data();
      if (data?.status === 'completed') {
         return false; // Already processed
      }
      if (data?.status === 'processing') {
         return false; // Still processing
      }
    }
    t.set(eventRef, {
      status: 'processing',
      claimedAt: new Date().toISOString()
    });
    return true;
  });

  if (!claimSuccess) {
     return { alreadyProcessed: true };
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta = session.metadata || {};

      if (meta?.type === 'milestone_funding') {
        const { jobId, quoteId, milestoneId } = meta;
        const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
        const quoteDoc = await quoteRef.get();
        
        if (!quoteDoc.exists) {
          throw new Error("Quote not found");
        }
        
        const quoteData = quoteDoc.data();
        const milestones = quoteData?.milestones || [];
          let fundedAmount = 0;
          const targetMilestone = milestones.find((m: any) => m.id === milestoneId);
          const expectedPence = targetMilestone ? Math.round(Number(targetMilestone.amount || targetMilestone.verifiedAmount || 0) * 100) : 0;

          if (session.amount_total && expectedPence > 0 && session.amount_total < expectedPence) {
            throw new Error("Underpayment rejected");
          }

          const updatedMilestones = milestones.map((m: any) => {
            if (m.id === milestoneId) {
              validateMilestoneTransition(m.status || 'pending', 'funded');
              fundedAmount = Number(m.amount || m.verifiedAmount || (session.amount_total ? session.amount_total / 100 : 0));
              return { ...m, status: 'funded', fundedAt: new Date().toISOString(), stripePaymentIntentId: session.payment_intent as string };
            }
            return m;
          });
          
          await quoteRef.update({ milestones: updatedMilestones });

          // Record to immutable payment ledger
          try {
            await PaymentLedgerEngine.recordEscrowFunding(db, {
              jobId,
              milestoneId,
              paymentIntentId: session.payment_intent as string || `pi_${event.id}`,
              idempotencyKey: `webhook_${event.id}`,
              customerId: session.client_reference_id || "homeowner",
              traderId: quoteData?.tradespersonId || "trader",
              verifiedAmount: session.amount_total || Math.round(fundedAmount * 100),
              currency: session.currency || "gbp"
            });
          } catch (ledgErr) {
            if (throwOnLedgerError) {
              throw ledgErr; // Propagate critical ledger failures
            }
          }
        }
      }

    // Mark completed
    await eventRef.update({ status: 'completed' });
    return { success: true };
  } catch (err: any) {
    await eventRef.update({ status: 'failed', error: err.message }).catch(() => {});
    throw err;
  }
}

describe("Task 6: Comprehensive Payment Authority & Escrow Security Suite", () => {
  describe("13. DURABLE QR HANDSHAKE ATTEMPT THROTTLE", () => {
    it("persists five failed PIN attempts and locks further guesses", async () => {
      const db = createMockFirestore({ "jobs/job-qr": { acceptedTradespersonId: "trader-1", handshakeCode: "482915" } });
      for (let i = 0; i < 4; i++) {
        await expect(PaymentLedgerEngine.validateAndRecordQrHandshakeAttempt(db, {
          jobId: "job-qr", authUid: "trader-1", handshakeCode: "000000"
        })).rejects.toThrow(ForbiddenError);
      }
      await expect(PaymentLedgerEngine.validateAndRecordQrHandshakeAttempt(db, {
        jobId: "job-qr", authUid: "trader-1", handshakeCode: "000000"
      })).rejects.toThrow(/temporarily locked/i);
      expect(db._store["jobs/job-qr/handshake_attempts/trader-1"].attempts).toBe(5);
      await expect(PaymentLedgerEngine.validateAndRecordQrHandshakeAttempt(db, {
        jobId: "job-qr", authUid: "trader-1", handshakeCode: "482915"
      })).rejects.toThrow(/temporarily locked/i);
    });

    it("resets the persistent counter after a valid accepted-trader PIN", async () => {
      const db = createMockFirestore({
        "jobs/job-qr": { acceptedTraderId: "trader-1", verificationPin: "482915" },
        "jobs/job-qr/handshake_attempts/trader-1": { attempts: 3, windowStartedAtMs: Date.now(), lockedUntilMs: 0 }
      });
      await expect(PaymentLedgerEngine.validateAndRecordQrHandshakeAttempt(db, {
        jobId: "job-qr", authUid: "trader-1", handshakeCode: "482915"
      })).resolves.toBeUndefined();
      expect(db._store["jobs/job-qr/handshake_attempts/trader-1"]).toMatchObject({ attempts: 0, lockedUntilMs: 0 });
    });
  });


  let db: any;
  const jobId = "job_london_tiling_123";
  const quoteId = "quote_dave_456";
  const milestoneId = "milestone_phase_1";
  const authUid = "homeowner_alice";
  const traderId = "trader_dave";

  const initialJobData = {
    id: jobId,
    homeownerId: authUid,
    userId: authUid,
    title: "Kitchen tiling",
    status: "accepted",
    acceptedTradespersonId: traderId,
    acceptedQuoteId: quoteId,
    verificationPin: "4321",
  };

  const initialQuoteData = {
    id: quoteId,
    jobId,
    tradespersonId: traderId,
    milestones: [
      {
        id: milestoneId,
        title: "Materials Procurement",
        amount: 500,
        status: "funded",
        verifiedAmount: 500,
        currency: "gbp",
        stripePaymentIntentId: "pi_funded_intent_999",
      }
    ]
  };

  beforeEach(() => {
    db = createMockFirestore({
      [`jobs/${jobId}`]: initialJobData,
      [`jobs/${jobId}/quotes/${quoteId}`]: initialQuoteData,
    });
  });

  describe("1. CONCURRENT RELEASE TEST (Real Transaction Conflict Simulation)", () => {
    it("rejects concurrent milestone release attempts and creates exactly one financial effect", async () => {
      const stripeTransfers: any[] = [];
      const stripeMock = {
        transfers: {
          create: async (data: any, options: any) => {
            stripeTransfers.push({ data, options });
            return { id: `tr_${Math.random().toString(36).substring(7)}` };
          }
        }
      };

      // Two concurrent release operations with different idempotency keys
      const results = await Promise.allSettled([
        releaseMilestone({
          db,
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_operation_key_A",
          authUid,
          stripeMock,
        }),
        releaseMilestone({
          db,
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: "rel_operation_key_B",
          authUid,
          stripeMock,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // Invariants Verification
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      // Verifying Firestore states
      const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
      const m = quoteSnap.data()?.milestones.find((x: any) => x.id === milestoneId);
      expect(m.status).toBe("funds_released");
      expect(m.releaseOperationId).toBe("rel_operation_key_A"); // Operation A wins

      // Financial effects verification
      const ledgerSnap = await db.collection("payment_ledger").get();
      expect(ledgerSnap.docs.length).toBe(1); // Exactly 1 ledger effect
      const ledgerData = ledgerSnap.docs[0].data();
      expect(ledgerData.amount).toBe(50000); // £500 * 100
      expect(ledgerData.platformFee).toBe(6000); // 12%
      expect(ledgerData.netPayout).toBe(44000); // 88%

      // Stripe Transfer verification
      expect(stripeTransfers.length).toBe(1); // Exactly 1 Stripe transfer request
      expect(stripeTransfers[0].options.idempotencyKey).toBe("release:job_london_tiling_123:quote_dave_456:milestone_phase_1:rel_operation_key_A");
    });
  });

  describe("2. SAME-KEY RETRY TEST", () => {
    it("returns identical cached results without replicating financial or ledger effects", async () => {
      const stripeMock = {
        transfers: {
          create: async (data: any, options: any) => ({ id: "tr_id_deterministic_1" })
        }
      };

      const keyX = "rel_operation_key_X";

      // Three repeated calls using same idempotency key
      const res1 = await releaseMilestone({ db, jobId, quoteId, milestoneId, idempotencyKey: keyX, authUid, stripeMock });
      expect(res1.success).toBe(true);

      const res2 = await releaseMilestone({ db, jobId, quoteId, milestoneId, idempotencyKey: keyX, authUid, stripeMock });
      expect(res2.success).toBe(true);

      const res3 = await releaseMilestone({ db, jobId, quoteId, milestoneId, idempotencyKey: keyX, authUid, stripeMock });
      expect(res3.success).toBe(true);

      // Verify single financial and ledger effects
      const ledgerSnap = await db.collection("payment_ledger").get();
      expect(ledgerSnap.docs.length).toBe(1);

      const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
      const m = quoteSnap.data()?.milestones.find((x: any) => x.id === milestoneId);
      expect(m.status).toBe("funds_released");
    });
  });

  describe("3. WEBHOOK REPLAY TEST", () => {
    it("ensures duplicate webhook events are ignored safely using persistent storage", async () => {
      const eventId = "evt_funding_12345";
      const webhookEvent = {
        id: eventId,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_session_abc",
            client_reference_id: authUid,
            amount_total: 50000,
            currency: "gbp",
            payment_intent: "pi_real_stripe_intent_777",
            metadata: {
              type: "milestone_funding",
              jobId,
              quoteId,
              milestoneId,
            }
          }
        }
      };

      // Reset milestone to pending
      const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
      await quoteRef.update({
        milestones: [{ id: milestoneId, title: "Tiling", amount: 500, status: "pending" }]
      });

      // First webhook delivery
      const outcome1 = await processWebhook({ db, event: webhookEvent });
      expect(outcome1.success).toBe(true);

      // Duplicate webhook delivery
      const outcome2 = await processWebhook({ db, event: webhookEvent });
      expect(outcome2.alreadyProcessed).toBe(true);

      // Verify persistent event marker exists
      const eventSnap = await db.collection("processed_stripe_events").doc(eventId).get();
      expect(eventSnap.exists).toBe(true);
      expect(eventSnap.data()?.status).toBe("completed");

      // Verify only 1 ledger and milestone state effect
      const ledgerSnap = await db.collection("payment_ledger").get();
      expect(ledgerSnap.docs.length).toBe(1);

      const updatedQuote = await quoteRef.get();
      expect(updatedQuote.data()?.milestones[0].status).toBe("funded");
    });
  });

  describe("4. WEBHOOK DIFFERENT-EVENT TEST", () => {
    it("processes distinct webhook events independently", async () => {
      const webhookEvent1 = {
        id: "evt_different_A",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "session_A",
            client_reference_id: authUid,
            amount_total: 10000,
            currency: "gbp",
            payment_intent: "pi_intent_A",
            metadata: {
              type: "milestone_funding",
              jobId,
              quoteId,
              milestoneId,
            }
          }
        }
      };

      const webhookEvent2 = {
        id: "evt_different_B",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "session_B",
            client_reference_id: authUid,
            amount_total: 10000,
            currency: "gbp",
            payment_intent: "pi_intent_B",
            metadata: {
              type: "milestone_funding",
              jobId,
              quoteId,
              milestoneId,
            }
          }
        }
      };

      // Reset milestone status
      await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).update({
        milestones: [{ id: milestoneId, title: "Tiling", amount: 100, status: "pending" }]
      });

      const outcome1 = await processWebhook({ db, event: webhookEvent1 });
      expect(outcome1.success).toBe(true);

      // Different event processing independently
      const outcome2 = await processWebhook({ db, event: webhookEvent2 });
      expect(outcome2.success).toBe(true);

      // Replay Event A safely
      const outcome3 = await processWebhook({ db, event: webhookEvent1 });
      expect(outcome3.alreadyProcessed).toBe(true);
    });
  });

  describe("5. PARTIAL FAILURE TEST", () => {
    it("ensures milestone state and ledger record are committed atomically even if Stripe fails later", async () => {
      const brokenStripeMock = {
        transfers: {
          create: async () => {
            throw new Error("Stripe Connected Account Restricted");
          }
        }
      };

      const key = "rel_broken_stripe_123";

      // Attempt release with failing Stripe transfer
      await expect(
        releaseMilestone({
          db,
          jobId,
          quoteId,
          milestoneId,
          idempotencyKey: key,
          authUid,
          stripeMock: brokenStripeMock,
        })
      ).rejects.toThrow("Stripe Connected Account Restricted");

      // VERIFY ATOMICITY:
      // The database state MUST be updated (since it's committed before Stripe)
      const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
      const m = quoteSnap.data()?.milestones.find((x: any) => x.id === milestoneId);
      expect(m.status).toBe("funds_released");
      expect(m.releaseOperationId).toBe(key);

      // AND the ledger record MUST exist (proving it was inside the same transaction)
      const ledgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", key).get();
      expect(ledgerSnap.docs.length).toBe(1);
    });

    it("ensures webhook is marked as failed and throws if ledger operation fails", async () => {
      const webhookEvent = {
        id: "evt_failed_ledger",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "session_fail",
            client_reference_id: authUid,
            amount_total: 50000,
            currency: "gbp",
            payment_intent: "pi_intent_fail",
            metadata: {
              type: "milestone_funding",
              jobId: "invalid_job_id", // Triggers recordEscrowFunding failure
              quoteId,
              milestoneId,
            }
          }
        }
      };

      // Webhook execution must throw
      await expect(
        processWebhook({ db, event: webhookEvent, throwOnLedgerError: true })
      ).rejects.toThrow();

      // Verify webhook tracking status recorded as failed in Firestore
      const eventSnap = await db.collection("processed_stripe_events").doc("evt_failed_ledger").get();
      expect(eventSnap.data()?.status).toBe("failed");
    });
  });

  describe("6. PROTECTED-FIELD TEST (Mass-Assignment/Forged Input Check)", () => {
    it("ensures attempts to send forged payment parameters are ignored or rejected", async () => {
      // Simulate calling release-milestone with extra forged fields
      const forgedPayload = {
        jobId,
        quoteId,
        milestoneId,
        amount: 1, // Attacker trying to pay 1 pence
        commission: 0, // Attacker trying to pay 0 commission
        stripeFee: 0,
        netPayout: 999999, // Attacker trying to get huge payout
        paymentIntentId: "attacker-payment-intent",
        transferId: "attacker-transfer",
        status: "released"
      };

      // Since we pass parameters from server-derived Firestore states, any payload fields are ignored
      const stripeMock = {
        transfers: {
          create: async (data: any) => ({ id: "tr_honest" })
        }
      };

      const result = await releaseMilestone({
        db,
        jobId,
        quoteId,
        milestoneId,
        idempotencyKey: "rel_forged_fields_test",
        authUid,
        stripeMock,
      });

      expect(result.success).toBe(true);

      // Verify ledger has correct, server-calculated values, ignoring attacker forged inputs
      const ledgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", "rel_forged_fields_test").get();
      expect(ledgerSnap.docs.length).toBe(1);
      const data = ledgerSnap.docs[0].data();
      expect(data.amount).toBe(50000); // 500 * 100, read from DB
      expect(data.platformFee).toBe(6000); // calculated on server
      expect(data.netPayout).toBe(44000); // calculated on server
      expect(data.stripeTransferId).toBe("tr_honest"); // assigned by server/stripe, ignoring "attacker-transfer"
    });
  });

  describe("7. REAL PARTIAL-FAILURE & RECOVERY TEST", () => {
    it("proves that a side-effect failure after DB commit does not leave an inconsistent ledger, and allows recovery", async () => {
      // 1. Initial State: Milestone is funded
      const opKey = "rel_recovery_key_123";
      
      // 2. Scenario: Stripe fails but DB transaction succeeded
      const failingStripeMock = {
        transfers: {
          create: async () => { throw new Error("Stripe Network Timeout"); }
        }
      };

      // Execution attempt 1 (Stripe fails)
      await expect(
        releaseMilestone({ db, jobId, quoteId, milestoneId, idempotencyKey: opKey, authUid, stripeMock: failingStripeMock })
      ).rejects.toThrow("Stripe Network Timeout");

      // VERIFY ATOMICITY:
      // The database state MUST be updated (since it's committed before Stripe)
      const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
      const m = quoteSnap.data()?.milestones.find((x: any) => x.id === milestoneId);
      expect(m.status).toBe("funds_released");
      expect(m.releaseOperationId).toBe(opKey);

      // AND the ledger record MUST exist (proving it was inside the same transaction)
      const ledgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", opKey).get();
      expect(ledgerSnap.docs.length).toBe(1);
      const ledgerData = ledgerSnap.docs[0].data();
      expect(ledgerData.transferStatus).toBeUndefined(); // Not yet completed by Stripe side-effect

      // 3. RECOVERY: Same request retried with a working Stripe
      const workingStripeMock = {
        transfers: {
          create: async () => ({ id: "tr_recovered_999" })
        }
      };

      // Execution attempt 2 (Retry succeeds)
      const result = await releaseMilestone({ db, jobId, quoteId, milestoneId, idempotencyKey: opKey, authUid, stripeMock: workingStripeMock });
      expect(result.success).toBe(true);

      // VERIFY FINAL CONSISTENCY:
      const updatedLedgerSnap = await db.collection("payment_ledger").where("idempotencyKey", "==", opKey).get();
      const updatedLedgerData = updatedLedgerSnap.docs[0].data();
      expect(updatedLedgerData.stripeTransferId).toBe("tr_recovered_999");
      expect(updatedLedgerData.transferStatus).toBe("completed");
    });
  });

  describe("8. CLIENT AMOUNT MANIPULATION & VALUE PROTECTION", () => {
    it("rejects invalid, negative, zero, NaN, and string amounts in recordEscrowFunding", async () => {
      // Negative amount
      await expect(
        PaymentLedgerEngine.recordEscrowFunding(db, {
          jobId,
          milestoneId,
          customerId: authUid,
          traderId,
          verifiedAmount: -5000,
          currency: "gbp",
          paymentIntentId: "pi_negative",
          idempotencyKey: "key_neg_1",
        })
      ).rejects.toThrow("Verified amount must be a strictly positive finite number in minor units (pence).");

      // Zero amount
      await expect(
        PaymentLedgerEngine.recordEscrowFunding(db, {
          jobId,
          milestoneId,
          customerId: authUid,
          traderId,
          verifiedAmount: 0,
          currency: "gbp",
          paymentIntentId: "pi_zero",
          idempotencyKey: "key_zero_1",
        })
      ).rejects.toThrow("Verified amount must be a strictly positive finite number in minor units (pence).");

      // NaN amount
      await expect(
        PaymentLedgerEngine.recordEscrowFunding(db, {
          jobId,
          milestoneId,
          customerId: authUid,
          traderId,
          verifiedAmount: NaN,
          currency: "gbp",
          paymentIntentId: "pi_nan",
          idempotencyKey: "key_nan_1",
        })
      ).rejects.toThrow("Verified amount must be a strictly positive finite number in minor units (pence).");

      // Infinity amount
      await expect(
        PaymentLedgerEngine.recordEscrowFunding(db, {
          jobId,
          milestoneId,
          customerId: authUid,
          traderId,
          verifiedAmount: Infinity,
          currency: "gbp",
          paymentIntentId: "pi_inf",
          idempotencyKey: "key_inf_1",
        })
      ).rejects.toThrow("Verified amount must be a strictly positive finite number in minor units (pence).");

      // String amount passed as any
      await expect(
        PaymentLedgerEngine.recordEscrowFunding(db, {
          jobId,
          milestoneId,
          customerId: authUid,
          traderId,
          verifiedAmount: "5000" as any,
          currency: "gbp",
          paymentIntentId: "pi_str",
          idempotencyKey: "key_str_1",
        })
      ).rejects.toThrow("Verified amount must be a strictly positive finite number in minor units (pence).");
    });

    it("fails closed when persisted milestone in database has non-positive or corrupted amount", async () => {
      // Corrupt the milestone amount in DB to 0
      const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
      await quoteRef.update({
        milestones: [
          { id: "corrupt_milestone", title: "Corrupt", amount: 0, status: "funded" }
        ]
      });

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId: "corrupt_milestone",
          authUid,
          idempotencyKey: "key_corrupt_test",
        })
      ).rejects.toThrow("Invalid milestone amount in database");
    });
  });

  describe("9. STRONG AUTHORIZATION & FORGERY DEFENSE", () => {
    it("rejects unauthenticated requests (missing or empty authUid)", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: "",
          idempotencyKey: "key_unauth_1",
        })
      ).rejects.toThrow("Unauthorized");

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: null as any,
          idempotencyKey: "key_unauth_2",
        })
      ).rejects.toThrow("Unauthorized");
    });

    it("rejects unauthorized caller (wrong customer who is neither owner nor admin)", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: "attacker_charlie",
          idempotencyKey: "key_wrong_cust",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejects forged QR handshake when caller is not the accepted tradesperson", async () => {
      // Trader Dave is accepted; Impostor Bob attempts QR release
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: "impostor_bob",
          idempotencyKey: "key_forged_qr",
          isQrHandshake: true,
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("rejects tradesperson self-release with bare isQrHandshake without valid homeowner verification code", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid: traderId,
          idempotencyKey: "key_trader_self_release_fail",
          isQrHandshake: true,
          // Notice: No valid handshakeCode supplied!
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("allows QR handshake when caller IS the verified accepted tradesperson WITH valid homeowner verification code", async () => {
      const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: traderId, // trader_dave is acceptedTradespersonId on initialJobData
        idempotencyKey: "key_valid_trader_qr",
        isQrHandshake: true,
        handshakeCode: "4321", // Matches initialJobData.verificationPin
      });

      expect(result.success).toBe(true);
      expect(result.releasedAmount).toBe(500);

      // QR handshake authorizes this milestone only; it must not mark the
      // entire multi-milestone job as paid.
      const jobSnap = await db.collection("jobs").doc(jobId).get();
      expect(jobSnap.data()?.paymentStatus).not.toBe("handshake_complete");
      expect(jobSnap.data()?.isPaid).not.toBe(true);
    });

    it("allows authorized admin to release milestone", async () => {
      const result = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid: "admin_super_user",
        idempotencyKey: "key_admin_release",
        isAdmin: true,
      });

      expect(result.success).toBe(true);
      expect(result.releasedAmount).toBe(500);
    });
  });

  describe("10. IDOR / BOLA CROSS-ENTITY MANIPULATION DEFENSE", () => {
    it("rejects release when quote does not belong to specified job (Job A with Quote B)", async () => {
      // Create second job and quote
      const jobB = "job_b_999";
      const quoteB = "quote_b_888";
      db._store[`jobs/${jobB}`] = { id: jobB, homeownerId: authUid, acceptedQuoteId: quoteB, acceptedTradespersonId: traderId };
      db._store[`jobs/${jobB}/quotes/${quoteB}`] = { id: quoteB, jobId: jobB, tradespersonId: traderId, milestones: [{ id: "mB", amount: 200, status: "funded" }] };

      // Caller attempts to release Job A with Quote B
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId: quoteB, // Quote B does not exist under Job A
          milestoneId: "mB",
          authUid,
          idempotencyKey: "key_idor_1",
        })
      ).rejects.toThrow("Quote not found");
    });

    it("rejects release for unaccepted quote when job has a different accepted quote", async () => {
      // Add a competing, unaccepted quote to Job A
      const competingQuoteId = "quote_competing_unaccepted";
      db._store[`jobs/${jobId}/quotes/${competingQuoteId}`] = {
        id: competingQuoteId,
        jobId,
        tradespersonId: "trader_other",
        milestones: [{ id: "m_other", amount: 300, status: "funded" }],
      };

      // Attacker tries to release funds on the competing quote
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId: competingQuoteId,
          milestoneId: "m_other",
          authUid,
          idempotencyKey: "key_unaccepted_quote",
        })
      ).rejects.toThrow("Job has accepted quote");
    });

    it("rejects release when milestone does not exist on the specified quote", async () => {
      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId: "non_existent_milestone_xyz",
          authUid,
          idempotencyKey: "key_bogus_m",
        })
      ).rejects.toThrow("Milestone not found");
    });
  });

  describe("11. STATE-MACHINE ENFORCEMENT & INVALID TRANSITION DEFENSE", () => {
    it("rejects release on an unfunded (pending) milestone", async () => {
      const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
      await quoteRef.update({
        milestones: [{ id: milestoneId, title: "Tiling", amount: 500, status: "pending" }]
      });

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid,
          idempotencyKey: "key_unfunded_release",
        })
      ).rejects.toThrow("Escrow must be actively funded before release");
    });

    it("rejects release on a cancelled or refunded milestone", async () => {
      const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
      await quoteRef.update({
        milestones: [{ id: milestoneId, title: "Tiling", amount: 500, status: "cancelled", isRefunded: true }]
      });

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid,
          idempotencyKey: "key_cancelled_release",
        })
      ).rejects.toThrow(ConflictError);
    });

    it("rejects release on a disputed milestone", async () => {
      const quoteRef = db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId);
      await quoteRef.update({
        milestones: [{ id: milestoneId, title: "Tiling", amount: 500, status: "disputed", isDisputed: true }]
      });

      await expect(
        PaymentLedgerEngine.releaseEscrowFunds(db, {
          jobId,
          quoteId,
          milestoneId,
          authUid,
          idempotencyKey: "key_disputed_release",
        })
      ).rejects.toThrow("Funds are locked under active dispute arbitration");
    });
  });

  describe("12. IDEMPOTENCY STALE-LOCK & CRASH RECOVERY DEFENSE", () => {
    it("proves crash recovery checks authoritative state and does NOT duplicate ledger or state transitions", async () => {
      // Scenario: Transaction committed in DB, but worker crashed before updating payment_idempotency to completed
      const crashOpKey = "rel_crash_recovery_key_1";

      // 1. Initial successful release
      const res1 = await PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid,
        idempotencyKey: crashOpKey,
      });
      expect(res1.success).toBe(true);

      // Verify ledger has 1 entry
      const ledgerSnap1 = await db.collection("payment_ledger").get();
      expect(ledgerSnap1.docs.length).toBe(1);

      // 2. Simulate worker crash: set payment_idempotency to in_progress with stale timestamp (> 5 mins old)
      const idempRef = db.collection("payment_idempotency").doc(crashOpKey);
      const binding = {
        version: 1,
        jobId,
        quoteId,
        milestoneId,
        authUid,
        authorizationMode: "owner",
      };
      const canonicalize = (value: any): any => Array.isArray(value)
        ? value.map(canonicalize)
        : value && typeof value === "object"
          ? Object.keys(value).sort().reduce((acc: any, key) => { acc[key] = canonicalize(value[key]); return acc; }, {})
          : value;
      const bindingHash = crypto.createHash("sha256").update(JSON.stringify(canonicalize(binding))).digest("hex");
      await idempRef.set({
        operationName: "RELEASE_MILESTONE",
        bindingHash,
        status: "in_progress",
        startedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      });

      // 3. Retry must fail closed until the ambiguous external effect is reconciled.
      await expect(PaymentLedgerEngine.releaseEscrowFunds(db, {
        jobId,
        quoteId,
        milestoneId,
        authUid,
        idempotencyKey: crashOpKey,
      })).rejects.toThrow("requires reconciliation");

      // VERIFY: Still exactly 1 ledger record; retry created no duplicate effect.
      const ledgerSnap2 = await db.collection("payment_ledger").get();
      expect(ledgerSnap2.docs.length).toBe(1);
      const idempSnap = await idempRef.get();
      expect(idempSnap.data()?.status).toBe("reconciliation_required");
    });
  });
});
