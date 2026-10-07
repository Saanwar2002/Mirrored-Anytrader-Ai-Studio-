/**
 * AnyTrader V8.3 Task 35-C — Trip Payment Recipient Integrity & Server-Authoritative Payee Resolution
 *
 * Enforces server-authoritative recipient determination for trip/fare payments.
 * Rejects client attempts to redirect payment or substitute Stripe/connected accounts.
 * Validates caller relationship (passenger, assigned driver, or platform admin) against authoritative trip state.
 */

import Stripe from "stripe";
import { UnauthorizedError, ForbiddenError, BadRequestError } from "./httpErrors.ts";
import { domainEvents } from "./domainEvents.ts";

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  isAdmin?: boolean;
  admin?: boolean;
  [key: string]: any;
}

export interface CreateTripPaymentInput {
  db: any;
  caller: AuthenticatedUser;
  body: {
    rideId?: string;
    id?: string;
    driverId?: string;
    recipientId?: string;
    payeeId?: string;
    driverUid?: string;
    stripeAccountId?: string;
    connectedAccountId?: string;
    destinationAccountId?: string;
    transferDestination?: string;
    accountId?: string;
    tipAmount?: number | string;
    baseFare?: number | string;
    amount?: number | string;
    [key: string]: any;
  };
  stripeClient?: Stripe | null;
  appUrl?: string;
}

export interface AuthoritativeTripPaymentResult {
  success: boolean;
  url: string;
  rideId: string;
  driverId: string;
  recipientId: string;
  stripeAccountId: string;
  effectiveBaseFare: number;
  sanitizedTip: number;
  totalAmount: number;
  feeAmount: number;
  session?: any;
}

/**
 * Server-authoritative trip payment creation command.
 *
 * Security Invariants:
 * 1. Authenticates caller context.
 * 2. Loads authoritative trip document from Firestore.
 * 3. Asserts caller is an authorized participant (passenger, assigned driver, or platform admin).
 * 4. Resolves the authoritative assigned driver from trip state (rideData.driverId / rideData.assignedDriverId).
 * 5. Rejects any client-supplied recipient fields that conflict with the authoritative driver.
 * 6. Loads the driver's Stripe Connect destination account from the server-authoritative user record.
 * 7. Strictly discards and ignores any client-supplied Stripe / connected account IDs.
 * 8. Creates the Stripe Checkout session routing funds strictly to the authoritative destination.
 */
