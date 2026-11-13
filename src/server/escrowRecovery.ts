import type Stripe from "stripe";

export interface EscrowRecoveryQuery {
  jobId: string;
  quoteId: string;
  milestoneId: string;
  idempotencyKey: string;
  expectedAmountPence?: number;
  expectedCurrency?: string;
  expectedTraderId?: string;
  expectedDestinationAccount?: string;
}

export type EscrowEvidenceStatus =
  | "RESOLVED_EXACT_MATCH"        // Exactly one matching transfer found with verified parameters
  | "UNRESOLVED_ZERO_MATCH"       // No transfer found matching the idempotency key / metadata
  | "AMBIGUOUS_MULTIPLE_MATCH"    // Multiple transfers found; flagged for manual operator review
  | "LEGACY_INCOMPLETE_METADATA"  // Candidate transfer found but lacks mandatory metadata or idempotency key
  | "RETRIEVAL_ERROR";            // Stripe or database lookup failed; cannot conclude

export interface EscrowRecoveryEvidence {
  status: EscrowEvidenceStatus;
  stripeIdempotencyKey: string;
  candidateTransfersCount: number;
  matchedTransferId?: string;
  matchedTransfer?: {
    id: string;
    amount: number;
    currency: string;
    destination: string;
    created: number;
    metadata: Record<string, string>;
  };
  unresolvedReason?: string;
  requiresManualReview: boolean;
  ledgerUpdated: boolean;
  moneyMovementAttempted: false; // STRICT INVARIANT: Always false
}

export class EscrowRecoveryEngine {
  /**
   * Deterministically constructs the canonical Stripe transfer idempotency key.
   */
  public static buildStripeIdempotencyKey(params: {
    jobId: string;
    quoteId: string;
    milestoneId: string;
    idempotencyKey: string;
  }): string {
    return `release:${params.jobId}:${params.quoteId}:${params.milestoneId || "0"}:${params.idempotencyKey}`;
  }

