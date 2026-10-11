/**
 * AnyTrader V8.3 Task 35-B — Driver Authorization & Ride Claiming Security Engine
 *
 * Enforces server-authoritative driver eligibility, identity binding, and non-suspended status.
 * Rejects client-supplied `isDriver`, `role`, or `driverId` overrides.
 * Preserves 100% atomic transaction concurrency for ride claims.
 */

import admin from "firebase-admin";
import { UnauthorizedError, ForbiddenError, BadRequestError, ConflictError } from "./httpErrors.ts";
import { domainEvents } from "./domainEvents.ts";

export interface AuthenticatedDriverUser {
  uid: string;
  email?: string;
  isAdmin?: boolean;
  admin?: boolean;
  [key: string]: any;
}

/**
 * Server-authoritative driver eligibility verification.
 * Strictly verifies database record for caller UID.
 * Ignores any client-supplied request body fields (`isDriver`, `role`, etc.).
 */
export function assertAuthoritativeDriverEligibility(
  userData: Record<string, any> | null | undefined,
  callerUid: string
): void {
  if (!userData) {
    throw new ForbiddenError("User record not found or not authorized as a driver.");
  }

  // 1. Verify Driver Operational Privileges
  const isDriverRole =
    userData.role === "driver" ||
    userData.role === "fleet_driver" ||
    userData.role === "taxi_driver" ||
    userData.isDriver === true ||
    userData.accountType === "driver";

  if (!isDriverRole) {
    throw new ForbiddenError("Caller is not authorized to operate as a driver.");
  }

  // 2. Verify Account Activity & Non-Suspended Status
  const isSuspendedOrDisabled =
    userData.disabled === true ||
    userData.isDisabled === true ||
    userData.isSuspended === true ||
    userData.suspended === true ||
    userData.isBanned === true ||
    userData.banned === true ||
    userData.isDeactivated === true ||
    userData.deactivated === true ||
    userData.status === "suspended" ||
    userData.status === "banned" ||
    userData.status === "disabled" ||
    userData.status === "deactivated" ||
    userData.status === "inactive" ||
    userData.driverStatus === "suspended" ||
    userData.driverStatus === "disabled" ||
    userData.driverStatus === "banned" ||
    userData.driverStatus === "inactive" ||
    userData.driverStatus === "deactivated" ||
    userData.driverApproved === false;

  if (isSuspendedOrDisabled) {
    throw new ForbiddenError("Driver account is suspended, disabled, or inactive.");
  }

  // 3. Fail-Closed Driver Approval Verification (PL-09)
  if (userData.driverApproved !== true) {
    throw new ForbiddenError("Driver account is awaiting verification and approval.");
  }
}

export interface AcceptRideCommandInput {
  db: any;
  caller: AuthenticatedDriverUser;
  body: {
    rideId?: string;
    driverId?: string;
    isDriver?: any;
    role?: any;
    [key: string]: any;
  };
}

export interface AcceptRideCommandResult {
  success: boolean;
  rideId: string;
  driverId: string;
}

/**
 * Server-authoritative, transactional ride acceptance command.
 * Enforces pre-claim driver authorization, identity verification, and atomic reservation.
 */
export async function executeAcceptRideCommand(
  input: AcceptRideCommandInput
): Promise<AcceptRideCommandResult> {
  const { db, caller, body } = input;

  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication token is missing or invalid.");
  }

  const callerUid = caller.uid;
  const isAdmin = caller.isAdmin === true || caller.admin === true;

  const rideId = body?.rideId;
  if (!rideId || typeof rideId !== "string" || !rideId.trim()) {
    throw new BadRequestError("Missing or invalid rideId");
  }

  // Impersonation Defense: Reject any attempt to claim on behalf of a different user ID
  if (body?.driverId && typeof body.driverId === "string" && body.driverId !== callerUid) {
    throw new ForbiddenError("Cannot accept ride on behalf of another driver.");
  }

  if (!db) {
    throw new BadRequestError("Database not initialized");
  }

  const effectiveDriverId = callerUid;

  await db.runTransaction(async (transaction: any) => {
    // 1. Authoritative User Profile Lookup (Read)
    const userRef = db.collection("users").doc(callerUid);
    const userDoc = await transaction.get(userRef);
    const userData = userDoc.exists ? userDoc.data() : null;

    // 2. Pre-claim Driver Authorization Check
    assertAuthoritativeDriverEligibility(userData, callerUid);

    // 3. Ride Request Lookup (Read)
    const rideRef = db.collection("ride_requests").doc(rideId);
    const rideDoc = await transaction.get(rideRef);

    if (!rideDoc.exists) {
      throw new BadRequestError("Ride request not found");
    }

    const rideData = rideDoc.data() || {};

    if (rideData.status !== "pending" && rideData.status !== "searching" && rideData.status !== "offered") {
      throw new ConflictError("Ride is no longer available");
    }

    if (rideData.driverId || rideData.assignedDriverId) {
      throw new ConflictError("Ride has already been accepted by another driver");
    }

    const passengerId = rideData.passengerId || rideData.userId || rideData.riderId;
    if (passengerId === callerUid) {
      throw new BadRequestError("Passengers cannot accept their own ride requests as a driver.");
    }

    // 4. Atomic Transaction Writes
    const driverRef = db.collection("driver_status").doc(effectiveDriverId);

    transaction.update(rideRef, {
      driverId: effectiveDriverId,
      assignedDriverId: effectiveDriverId,
      status: "accepted",
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(
      driverRef,
      {
        status: "busy",
        isBusy: true,
        currentRideId: rideId,
        lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  if (domainEvents && typeof domainEvents.dispatch === "function") {
    await domainEvents.dispatch(
      "RIDE_ACCEPTED",
      rideId,
      effectiveDriverId,
      { driverId: effectiveDriverId },
      undefined,
      db
    );
  }

  return {
    success: true,
    rideId,
    driverId: effectiveDriverId,
  };
}
