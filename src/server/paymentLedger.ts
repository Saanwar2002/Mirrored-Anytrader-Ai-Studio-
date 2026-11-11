/**
 * Financial Double-Entry Ledger & Idempotency Engine for AnyTrader V6
 * Enforces core invariants:
 * 1. "NO CLIENT-CONTROLLED VALUE MAY CAUSE ANYTRADER TO ACCEPT A PAYMENT AS VALID WITHOUT SERVER-SIDE VERIFICATION."
 * 2. "ONE FINANCIAL ACTION -> ONE FINANCIAL EFFECT."
 * 3. Atomic idempotency locks preventing duplicate releases, double payouts, and race conditions.
 */
import { BadRequestError, ConflictError, InternalServerError, ForbiddenError } from "./httpErrors.ts";
import { validatePaymentTransition, validateMilestoneTransition } from "./stateMachine.ts";
import { domainEvents } from "./domainEvents.ts";
import { BusinessLogicDefense } from "./businessLogicDefense.ts";
import crypto from "crypto";

export interface LedgerEntry {
  entryId: string;
  transactionId: string;
  idempotencyKey: string;
  jobId?: string;
  quoteId?: string;
  milestoneId?: string;
  payerId: string;
  payeeId: string;
  amount: number; // in minor units (pence / cents)
  platformFee: number;
  netPayout: number;
  currency: string;
  type: "ESCROW_DEPOSIT" | "ESCROW_RELEASE" | "PLATFORM_COMMISSION" | "REFUND" | "RIDE_PAYMENT";
  status: "pending" | "completed" | "reversed";
  createdAt: string;
}

