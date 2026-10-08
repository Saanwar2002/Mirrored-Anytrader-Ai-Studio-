/**
 * AnyTrader V8.3 — Server-Authoritative Driver Payout Orchestration Engine
 *
 * Remediates Four Core Vulnerabilities:
 * 1. Rejects unverified, client-forged rides created directly in Firestore.
 * 2. Enforces server-authoritative driver identity, eligibility, and fee calculation.
 * 3. Eliminates platform-funded transfers for synthetic rides by mandating verified Stripe PaymentIntents/ledger records.
 * 4. Cures premature payout marking: payoutTransferred is ONLY set to true AFTER Stripe transfer confirmation.
 *    Transient Stripe errors leave payoutTransferred: false with safe retry semantics and idempotency keys.
 */

import Stripe from "stripe";
import admin from "firebase-admin";

export interface DriverPayoutOrchestrationOptions {
  db: any;
  stripeClient?: Stripe | null;
  dryRun?: boolean;
  logger?: {
    log: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
}

export interface PayoutDetail {
  rideId: string;
  driverId: string;
  stripeAccountId: string;
  amount: number;
  status: "transferred" | "failed" | "skipped" | "unverified";
  transferId?: string;
  reason?: string;
}

export interface DriverPayoutOrchestrationResult {
  success: boolean;
  processedCount: number;
  totalDisbursed: number;
  skippedCount: number;
  failedCount: number;
  details: PayoutDetail[];
  error?: string;
}

export const PLATFORM_COMMISSION_RATE = 0.12;
export const DRIVER_BASE_SHARE_RATE = 0.88;
export const MAX_ALLOWED_RIDE_PAYOUT_GBP = 1000.00;

/**
 * Executes the server-authoritative driver payout orchestration.
 */
export async function executeDriverPayoutOrchestrationCommand(
  options: DriverPayoutOrchestrationOptions
): Promise<DriverPayoutOrchestrationResult> {
  const { db, stripeClient, dryRun = false, logger = console } = options;

  if (!db) {
    return {
      success: false,
      processedCount: 0,
      totalDisbursed: 0,
      skippedCount: 0,
      failedCount: 0,
      details: [],
      error: "Database backend unavailable",
    };
  }

  logger.log("[Payout Orchestrator] Starting server-authoritative driver payout orchestration...");

  let processedCount = 0;
  let totalDisbursed = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const details: PayoutDetail[] = [];

  try {
    // 1. Query rides eligible for automated payout review
    const ridesSnapshot = await db
      .collection("ride_requests")
      .where("status", "==", "completed")
      .where("paymentStatus", "==", "paid")
      .where("payoutTransferred", "==", false)
      .get();

    if (ridesSnapshot.empty) {
      logger.log("[Payout Orchestrator] No pending completed rides awaiting payout.");
      return { success: true, processedCount, totalDisbursed, skippedCount, failedCount, details };
    }

    const nowMs = Date.now();

    for (const rideDoc of ridesSnapshot.docs) {
      const ride = rideDoc.data() || {};
      const rideId = rideDoc.id;

      // 2. Concurrency Lock Check: Skip if another worker has an active lease (< 5 minutes old)
      if (ride.payoutStatus === "processing" && ride.payoutLockedAt) {
        let lockTimeMs = 0;
        if (typeof ride.payoutLockedAt.toMillis === "function") {
          lockTimeMs = ride.payoutLockedAt.toMillis();
        } else if (ride.payoutLockedAt instanceof Date) {
          lockTimeMs = ride.payoutLockedAt.getTime();
        } else if (typeof ride.payoutLockedAt === "number") {
          lockTimeMs = ride.payoutLockedAt;
        }

        if (lockTimeMs > 0 && nowMs - lockTimeMs < 300000) {
          logger.warn(`[Payout Orchestrator] Ride ${rideId} is currently being processed by another worker lease. Skipping.`);
          skippedCount++;
          details.push({
            rideId,
            driverId: ride.assignedDriverId || "unknown",
            stripeAccountId: "",
            amount: 0,
            status: "skipped",
            reason: "Concurrency lock active",
          });
          continue;
        }
      }

      // 3. Server-Authoritative Driver Identity & Cross-Driver Protection
      const assignedDriverId = ride.assignedDriverId || ride.driverId;
      if (!assignedDriverId || typeof assignedDriverId !== "string" || !assignedDriverId.trim()) {
        logger.warn(`[Payout Orchestrator] Ride ${rideId} has no assigned driver. Skipping.`);
        skippedCount++;
        details.push({
          rideId,
          driverId: "",
          stripeAccountId: "",
          amount: 0,
          status: "skipped",
          reason: "No assigned driver",
        });
        continue;
      }

      // Conflict Check: If both driverId and assignedDriverId exist but disagree, fail closed
      if (ride.driverId && ride.assignedDriverId && ride.driverId !== ride.assignedDriverId) {
        logger.error(`[Payout Orchestrator] Security Alert: Conflicting driver identities on ride ${rideId} (assigned: ${ride.assignedDriverId}, driverId: ${ride.driverId}). Failing closed.`);
        await rideDoc.ref.update({
          payoutStatus: "conflicting_driver_identity",
          payoutLastError: "Conflicting driver identities detected",
          payoutTransferred: false,
        });
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId: "",
          amount: 0,
          status: "skipped",
          reason: "Conflicting driver identity",
        });
        continue;
      }

      // 4. Driver Eligibility Verification
      const driverDoc = await db.collection("users").doc(assignedDriverId).get();
      const driverExists = typeof driverDoc.exists === "function" ? driverDoc.exists() : driverDoc.exists;
      if (!driverExists) {
        logger.warn(`[Payout Orchestrator] Driver profile ${assignedDriverId} not found in database. Skipping ride ${rideId}.`);
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId: "",
          amount: 0,
          status: "skipped",
          reason: "Driver profile not found",
        });
        continue;
      }

      const driverData = typeof driverDoc.data === "function" ? driverDoc.data() : driverDoc.data;
      const isEligibleDriver = driverData?.role === "driver" || driverData?.isDriver === true;
      if (!isEligibleDriver) {
        logger.warn(`[Payout Orchestrator] User ${assignedDriverId} does not possess driver role or eligibility. Skipping ride ${rideId}.`);
        await rideDoc.ref.update({
          payoutStatus: "driver_ineligible",
          payoutLastError: "User does not have active driver credentials",
          payoutTransferred: false,
        });
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId: "",
          amount: 0,
          status: "skipped",
          reason: "Driver ineligible",
        });
        continue;
      }

      // 5. Server-Authoritative Stripe Destination & Fail-Closed Behavior
      const stripeAccountId = driverData?.stripeAccountId;
      const isMockDisallowed = process.env.NODE_ENV === "production" || process.env.ALLOW_MOCK_PAYMENTS !== "true";

      if (
        !stripeAccountId ||
        typeof stripeAccountId !== "string" ||
        !stripeAccountId.trim() ||
        (stripeAccountId.startsWith("acct_mock_") && isMockDisallowed)
      ) {
        const isMockAccount = Boolean(stripeAccountId?.startsWith("acct_mock_"));
        logger.warn(
          `[Payout Orchestrator] Driver ${assignedDriverId} has ${
            isMockAccount ? "mock Stripe account in live environment" : "no connected Stripe account"
          }. Failing closed without disbursing.`
        );
        await rideDoc.ref.update({
          payoutStatus: isMockAccount ? "failed_mock_stripe_account" : "pending_stripe_onboarding",
          payoutLastError: isMockAccount
            ? "Mock Stripe accounts are rejected in live environments"
            : "Driver has not connected Stripe payout account",
          payoutTransferred: false,
        });
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId: stripeAccountId || "",
          amount: 0,
          status: "skipped",
          reason: isMockAccount
            ? "Mock Stripe account rejected in live environment"
            : "Missing Stripe destination account",
        });
        continue;
      }

      // 6. Payment Verification & Anti-Forgery Defense (Curing Vuln 2 & 3)
      // Must verify that passenger funds were actually collected by the platform before disbursing platform funds.
      const paymentIntentId = ride.stripePaymentIntentId || ride.paymentIntentId;
      let isPaymentVerified = false;
      let verifiedCollectedPence = 0;

      if (paymentIntentId && typeof paymentIntentId === "string" && paymentIntentId.trim()) {
        if (stripeClient) {
          try {
            const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
            if (pi && pi.status === "succeeded" && pi.amount_received > 0) {
              isPaymentVerified = true;
              verifiedCollectedPence = pi.amount_received;
            } else {
              logger.warn(`[Payout Orchestrator] Stripe PaymentIntent ${paymentIntentId} status is '${pi?.status}', not succeeded.`);
            }
          } catch (piErr: any) {
            logger.warn(`[Payout Orchestrator] Failed to retrieve PaymentIntent ${paymentIntentId} from Stripe: ${piErr.message}`);
          }
        } else {
          // Mock mode / dev test fallback for PaymentIntent
          if (paymentIntentId.startsWith("pi_") || paymentIntentId.startsWith("mock_pi_")) {
            isPaymentVerified = true;
            verifiedCollectedPence = Math.round(((ride.finalFare || ride.fareEstimate || ride.fare || 10) + (ride.tipAmount || 0)) * 100);
          }
        }
      }

      // Check payment_ledger fallback if PaymentIntent was not directly retrieved
      if (!isPaymentVerified) {
        try {
          const ledgerSnap = await db
            .collection("payment_ledger")
            .where("transactionId", "==", paymentIntentId || `ride_${rideId}`)
            .limit(1)
            .get();

          if (!ledgerSnap.empty) {
            const entry = ledgerSnap.docs[0].data();
            if (entry?.status === "completed" || entry?.captured === true) {
              isPaymentVerified = true;
              verifiedCollectedPence = entry.amount || Math.round((ride.finalFare || 10) * 100);
            }
          }
        } catch (ledgerErr: any) {
          logger.warn(`[Payout Orchestrator] Ledger verification lookup failed for ride ${rideId}:`, ledgerErr.message);
        }
      }

      // If payment cannot be verified against a real Stripe charge or ledger, REJECT to prevent draining platform funds
      if (!isPaymentVerified) {
        logger.error(`[Payout Orchestrator] Security Defense: Ride ${rideId} claims paid status but lacks a verified Stripe charge or ledger transaction. Refusing platform-funded transfer.`);
        await rideDoc.ref.update({
          payoutStatus: "rejected_unverified_payment",
          payoutLastError: "Refused transfer: No verified Stripe payment or ledger receipt found",
          payoutTransferred: false,
        });
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: 0,
          status: "unverified",
          reason: "No verified Stripe payment record",
        });
        continue;
      }

      // 7. Server-Authoritative Fee Calculation
      const rawBaseFare = Number(ride.finalFare || ride.fareEstimate || ride.fare) || 0;
      const rawTip = Number(ride.tipAmount) || 0;

      if (rawBaseFare <= 0 && rawTip <= 0) {
        logger.warn(`[Payout Orchestrator] Ride ${rideId} has non-positive fare and tip. Skipping.`);
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: 0,
          status: "skipped",
          reason: "Non-positive fare",
        });
        continue;
      }

      const sanitizedBaseFare = Math.max(0, Math.min(MAX_ALLOWED_RIDE_PAYOUT_GBP, rawBaseFare));
      const sanitizedTip = Math.max(0, Math.min(200, rawTip));

      // Calculate 88% of base fare + 100% of tip
      const driverEarnings = Math.round(((sanitizedBaseFare * DRIVER_BASE_SHARE_RATE) + sanitizedTip) * 100) / 100;
      const platformCommission = Math.round((sanitizedBaseFare * PLATFORM_COMMISSION_RATE) * 100) / 100;
      const transferAmountPence = Math.round(driverEarnings * 100);

      if (transferAmountPence <= 0 || driverEarnings > MAX_ALLOWED_RIDE_PAYOUT_GBP) {
        logger.error(`[Payout Orchestrator] Driver earnings £${driverEarnings} exceeds safety limits for ride ${rideId}. Skipping.`);
        await rideDoc.ref.update({
          payoutStatus: "amount_out_of_bounds",
          payoutLastError: `Calculated amount £${driverEarnings} exceeds safety limits`,
          payoutTransferred: false,
        });
        skippedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: driverEarnings,
          status: "skipped",
          reason: "Amount out of bounds",
        });
        continue;
      }

      if (dryRun) {
        logger.log(`[Payout Orchestrator] [Dry Run] Would disburse £${driverEarnings.toFixed(2)} to driver ${assignedDriverId} for ride ${rideId}.`);
        processedCount++;
        totalDisbursed += driverEarnings;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: driverEarnings,
          status: "transferred",
          reason: "Dry run simulated success",
        });
        continue;
      }

      // 8. Concurrency Protection & Atomic Pre-Lock
      try {
        await db.runTransaction(async (t: any) => {
          const freshSnap = await t.get(rideDoc.ref);
          const freshData = freshSnap.data() || {};
          if (freshData.payoutTransferred === true) {
            throw new Error("ALREADY_PAID");
          }
          t.update(rideDoc.ref, {
            payoutStatus: "processing",
            payoutLockedAt: admin.firestore.FieldValue.serverTimestamp(),
            // CRITICAL: payoutTransferred MUST REMAIN false until Stripe confirms execution!
            payoutTransferred: false,
          });
        });
      } catch (lockErr: any) {
        if (lockErr.message === "ALREADY_PAID") {
          logger.warn(`[Payout Orchestrator] Ride ${rideId} was already marked paid during concurrency check.`);
          skippedCount++;
          continue;
        }
        logger.error(`[Payout Orchestrator] Transaction lock failed for ride ${rideId}:`, lockErr.message);
        failedCount++;
        continue;
      }

      // 9. Deterministic Stripe Transfer Execution with Idempotency Key
      const idempotencyKey = `payout:ride:${rideId}:${assignedDriverId}:${transferAmountPence}`;
      let stripeTransferId = `mock_transfer_${rideId}`;

      try {
        if (!stripeClient && isMockDisallowed) {
          logger.error(`[Payout Orchestrator] Stripe client unavailable in live environment. Refusing mock transfer for ride ${rideId}.`);
          await rideDoc.ref.update({
            payoutStatus: "failed_stripe_unavailable",
            payoutLastError: "Stripe client unavailable in live environment",
            payoutTransferred: false,
          });
          failedCount++;
          details.push({
            rideId,
            driverId: assignedDriverId,
            stripeAccountId,
            amount: driverEarnings,
            status: "failed",
            reason: "Stripe gateway unavailable in live environment",
          });
          continue;
        }

        if (stripeClient) {
          const transfer = await stripeClient.transfers.create(
            {
              amount: transferAmountPence,
              currency: "gbp",
              destination: stripeAccountId,
              metadata: {
                rideId,
                driverId: assignedDriverId,
                platformCommission: platformCommission.toString(),
                type: "orchestrated_driver_payout",
              },
            },
            {
              idempotencyKey,
            }
          );
          stripeTransferId = transfer.id;
        }

        // 10. Post-Commit State Transition (Curing Vuln 4):
        // Commit payoutTransferred: true ONLY AFTER Stripe transfer returns successfully!
        await db.runTransaction(async (t: any) => {
          t.update(rideDoc.ref, {
            payoutTransferred: true,
            payoutStatus: "transferred",
            payoutTransferredAt: admin.firestore.FieldValue.serverTimestamp(),
            stripeTransferId,
            driverEarnings,
            calculatedDriverEarnings: driverEarnings,
            platformFee: platformCommission,
            calculatedPlatformFee: platformCommission,
            payoutError: admin.firestore.FieldValue.delete(),
          });
        });

        processedCount++;
        totalDisbursed += driverEarnings;
        logger.log(`[Payout Orchestrator] Disbursed £${driverEarnings.toFixed(2)} to driver ${assignedDriverId} (${stripeAccountId}) for ride ${rideId}. Transfer ID: ${stripeTransferId}`);
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: driverEarnings,
          status: "transferred",
          transferId: stripeTransferId,
        });
      } catch (transferErr: any) {
        // Curing Vuln 4: On Stripe error, do NOT mark as transferred!
        // Record failed state with explicit error details so the driver can be retried safely.
        logger.error(`[Payout Orchestrator] Stripe Transfer failed for ride ${rideId}:`, transferErr.message);
        await rideDoc.ref.update({
          payoutTransferred: false, // Explicitly false!
          payoutStatus: "failed",
          payoutLastError: transferErr.message,
          payoutFailedAt: admin.firestore.FieldValue.serverTimestamp(),
          payoutRetryCount: admin.firestore.FieldValue.increment(1),
        });
        failedCount++;
        details.push({
          rideId,
          driverId: assignedDriverId,
          stripeAccountId,
          amount: driverEarnings,
          status: "failed",
          reason: transferErr.message,
        });
      }
    }

    logger.log(`[Payout Orchestrator] Orchestration completed. Processed: ${processedCount}, Disbursed: £${totalDisbursed.toFixed(2)}, Skipped: ${skippedCount}, Failed: ${failedCount}.`);
    return {
      success: true,
      processedCount,
      totalDisbursed,
      skippedCount,
      failedCount,
      details,
    };
  } catch (orchestrationErr: any) {
    logger.error("[Payout Orchestrator] Fatal error during payout orchestration:", orchestrationErr.message);
    return {
      success: false,
      processedCount,
      totalDisbursed,
      skippedCount,
      failedCount,
      details,
      error: orchestrationErr.message,
    };
  }
}