export async function executeCreateTripPaymentCommand(
  input: CreateTripPaymentInput
): Promise<AuthoritativeTripPaymentResult> {
  const { db, caller, body, stripeClient, appUrl } = input;

  // 1. Authenticate caller
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to process trip payment.");
  }

  const callerUid = caller.uid;
  const isCallerAdmin = caller.isAdmin === true || caller.admin === true;

  if (!db) {
    throw new BadRequestError("Database backend unavailable");
  }

  // 2. Resolve rideId
  const rideId = body?.rideId || body?.id;
  if (!rideId || typeof rideId !== "string" || !rideId.trim()) {
    throw new BadRequestError("Missing or invalid rideId");
  }

  // 3. Load authoritative ride document from Firestore
  let rideData: any = null;
  try {
    const rideSnap = await db.collection("ride_requests").doc(rideId).get();
    if (rideSnap && (typeof rideSnap.exists === "function" ? rideSnap.exists() : rideSnap.exists)) {
      rideData = typeof rideSnap.data === "function" ? rideSnap.data() : rideSnap.data;
    } else {
      const legacySnap = await db.collection("rides").doc(rideId).get();
      if (legacySnap && (typeof legacySnap.exists === "function" ? legacySnap.exists() : legacySnap.exists)) {
        rideData = typeof legacySnap.data === "function" ? legacySnap.data() : legacySnap.data;
      }
    }
  } catch (err: any) {
    console.warn("Could not query ride record from Firestore:", err?.message);
  }

  if (!rideData) {
    throw new BadRequestError("Ride record not found");
  }

  // 4. Assert caller authorization against authoritative ride record
  const authoritativePassengerId = rideData.passengerId || rideData.userId || rideData.riderId;

  // Driver Source Verification & Conflict Defense:
  // If both driverId and assignedDriverId exist but disagree, fail closed immediately.
  if (
    rideData.driverId &&
    rideData.assignedDriverId &&
    typeof rideData.driverId === "string" &&
    typeof rideData.assignedDriverId === "string" &&
    rideData.driverId !== rideData.assignedDriverId
  ) {
    throw new BadRequestError("Conflicting authoritative driver identities detected on ride record");
  }

  const authoritativeDriverId = rideData.driverId || rideData.assignedDriverId;

  const isPassenger = authoritativePassengerId && callerUid === authoritativePassengerId;
  const isDriver = authoritativeDriverId && callerUid === authoritativeDriverId;

  if (!isPassenger && !isDriver && !isCallerAdmin) {
    throw new ForbiddenError("Forbidden: You are not authorized to process payment for this trip.");
  }

  // 5. Authoritative Driver Verification
  if (!authoritativeDriverId || typeof authoritativeDriverId !== "string" || !authoritativeDriverId.trim()) {
    throw new BadRequestError("No assigned driver found for this ride");
  }

  // Client Recipient Manipulation / Redirection Defense:
  // If client provided a driverId, recipientId, payeeId, or driverUid, it MUST match the authoritative driver
  const clientSuppliedRecipient = body.driverId || body.recipientId || body.payeeId || body.driverUid;
  if (
    clientSuppliedRecipient &&
    typeof clientSuppliedRecipient === "string" &&
    clientSuppliedRecipient !== authoritativeDriverId
  ) {
    throw new ForbiddenError("Cannot redirect trip payment to a different driver or recipient.");
  }

  // 6. Resolve driver's authoritative Stripe account from Firestore users collection
  const driverDoc = await db.collection("users").doc(authoritativeDriverId).get();
  const driverDocExists = driverDoc && (typeof driverDoc.exists === "function" ? driverDoc.exists() : driverDoc.exists);

  if (!driverDocExists) {
    throw new BadRequestError("Authoritative driver profile not found");
  }

  const driverData = typeof driverDoc.data === "function" ? driverDoc.data() : driverDoc.data;
  const authoritativeStripeAccountId = driverData?.stripeAccountId;

  if (!authoritativeStripeAccountId || typeof authoritativeStripeAccountId !== "string" || !authoritativeStripeAccountId.trim()) {
    throw new BadRequestError("Driver has not completed Stripe onboarding.");
  }

  // NOTE: Any client-supplied stripeAccountId, connectedAccountId, destinationAccountId is completely IGNORED.
  // The payment destination is strictly authoritativeStripeAccountId.

  // 7. Resolve authoritative base fare from server-authoritative trip record ONLY
  const rawAuthoritativeFare = (
    rideData.finalFare ??
    rideData.fare ??
    rideData.estimatedFare ??
    rideData.totalFare ??
    rideData.price
  );

  const effectiveBaseFare = typeof rawAuthoritativeFare === "number" ? rawAuthoritativeFare : Number(rawAuthoritativeFare);

  if (!rawAuthoritativeFare || isNaN(effectiveBaseFare) || effectiveBaseFare <= 0) {
    throw new BadRequestError("Authoritative trip fare could not be resolved from ride record.");
  }

  // Client amount cannot manufacture or override fare: body.amount and body.baseFare are strictly ignored.
  const rawTip = Number(body.tipAmount) || 0;
  const sanitizedTip = Math.max(0, Math.min(500, isNaN(rawTip) ? 0 : rawTip));
  const totalAmount = effectiveBaseFare + sanitizedTip;

  if (totalAmount <= 0) {
    throw new BadRequestError("Trip amount must be greater than zero.");
  }

  const commissionRate = 0.12;
  const feeAmount = Math.round(effectiveBaseFare * commissionRate * 100);
  const totalAmountPence = Math.round(totalAmount * 100);

  const resolvedAppUrl = appUrl || process.env.APP_URL || "http://localhost:3000";
  let checkoutUrl = `${resolvedAppUrl}/payment-success?rideId=${rideId}&fare=${effectiveBaseFare}&tip=${sanitizedTip}`;
  let createdSession: any = null;

  // 8. Create Stripe Checkout Session if client is available
  if (stripeClient) {
    try {
      createdSession = await stripeClient.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: `Trip Payment (Ride #${rideId.substring(0, 8)})`,
                description: `Direct transport payment (Base: £${effectiveBaseFare.toFixed(2)}, Tip: £${sanitizedTip.toFixed(2)})`,
              },
              unit_amount: totalAmountPence,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: feeAmount,
          transfer_data: {
            destination: authoritativeStripeAccountId, // Strictly server-derived!
          },
          metadata: {
            rideId,
            driverId: authoritativeDriverId, // Strictly server-derived!
            recipientId: authoritativeDriverId, // Strictly server-derived!
            stripeAccountId: authoritativeStripeAccountId, // Strictly server-derived!
            passengerId: authoritativePassengerId || callerUid,
            baseFare: effectiveBaseFare.toString(),
            tipAmount: sanitizedTip.toString(),
            type: "taxi_trip",
          },
        },
        metadata: {
          rideId,
          driverId: authoritativeDriverId, // Strictly server-derived!
          recipientId: authoritativeDriverId, // Strictly server-derived!
          stripeAccountId: authoritativeStripeAccountId, // Strictly server-derived!
          passengerId: authoritativePassengerId || callerUid,
          baseFare: effectiveBaseFare.toString(),
          tipAmount: sanitizedTip.toString(),
          type: "taxi_trip",
        },
        success_url: `${resolvedAppUrl}/payment-success?rideId=${rideId}`,
        cancel_url: `${resolvedAppUrl}/payment-failed?rideId=${rideId}`,
      });

      if (createdSession?.url) {
        checkoutUrl = createdSession.url;
      }
    } catch (stripeErr: any) {
      console.warn("Stripe trip payment session creation failed:", stripeErr?.message);
      if (process.env.NODE_ENV === "production") {
        throw new BadRequestError("Payment gateway error during session creation.");
      }
    }
  }

  return {
    success: true,
    url: checkoutUrl,
    rideId,
    driverId: authoritativeDriverId,
    recipientId: authoritativeDriverId,
    stripeAccountId: authoritativeStripeAccountId,
    effectiveBaseFare,
    sanitizedTip,
    totalAmount,
    feeAmount,
    session: createdSession,
  };
}