export class PaymentLedgerEngine {
  /**
   * Idempotency Guard:
   * Checks if an idempotency key has already been executed.
   * If yes, returns the existing result to avoid duplicate execution.
   */
  public static async executeIdempotentOperation<T>(
    db: any,
    idempotencyKey: string,
    operationName: string,
    semanticBinding: Record<string, unknown>,
    executor: () => Promise<T>
  ): Promise<{ result: T; wasReplayed: boolean }> {
    if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
      throw new BadRequestError("A valid, non-empty idempotencyKey is required for financial operations.");
    }
    // Idempotency keys may originate in request headers or bodies. Keep them
    // as single Firestore document IDs; never let a slash create a nested path.
    if (idempotencyKey.includes("/") || idempotencyKey.length > 200) {
      throw new BadRequestError("Idempotency key must be at most 200 characters and cannot contain '/'.");
    }
    if (!semanticBinding || typeof semanticBinding !== "object" || Array.isArray(semanticBinding)) {
      throw new BadRequestError("A semantic binding is required for financial idempotency.");
    }
    const canonicalize = (value: any): any => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (value && typeof value === "object") {
        return Object.keys(value).sort().reduce((result: any, key) => {
          result[key] = canonicalize(value[key]);
          return result;
        }, {});
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new BadRequestError("Semantic binding contains a non-finite number.");
      }
      if (typeof value === "undefined" || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
        throw new BadRequestError("Semantic binding contains an unsupported value.");
      }
      return value;
    };
    const bindingJson = JSON.stringify(canonicalize(semanticBinding));
    if (!bindingJson) throw new BadRequestError("Semantic binding could not be serialized.");
    const bindingHash = crypto.createHash("sha256").update(bindingJson).digest("hex");

    if (!db) {
      // In development fallback without db, run executor directly
      const result = await executor();
      return { result, wasReplayed: false };
    }

    const idempotencyRef = db.collection("payment_idempotency").doc(idempotencyKey);
    
    // A unique generation fences stale executors after lease takeover.
    const claimToken = crypto.randomUUID();
    const claimResult = await db.runTransaction(async (transaction: any) => {
      const doc = await transaction.get(idempotencyRef);
      if (doc.exists) {
        const data = doc.data();
        if (data.operationName !== operationName) {
          throw new ConflictError("Idempotency key is already bound to a different financial operation.");
        }
        if (typeof data.bindingHash !== "string" || data.bindingHash !== bindingHash) {
          throw new ConflictError("Idempotency key is already bound to different transaction details or requires reconciliation.");
        }
        if (data.status === "completed") {
          return { shouldExecute: false, result: data.response as T, wasReplayed: true };
        }
        // Reconciliation-required is a durable stop state. Never let a later
        // retry silently replace it with a fresh claim and repeat a possible
        // external financial effect.
        if (data.status === "reconciliation_required") {
          throw new ConflictError("Financial operation requires reconciliation; automatic replay remains blocked.");
        }
        if (data.status !== "in_progress") {
          throw new ConflictError("Existing financial operation has an unknown state and requires reconciliation.");
        }
        if (data.status === "in_progress") {
          const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : Date.now();
          const ageMs = Date.now() - startedAt;
          if (ageMs < 5 * 60 * 1000) {
            throw new ConflictError("A concurrent request with the same idempotency key is already processing.");
          }
          // Timeout is not proof an external financial effect did not happen.
          // Persist reconciliation state and never replace the claim automatically.
          transaction.update(idempotencyRef, {
            status: "reconciliation_required",
            reconciliationRequiredAt: new Date().toISOString(),
            reconciliationReason: "Expired in-progress claim may have completed an external effect",
          });
          return { shouldExecute: false, reconciliationRequired: true };
        }
      }
      transaction.set(idempotencyRef, {
        operationName, bindingHash, status: "in_progress", startedAt: new Date().toISOString(), claimToken,
      });
      return { shouldExecute: true };
    });

    if (claimResult.reconciliationRequired) {
      throw new ConflictError("Expired financial operation requires reconciliation; automatic replay is blocked.");
    }
    if (!claimResult.shouldExecute) {
      return { result: claimResult.result as T, wasReplayed: true };
    }

    try {
      const result = await executor();
      const sanitizedResponse = result !== undefined ? JSON.parse(JSON.stringify(result)) : null;
      // Completion is fenced: an expired executor cannot complete a successor's claim.
      await db.runTransaction(async (transaction: any) => {
        const fresh = await transaction.get(idempotencyRef);
        if (!fresh.exists || fresh.data()?.claimToken !== claimToken || fresh.data()?.operationName !== operationName) {
          throw new ConflictError("Idempotency claim was superseded; executor result requires reconciliation.");
        }
        transaction.update(idempotencyRef, {
          status: "completed", completedAt: new Date().toISOString(), response: sanitizedResponse,
        });
      });
      return { result, wasReplayed: false };
    } catch (err) {
      // Only the current generation may release/fail its own lock.
      try {
        await db.runTransaction(async (transaction: any) => {
          const fresh = await transaction.get(idempotencyRef);
          if (fresh.exists && fresh.data()?.claimToken === claimToken) {
            transaction.delete(idempotencyRef);
          }
        });
      } catch (cleanupErr: any) {
        console.error("Failed to conditionally release idempotency claim:", cleanupErr);
      }
      throw err;
    }
  }

  /**
   * Record Escrow Funding:
   * Called strictly upon verified server-side Stripe webhook or payment intent confirmation.
   * Client-supplied price/amount is strictly rejected; amount must match the verified Stripe event.
   */
  public static async recordEscrowFunding(
    db: any,
    params: {
      jobId: string;
      milestoneId: string;
      customerId: string;
      traderId: string;
      verifiedAmount: number; // in pence
      currency: string;
      paymentIntentId: string;
      idempotencyKey: string;
    }
  ): Promise<LedgerEntry> {
    const { jobId, milestoneId, customerId, traderId, verifiedAmount, currency, paymentIntentId, idempotencyKey } = params;

    if (typeof verifiedAmount !== "number" || !Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
      throw new BadRequestError("Verified amount must be a strictly positive finite number in minor units (pence).");
    }

    const { result } = await this.executeIdempotentOperation(db, idempotencyKey, "FUND_MILESTONE_ESCROW", {
      version: 1, jobId, milestoneId, customerId, traderId,
      verifiedAmount, currency: currency.toLowerCase(), paymentIntentId,
    }, async () => {
      const platformFee = Math.round(verifiedAmount * 0.12); // Standard 12% platform fee
      const netPayout = verifiedAmount - platformFee;

      const entryHash = crypto.createHash("sha256").update(`${idempotencyKey}:${paymentIntentId}`).digest("hex").substring(0, 16);
      const entryId = `ledg_fund_${entryHash}`;
      const ledgerEntry: LedgerEntry = {
        entryId,
        transactionId: paymentIntentId,
        idempotencyKey,
        payerId: customerId,
        payeeId: traderId,
        amount: verifiedAmount,
        platformFee,
        netPayout,
        currency: currency.toLowerCase(),
        type: "ESCROW_DEPOSIT",
        status: "completed",
        createdAt: new Date().toISOString(),
      };

      if (db) {
        const milestoneRef = db.collection("jobs").doc(jobId).collection("milestones").doc(milestoneId);
        const milestoneDoc = await milestoneRef.get();
        if (milestoneDoc.exists) {
          const currentStatus = milestoneDoc.data()?.status || "pending";
          validateMilestoneTransition(currentStatus, "funded");
          await milestoneRef.update({
            status: "funded",
            fundedAt: new Date().toISOString(),
            escrowEntryId: entryId,
            verifiedAmount,
            platformFee,
            netPayout,
          });
        }

        await db.collection("payment_ledger").doc(entryId).set(ledgerEntry);
      }

      await domainEvents.dispatch("MILESTONE_FUNDED", milestoneId, customerId, {
        jobId,
        amount: verifiedAmount,
        currency,
      }, idempotencyKey, db);

      return ledgerEntry;
    });

    return result;
  }

  /**
   * Record Escrow Release to Tradesperson:
   * Single canonical authority for milestone fund release.
   * Transactionally protects Job, Quote, and Milestone state.
   */
  /**
   * Durable per-job/per-user QR PIN throttle. Failed attempts commit in their
   * own transaction before rejection, so the counter survives thrown errors.
   */
  public static async validateAndRecordQrHandshakeAttempt(
    db: any,
    params: { jobId: string; authUid: string; handshakeCode?: string }
  ): Promise<void> {
    const { jobId, authUid, handshakeCode } = params;
    if (!db || !jobId || !authUid) throw new BadRequestError("Job and authenticated user are required");
    const jobRef = db.collection("jobs").doc(jobId);
    const attemptRef = jobRef.collection("handshake_attempts").doc(authUid);
    const now = Date.now();
    const outcome = await db.runTransaction(async (tx: any) => {
      const [jobSnap, attemptSnap] = await Promise.all([tx.get(jobRef), tx.get(attemptRef)]);
      if (!jobSnap.exists) return "invalid";
      const job = jobSnap.data() || {};
      const attempt = attemptSnap.exists ? attemptSnap.data() || {} : {};
      if (Number(attempt.lockedUntilMs || 0) > now) return "locked";
      const acceptedTrader = [job.acceptedTradespersonId, job.acceptedTraderId, job.tradespersonId]
        .some((id) => typeof id === "string" && id === authUid);
      const expected = String(job.handshakeCode || job.verificationPin || "").trim();
      const supplied = String(handshakeCode || "").trim();
      if (acceptedTrader && expected !== "" && supplied !== "" && expected === supplied) {
        tx.set(attemptRef, { attempts: 0, windowStartedAtMs: now, lockedUntilMs: 0, lastSuccessAtMs: now });
        return "valid";
      }
      const windowStarted = Number(attempt.windowStartedAtMs || 0);
      const activeWindow = windowStarted > 0 && now - windowStarted < 15 * 60 * 1000;
      const attempts = (activeWindow ? Number(attempt.attempts || 0) : 0) + 1;
      const locked = attempts >= 5;
      tx.set(attemptRef, {
        attempts,
        windowStartedAtMs: activeWindow ? windowStarted : now,
        lockedUntilMs: locked ? now + 15 * 60 * 1000 : 0,
        lastFailedAtMs: now,
      });
      return locked ? "locked" : "invalid";
    });
    if (outcome !== "valid") {
      throw new ForbiddenError(outcome === "locked"
        ? "QR verification is temporarily locked. Please wait 15 minutes or contact support."
        : "Invalid QR handshake code.");
    }
  }

  public static async releaseEscrowFunds(
    db: any,
    params: {
      jobId: string;
      quoteId: string;
      milestoneId: string;
      authUid: string;
      idempotencyKey: string;
      isQrHandshake?: boolean;
      handshakeCode?: string;
      isAdmin?: boolean;
    }
  ): Promise<any> {
    const { jobId, quoteId, milestoneId, authUid, idempotencyKey, isQrHandshake, handshakeCode, isAdmin } = params;

    if (!authUid || typeof authUid !== "string" || authUid.trim() === "") {
      throw new ForbiddenError("Unauthorized: authentic caller identity required");
    }

    if (!jobId || typeof jobId !== "string" || !quoteId || typeof quoteId !== "string") {
      throw new BadRequestError("jobId and quoteId must be valid strings");
    }
    if (!db) {
      throw new InternalServerError("Database is required for financial escrow release.");
    }

    // Revalidate current authorization before idempotency replay can return a cached
    // result. The transaction below repeats these checks against its own snapshot
    // before any new release transition is committed.
    const authorizationJobSnap = await db.collection("jobs").doc(jobId).get();
    if (!authorizationJobSnap.exists) throw new BadRequestError("Job not found");
    const authorizationJob = authorizationJobSnap.data();
    const currentlyOwner = Boolean(
      (authorizationJob?.homeownerId && authorizationJob.homeownerId === authUid) ||
      (authorizationJob?.userId && authorizationJob.userId === authUid) ||
      (authorizationJob?.customerId && authorizationJob.customerId === authUid)
    );
    const currentlyAcceptedTrader = Boolean(
      (authorizationJob?.acceptedTradespersonId && authorizationJob.acceptedTradespersonId === authUid) ||
      (authorizationJob?.acceptedTraderId && authorizationJob.acceptedTraderId === authUid) ||
      (authorizationJob?.tradespersonId && authorizationJob.tradespersonId === authUid)
    );
    const expectedHandshakeCode = (authorizationJob?.handshakeCode || authorizationJob?.verificationPin || "").toString().trim();
    const suppliedHandshakeCode = (handshakeCode || "").toString().trim();
    const currentlyValidHandshake = Boolean(
      currentlyAcceptedTrader && isQrHandshake && expectedHandshakeCode !== "" &&
      suppliedHandshakeCode !== "" && expectedHandshakeCode === suppliedHandshakeCode
    );
    if (!currentlyOwner && !isAdmin && !currentlyValidHandshake) {
      throw new ForbiddenError("Unauthorized: current caller is not permitted to release milestone funds");
    }

    const { result } = await this.executeIdempotentOperation(db, idempotencyKey, "RELEASE_MILESTONE", {
      version: 1, jobId, quoteId, milestoneId: milestoneId || null, authUid,
      authorizationMode: isAdmin ? "admin" : isQrHandshake ? "qr_handshake" : "owner",
    }, async () => {
      if (!db) {
        throw new InternalServerError("Database is required for financial escrow release.");
      }

      // Execute everything inside a single Firestore transaction for atomic safety
      const transactionResult = await db.runTransaction(async (transaction: any) => {
        const jobRef = db.collection("jobs").doc(jobId);
        const jobDoc = await transaction.get(jobRef);
        if (!jobDoc.exists) throw new BadRequestError("Job not found");

        const jobData = jobDoc.data();
        const isOwner = Boolean(
          authUid && (
            (jobData?.homeownerId && jobData.homeownerId === authUid) ||
            (jobData?.userId && jobData.userId === authUid) ||
            (jobData?.customerId && jobData.customerId === authUid)
          )
        );
        const isAcceptedTrader = Boolean(
          authUid && (
            (jobData?.acceptedTradespersonId && jobData.acceptedTradespersonId === authUid) ||
            (jobData?.acceptedTraderId && jobData.acceptedTraderId === authUid) ||
            (jobData?.tradespersonId && jobData.tradespersonId === authUid)
          )
        );

        // Curing Escrow Self-Release:
        // Under no circumstances can a tradesperson self-release escrow funds simply by passing isQrHandshake: true!
        // An accepted tradesperson can only release if they supply the homeowner's secret handshake code / PIN.
        let hasValidHandshakeAuth = false;
        if (isAcceptedTrader && isQrHandshake) {
          const expectedCode = (jobData?.handshakeCode || jobData?.verificationPin || "").toString().trim();
          const suppliedCode = (handshakeCode || "").toString().trim();
          if (expectedCode !== "" && suppliedCode !== "" && expectedCode === suppliedCode) {
            hasValidHandshakeAuth = true;
          }
        }

        if (!isOwner && !isAdmin && !hasValidHandshakeAuth) {
          throw new ForbiddenError("Unauthorized: only the job owner or authorized admin can release milestone funds");
        }

        const quoteRef = jobRef.collection("quotes").doc(quoteId);
        const quoteDoc = await transaction.get(quoteRef);
        if (!quoteDoc.exists) throw new BadRequestError("Quote not found");

        const quoteData = quoteDoc.data();

        // Canonical IDOR / BOLA validation:
        if (quoteData?.jobId && quoteData.jobId !== jobId) {
          throw new BadRequestError("IDOR rejection: Quote does not belong to the specified job");
        }
        if (jobData?.acceptedQuoteId && jobData.acceptedQuoteId !== quoteId) {
          throw new BadRequestError(`Cannot release funds for quote '${quoteId}': Job has accepted quote '${jobData.acceptedQuoteId}'`);
        }
        if (jobData?.acceptedTradespersonId && quoteData?.tradespersonId && jobData.acceptedTradespersonId !== quoteData.tradespersonId) {
          throw new BadRequestError("IDOR rejection: Quote tradesperson does not match job accepted tradesperson");
        }

        const currentMilestones = quoteData?.milestones || [];
        const targetMilestone = milestoneId
          ? currentMilestones.find((m: any) => m.id === milestoneId)
          : (isQrHandshake ? currentMilestones[0] : null);

        if (!targetMilestone) {
          throw new BadRequestError(`Milestone not found: '${milestoneId || "initial"}' does not exist on quote '${quoteId}'`);
        }

        // Production Pre-Commit Fail-Closed Gate:
        // Prevent committing release to Firestore if tradesperson cannot receive funds via Stripe
        const isProd = process.env.NODE_ENV === "production";
        if (isProd && !targetMilestone.isDestinationCharge) {
          const traderId = quoteData?.tradespersonId || jobData?.acceptedTradespersonId;
          if (!traderId) {
            throw new BadRequestError("Tradesperson ID missing on quote and job");
          }
          const traderRef = db.collection("users").doc(traderId);
          const traderDoc = await transaction.get(traderRef);
          const traderData = traderDoc?.exists
            ? (typeof traderDoc.data === "function" ? traderDoc.data() : traderDoc.data)
            : null;
          const traderStripeAccountId = traderData?.stripeAccountId;
          if (!traderStripeAccountId) {
            throw new BadRequestError("Tradesperson has no connected Stripe payout account");
          }
          if (traderStripeAccountId.startsWith("acct_mock_")) {
            throw new BadRequestError("Mock Stripe account is rejected in production");
          }
        }

        // Transactional Claim Validation
        // If it's already released with the SAME idempotency key, authoritative state confirms this release was already committed!
        if (
          (targetMilestone.status === "released" || targetMilestone.status === "funds_released" || targetMilestone.releasedAt) &&
          targetMilestone.releaseOperationId === idempotencyKey
        ) {
          const releasedAmount = Number(targetMilestone.amount || targetMilestone.verifiedAmount || 0);
          const platformFeePence = Math.round(releasedAmount * 100 * 0.12);
          const netPayoutPence = Math.round(releasedAmount * 100) - platformFeePence;
          const ledgerEntryId = targetMilestone.escrowReleaseLedgerId || `ledg_rel_${crypto.createHash("sha256").update(idempotencyKey).digest("hex").substring(0, 16)}`;
          return {
            jobData,
            quoteData,
            releasedAmount,
            targetMilestoneTitle: targetMilestone.title || "Work Stage",
            platformFeePence,
            netPayoutPence,
            ledgerEntryId,
            targetMilestone,
            wasAlreadyCommitted: true
          };
        }

        if ((targetMilestone.status === "released" || targetMilestone.status === "funds_released" || targetMilestone.releasedAt) && targetMilestone.releaseOperationId !== idempotencyKey) {
          throw new ConflictError("Milestone has already been released by another request");
        }

        if (targetMilestone.releaseOperationId && targetMilestone.releaseOperationId !== idempotencyKey) {
          throw new ConflictError("Milestone release is already being processed by another request");
        }

        // Business Logic sequence check
        BusinessLogicDefense.validateEscrowReleaseEligibility(targetMilestone, jobData as any);

        const releasedAmount = Number(targetMilestone.amount || targetMilestone.verifiedAmount || 0);
        if (typeof releasedAmount !== "number" || !Number.isFinite(releasedAmount) || releasedAmount <= 0) {
          throw new BadRequestError(`Invalid milestone amount in database: '${releasedAmount}'. Must be a positive finite number.`);
        }

        const platformFeePence = Math.round(releasedAmount * 100 * 0.12);
        const netPayoutPence = Math.round(releasedAmount * 100) - platformFeePence;
        const ledgerHash = crypto.createHash("sha256").update(`${idempotencyKey}:${jobId}:${quoteId}:${targetMilestone.id}`).digest("hex").substring(0, 16);
        const ledgerEntryId = `ledg_rel_${ledgerHash}`;

        let targetMilestoneTitle = targetMilestone.title || "Work Stage";

        const updatedMilestones = currentMilestones.map((m: any, idx: number) => {
          if (m.id === targetMilestone.id) {
            // Validation of state jump
            validateMilestoneTransition(m.status || 'funded', 'released');
            targetMilestoneTitle = m.title || "Work Stage";
            return { 
              ...m, 
              status: 'funds_released', 
              releasedAt: new Date().toISOString(), 
              releaseOperationId: idempotencyKey,
              escrowReleaseLedgerId: ledgerEntryId,
            };
          }
          return m;
        });

        const quoteUpdatePayload: any = {
          milestones: updatedMilestones,
          updatedAt: new Date().toISOString()
        };

        if (isQrHandshake) {
          // QR handshake is an authorization method for this milestone only. It is not
          // proof that every milestone (or the whole job) has been paid. Keep the
          // guarantee metadata on the quote, but leave job/quote aggregate payment
          // projections to the canonical settlement reconciler.
          const guaranteeExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
          quoteUpdatePayload.guaranteeExpiresAt = guaranteeExpiry.toISOString();
        }

        transaction.update(quoteRef, quoteUpdatePayload);

        const releaseEntry: LedgerEntry = {
          entryId: ledgerEntryId,
          transactionId: targetMilestone.stripePaymentIntentId || targetMilestone.escrowEntryId || `rel_${jobId}_${quoteId}`,
          idempotencyKey,
          jobId,
          quoteId,
          milestoneId: targetMilestone.id,
          payerId: jobData?.homeownerId || authUid,
          payeeId: quoteData?.tradespersonId || "trader",
          amount: Math.round(releasedAmount * 100),
          platformFee: platformFeePence,
          netPayout: netPayoutPence,
          currency: "gbp",
          type: "ESCROW_RELEASE",
          status: "completed",
          createdAt: new Date().toISOString()
        };

        // Write ledger entry INSIDE the transaction for atomicity
        transaction.set(db.collection("payment_ledger").doc(ledgerEntryId), releaseEntry);

        return {
          jobData,
          quoteData,
          releasedAmount,
          targetMilestoneTitle,
          platformFeePence,
          netPayoutPence,
          ledgerEntryId,
          targetMilestone,
          releaseEntry,
          wasAlreadyCommitted: false
        };
      });

      const {
        jobData,
        quoteData,
        releasedAmount,
        targetMilestoneTitle,
        platformFeePence,
        netPayoutPence,
        ledgerEntryId,
        targetMilestone,
        wasAlreadyCommitted
      } = transactionResult;

      // Dispatch domain event only on initial commit, not on crash recovery re-evaluation
      if (!wasAlreadyCommitted) {
        await domainEvents.dispatch("MILESTONE_RELEASED", milestoneId || targetMilestone?.id || "m0", authUid, {
          jobId,
          quoteId,
          releasedAmount,
          isQrHandshake: Boolean(isQrHandshake)
        }, idempotencyKey, db);
      }

      return {
        success: true,
        jobId,
        quoteId,
        milestoneId,
        releasedAmount,
        netPayoutPence,
        platformFeePence,
        targetMilestoneTitle,
        traderId: quoteData?.tradespersonId,
        stripePaymentIntentId: targetMilestone.stripePaymentIntentId,
        isDestinationCharge: targetMilestone.isDestinationCharge,
        jobNo: jobData?.jobNo,
        ledgerEntryId
      };
    });

    return result;
  }

  /**
   * Production-Path Stripe Escrow Transfer Side Effect:
   * Strictly executed AFTER Firestore transaction commits.
   * Generates deterministic Stripe idempotency key:
   * `release:${jobId}:${quoteId}:${milestoneId || '0'}:${idempotencyKey}`
   * Updates ledger transfer status and records transfer errors without mutating DB transaction history.
   */
  public static async executeStripeEscrowTransfer(
    db: any,
    params: {
      jobId: string;
      quoteId: string;
      milestoneId?: string;
      idempotencyKey: string;
      traderId?: string;
      netPayoutPence: number;
      targetMilestoneTitle?: string;
      jobNo?: string;
      stripePaymentIntentId?: string;
      isDestinationCharge?: boolean;
      ledgerEntryId?: string;
    },
    options?: {
      stripe?: any;
    }
  ): Promise<{
    transferStatus: "completed" | "failed" | "reconciliation_required" | "skipped_destination_charge" | "skipped_mock_account" | "skipped_no_trader" | "skipped_no_stripe";
    stripeTransferId?: string;
    stripeIdempotencyKey: string;
    error?: string;
  }> {
    const {
      jobId,
      quoteId,
      milestoneId,
      idempotencyKey,
      traderId,
      netPayoutPence,
      targetMilestoneTitle = "Work Stage",
      jobNo,
      isDestinationCharge,
      ledgerEntryId,
    } = params;

    const stripeIdempotencyKey = `release:${jobId}:${quoteId}:${milestoneId || "0"}:${idempotencyKey}`;

    if (isDestinationCharge) {
      return {
        transferStatus: "skipped_destination_charge",
        stripeIdempotencyKey,
      };
    }

    if (!traderId) {
      return {
        transferStatus: "skipped_no_trader",
        stripeIdempotencyKey,
      };
    }

    const isProd = process.env.NODE_ENV === "production";
    const stripe = options?.stripe;
    if (!stripe) {
      if (isProd) {
        return {
          transferStatus: "failed",
          error: "Stripe transfer client unconfigured in production",
          stripeIdempotencyKey,
        };
      }
      return {
        transferStatus: "skipped_no_stripe",
        stripeIdempotencyKey,
      };
    }

    try {
      let traderStripeAccountId: string | undefined;
      if (db) {
        const traderDoc = await db.collection("users").doc(traderId).get();
        const traderData = typeof traderDoc.data === "function" ? traderDoc.data() : traderDoc.data;
        traderStripeAccountId = traderData?.stripeAccountId;
      }

      if (!traderStripeAccountId) {
        return {
          transferStatus: "failed",
          error: "Tradesperson has no connected Stripe payout account",
          stripeIdempotencyKey,
        };
      }

      if (traderStripeAccountId.startsWith("acct_mock_")) {
        if (isProd) {
          return {
            transferStatus: "failed",
            error: "Mock Stripe account is rejected in production",
            stripeIdempotencyKey,
          };
        }
        return {
          transferStatus: "skipped_mock_account",
          stripeIdempotencyKey,
        };
      }

      const transfer = await stripe.transfers.create(
        {
          amount: netPayoutPence,
          currency: "gbp",
          destination: traderStripeAccountId,
          description: `Milestone release for Job #${jobNo || jobId} (${targetMilestoneTitle})`,
          metadata: {
            jobId,
            quoteId,
            milestoneId: milestoneId || "m0",
            traderId,
            // Durable lookup identity for read-only Stripe reconciliation after an ambiguous response.
            releaseOperationId: idempotencyKey,
            stripeIdempotencyKey,
            operationType: "ANYTRADER_ESCROW_RELEASE",
          },
        },
        {
          idempotencyKey: stripeIdempotencyKey,
        }
      );

      const stripeTransferId = transfer?.id;
      if (typeof stripeTransferId !== "string" || stripeTransferId.trim().length === 0) {
        // Stripe may have created the transfer even if its response is malformed or
        // incomplete. Never report completion without a durable external transfer ID.
        throw new Error("Stripe returned a transfer response without a valid transfer ID; reconciliation is required.");
      }
      // A syntactically valid ID is not sufficient: verify the returned Stripe object
      // is the exact transfer requested before marking the ledger as paid out.
      const returnedMetadata = transfer?.metadata || {};
      const responseMatchesRequest =
        transfer?.amount === netPayoutPence &&
        String(transfer?.currency || "").toLowerCase() === "gbp" &&
        transfer?.destination === traderStripeAccountId &&
        returnedMetadata.jobId === jobId &&
        returnedMetadata.quoteId === quoteId &&
        returnedMetadata.milestoneId === (milestoneId || "m0") &&
        returnedMetadata.traderId === traderId &&
        returnedMetadata.releaseOperationId === idempotencyKey &&
        returnedMetadata.stripeIdempotencyKey === stripeIdempotencyKey &&
        returnedMetadata.operationType === "ANYTRADER_ESCROW_RELEASE";
      if (!responseMatchesRequest) {
        throw new Error("Stripe transfer response does not match the requested amount, currency, destination, or operation metadata; reconciliation is required.");
      }

      if (db) {
        if (ledgerEntryId) {
          await db.collection("payment_ledger").doc(ledgerEntryId).update({
            stripeTransferId,
            transferStatus: "completed",
            transferCompletedAt: new Date().toISOString(),
          });
        } else {
          const ledgerSnap = await db.collection("payment_ledger")
            .where("idempotencyKey", "==", idempotencyKey).get();
          const matchingEntry = ledgerSnap.docs.find((doc: any) => {
            const entry = doc.data();
            return entry?.type === "ESCROW_RELEASE" && entry.jobId === jobId &&
              entry.quoteId === quoteId && entry.milestoneId === (milestoneId || "m0");
          });
          if (matchingEntry) await matchingEntry.ref.update({
            stripeTransferId, transferStatus: "completed",
            transferCompletedAt: new Date().toISOString(),
          });
        }
      }

      return {
        transferStatus: "completed",
        stripeTransferId,
        stripeIdempotencyKey,
      };
    } catch (stripeErr: any) {
      const errorMessage = stripeErr?.message || String(stripeErr);
      console.error(
        `[Stripe Transfer Error] Milestone release transfer failed for job ${jobId}, quote ${quoteId}:`,
        errorMessage
      );

      if (db) {
        try {
          if (ledgerEntryId) {
            await db.collection("payment_ledger").doc(ledgerEntryId).update({
              transferStatus: "reconciliation_required",
              transferError: errorMessage,
              lastTransferAttemptAt: new Date().toISOString(),
            });
          } else {
            const ledgerSnap = await db.collection("payment_ledger")
              .where("idempotencyKey", "==", idempotencyKey).get();
            const matchingEntry = ledgerSnap.docs.find((doc: any) => {
              const entry = doc.data();
              return entry?.type === "ESCROW_RELEASE" && entry.jobId === jobId &&
                entry.quoteId === quoteId && entry.milestoneId === (milestoneId || "m0");
            });
            if (matchingEntry) await matchingEntry.ref.update({
              transferStatus: "reconciliation_required",
              transferError: errorMessage,
              lastTransferAttemptAt: new Date().toISOString(),
            });
          }
        } catch (dbErr) {
          console.error("Failed to record Stripe transfer failure to ledger:", dbErr);
        }
      }

      return {
        transferStatus: "reconciliation_required",
        error: errorMessage,
        stripeIdempotencyKey,
      };
    }
  }

  /**
   * Generates accurate, non-misleading trader notification payloads for milestone escrow release.
   * Tailors title and messaging strictly to the external Stripe transfer status.
   */
  public static formatReleaseNotification(params: {
    transferStatus: "completed" | "failed" | "reconciliation_required" | "skipped_destination_charge" | "skipped_mock_account" | "skipped_no_trader" | "skipped_no_stripe";
    isQrHandshake?: boolean;
    jobNo?: string;
    targetMilestoneTitle?: string;
  }): { title: string; message: string } {
    const {
      transferStatus,
      isQrHandshake,
      jobNo = "Job",
      targetMilestoneTitle = "Milestone",
    } = params;

    if (transferStatus === "completed" || transferStatus === "skipped_destination_charge") {
      return {
        title: isQrHandshake ? "Work Verified & Funds Released! 🤝" : "Funds Released! 💸",
        message: isQrHandshake
          ? `QR Handshake complete for "${jobNo}". Funds released to your account.`
          : `The homeowner has released funds for milestone: "${targetMilestoneTitle}". Funds transferred to your Stripe account.`,
      };
    }

    if (transferStatus === "reconciliation_required") {
      return {
        title: "Payout Outcome Requires Reconciliation ⚠️",
        message: `Stripe did not confirm the outcome for milestone "${targetMilestoneTitle}". The release is locked to its original operation key pending reconciliation; do not start a new release.`,
      };
    }

    if (transferStatus === "failed") {
      return {
        title: isQrHandshake
          ? "Work Verified (Payout Pending) ⚠️"
          : "Release Recorded (Payout Pending Retry) ⚠️",
        message: isQrHandshake
          ? `QR Handshake verified for "${jobNo}". Payout transfer encountered an issue and will be retried.`
          : `The homeowner approved milestone: "${targetMilestoneTitle}". Escrow release is recorded, but payout transfer is pending retry.`,
      };
    }

    // Non-Stripe / Mock / No-Stripe configured
    return {
      title: isQrHandshake
        ? "Work Verified & Escrow Released 🤝"
        : "Milestone Approved & Escrow Released 📋",
      message: isQrHandshake
        ? `QR Handshake complete for "${jobNo}". Escrow released on platform.`
        : `Milestone "${targetMilestoneTitle}" escrow release recorded on platform.`,
    };
  }
}