  /**
   * Performs STRICTLY READ-ONLY escrow transfer evidence discovery.
   * STRICT GUARANTEE: Never modifies Firestore documents, never invokes stripe.transfers.create,
   * never creates replacement transfers, never retries money movements, and returns pure evidence.
   */
  public static async inspectTransferEvidence(
    db: any,
    query: EscrowRecoveryQuery,
    options?: {
      stripe?: {
        transfers: {
          list: (params?: any) => Promise<{ data: Stripe.Transfer[] }>;
          retrieve?: (id: string) => Promise<Stripe.Transfer>;
        };
      };
    }
  ): Promise<EscrowRecoveryEvidence> {
    const {
      jobId,
      quoteId,
      milestoneId,
      idempotencyKey,
      expectedAmountPence,
      expectedCurrency = "gbp",
      expectedTraderId,
      expectedDestinationAccount,
    } = query;

    const stripeIdempotencyKey = this.buildStripeIdempotencyKey({
      jobId,
      quoteId,
      milestoneId,
      idempotencyKey,
    });

    const stripe = options?.stripe;
    if (!stripe) {
      return {
        status: "RETRIEVAL_ERROR",
        stripeIdempotencyKey,
        candidateTransfersCount: 0,
        unresolvedReason: "Stripe client not provided for transfer evidence inspection",
        requiresManualReview: true,
        ledgerUpdated: false,
        moneyMovementAttempted: false,
      };
    }

    try {
      let transfersList: Stripe.Transfer[] = [];
      try {
        const response = await stripe.transfers.list({ limit: 100 });
        transfersList = response?.data || [];
      } catch (stripeErr: any) {
        return {
          status: "RETRIEVAL_ERROR",
          stripeIdempotencyKey,
          candidateTransfersCount: 0,
          unresolvedReason: `Stripe API retrieval error: ${stripeErr?.message || String(stripeErr)}`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      const candidates = transfersList.filter((t) => {
        const meta = t.metadata || {};
        const matchesJob = meta.jobId === jobId;
        const matchesQuote = meta.quoteId === quoteId;
        const matchesMilestone = meta.milestoneId === milestoneId;
        const descMatches = t.description?.includes(jobId);
        return (matchesJob && matchesQuote && matchesMilestone) || descMatches;
      });

      if (candidates.length === 0) {
        return {
          status: "UNRESOLVED_ZERO_MATCH",
          stripeIdempotencyKey,
          candidateTransfersCount: 0,
          unresolvedReason: "No matching Stripe transfer found for the release operation. Transfer remains pending or failed.",
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      if (candidates.length > 1) {
        console.warn(
          `[Escrow Recovery Warning] Ambiguous multiple transfers (${candidates.length}) detected for job ${jobId}, milestone ${milestoneId}. Leaving unresolved.`
        );
        return {
          status: "AMBIGUOUS_MULTIPLE_MATCH",
          stripeIdempotencyKey,
          candidateTransfersCount: candidates.length,
          unresolvedReason: `Multiple matching transfers detected (${candidates.map((c) => c.id).join(", ")}). Automatic resolution forbidden to prevent double-crediting.`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      const candidate = candidates[0];
      const meta = candidate.metadata || {};

      const hasFullMetadata = meta.jobId && meta.quoteId && meta.milestoneId;
      if (!hasFullMetadata) {
        return {
          status: "LEGACY_INCOMPLETE_METADATA",
          stripeIdempotencyKey,
          candidateTransfersCount: 1,
          matchedTransferId: candidate.id,
          unresolvedReason: `Candidate transfer ${candidate.id} lacks complete release metadata (jobId/quoteId/milestoneId). Manual verification required.`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      if (candidate.currency?.toLowerCase() !== expectedCurrency.toLowerCase()) {
        return {
          status: "AMBIGUOUS_MULTIPLE_MATCH",
          stripeIdempotencyKey,
          candidateTransfersCount: 1,
          matchedTransferId: candidate.id,
          unresolvedReason: `Currency mismatch: candidate transfer is ${candidate.currency}, expected ${expectedCurrency}.`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      if (expectedAmountPence !== undefined && candidate.amount !== expectedAmountPence) {
        return {
          status: "AMBIGUOUS_MULTIPLE_MATCH",
          stripeIdempotencyKey,
          candidateTransfersCount: 1,
          matchedTransferId: candidate.id,
          unresolvedReason: `Amount mismatch: candidate transfer is ${candidate.amount}p, expected ${expectedAmountPence}p.`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      if (expectedDestinationAccount && candidate.destination !== expectedDestinationAccount) {
        return {
          status: "AMBIGUOUS_MULTIPLE_MATCH",
          stripeIdempotencyKey,
          candidateTransfersCount: 1,
          matchedTransferId: candidate.id,
          unresolvedReason: `Destination mismatch: candidate destination is ${candidate.destination}, expected ${expectedDestinationAccount}.`,
          requiresManualReview: true,
          ledgerUpdated: false,
          moneyMovementAttempted: false,
        };
      }

      return {
        status: "RESOLVED_EXACT_MATCH",
        stripeIdempotencyKey,
        candidateTransfersCount: 1,
        matchedTransferId: candidate.id,
        matchedTransfer: {
          id: candidate.id,
          amount: candidate.amount,
          currency: candidate.currency,
          destination: candidate.destination as string,
          created: candidate.created,
          metadata: { ...meta },
        },
        requiresManualReview: false,
        ledgerUpdated: false,
        moneyMovementAttempted: false,
      };
    } catch (unexpectedErr: any) {
      return {
        status: "RETRIEVAL_ERROR",
        stripeIdempotencyKey,
        candidateTransfersCount: 0,
        unresolvedReason: `Unexpected error during transfer inspection: ${unexpectedErr?.message || String(unexpectedErr)}`,
        requiresManualReview: true,
        ledgerUpdated: false,
        moneyMovementAttempted: false,
      };
    }
  }

  /**
   * Explicit, separately authorized ledger repair function.
   * Accepts a verified RESOLVED_EXACT_MATCH evidence result and repairs the payment_ledger record.
   */
  public static async applyLedgerEvidenceRepair(
    db: any,
    idempotencyKey: string,
    evidence: EscrowRecoveryEvidence
  ): Promise<{ success: boolean; ledgerUpdated: boolean }> {
    if (!db) {
      return { success: false, ledgerUpdated: false };
    }
    if (evidence.status !== "RESOLVED_EXACT_MATCH" || !evidence.matchedTransferId) {
      console.warn(`[Escrow Recovery] Refusing ledger repair for unresolved or ambiguous evidence status '${evidence.status}'.`);
      return { success: false, ledgerUpdated: false };
    }

    try {
      const ledgerSnap = await db
        .collection("payment_ledger")
        .where("idempotencyKey", "==", idempotencyKey)
        .get();

      if (!ledgerSnap.empty) {
        const currentDoc = ledgerSnap.docs[0];
        const currentData = typeof currentDoc.data === "function" ? currentDoc.data() : currentDoc.data;
        if (currentData.transferStatus !== "completed") {
          await currentDoc.ref.update({
            stripeTransferId: evidence.matchedTransferId,
            transferStatus: "completed",
            recoveryEvidence: "exact_match_verified",
            recoveredAt: new Date().toISOString(),
          });
          return { success: true, ledgerUpdated: true };
        }
      }
      return { success: true, ledgerUpdated: false };
    } catch (dbErr: any) {
      console.error("[Escrow Recovery] Failed to update ledger record:", dbErr?.message);
      return { success: false, ledgerUpdated: false };
    }
  }

  public static async inspectAndRecoverTransferEvidence(
    db: any,
    query: EscrowRecoveryQuery,
    options?: {
      autoRepair?: boolean;
      stripe?: {
        transfers: {
          list: (params?: any) => Promise<{ data: Stripe.Transfer[] }>;
          retrieve?: (id: string) => Promise<Stripe.Transfer>;
        };
      };
    }
  ): Promise<EscrowRecoveryEvidence> {
    const evidence = await this.inspectTransferEvidence(db, query, options);

    if (options?.autoRepair === true && evidence.status === "RESOLVED_EXACT_MATCH") {
      const repairResult = await this.applyLedgerEvidenceRepair(db, query.idempotencyKey, evidence);
      return {
        ...evidence,
        ledgerUpdated: repairResult.ledgerUpdated,
      };
    }

    return evidence;
  }
}
