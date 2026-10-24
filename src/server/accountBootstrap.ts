import { z } from "zod";
import admin from "firebase-admin";
import { BadRequestError, ConflictError, ForbiddenError } from "./httpErrors.ts";

export const SELF_SERVICE_ROLES = [
  "homeowner",
  "tradesperson",
  "business",
  "fleet_driver",
] as const;

export type SelfServiceRole = typeof SELF_SERVICE_ROLES[number];

export const bootstrapProfileSchema = z.object({
  role: z.enum(SELF_SERVICE_ROLES),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(32).optional(),
  postcode: z.string().trim().max(10).optional(),
  city: z.string().trim().max(80).optional(),
  county: z.string().trim().max(80).optional(),
  trades: z.array(z.string().max(80)).max(20).default([]),
  subcategories: z.array(z.string().max(80)).max(50).default([]),
  businessLayer: z.enum(["trades", "properties", "consultancy"]).nullish(),
  businessCategory: z.string().max(80).nullish(),
  vehicleCategories: z.array(z.string().max(40)).max(10).nullish(),
  isPetFriendly: z.boolean().optional(),
  referrerUid: z.string().max(128).nullish(),
  affiliateCode: z.string().max(64).nullish(),
}).strict();

export function capabilitiesFor(
  role: SelfServiceRole,
  businessLayer?: "trades" | "properties" | "consultancy" | null
): string[] {
  switch (role) {
    case "business":
      return [
        "contractor",
        "tradesperson",
        "homeowner",
        ...(businessLayer === "properties"
          ? ["landlord", "property_manager", "estate_agent"]
          : businessLayer === "consultancy"
          ? ["consultant"]
          : []),
      ];
    case "fleet_driver":
      return ["fleet_driver", "homeowner"];
    case "tradesperson":
      return ["tradesperson", "homeowner"];
    case "homeowner":
    default:
      return ["homeowner"];
  }
}

export function accountTypeFor(role: SelfServiceRole): string {
  switch (role) {
    case "business":
      return "business";
    case "fleet_driver":
      return "driver";
    case "tradesperson":
      return "service_provider";
    case "homeowner":
    default:
      return "consumer";
  }
}

export async function executeBootstrapProfileCommand(
  firestoreDb: any,
  caller: { uid: string; email?: string | null; firebase?: any },
  rawInput: unknown,
  clientIp?: string
): Promise<{ success: boolean; uid: string }> {
  if (!firestoreDb) {
    throw new BadRequestError("Database not initialized on server");
  }

  const parseResult = bootstrapProfileSchema.safeParse(rawInput);
  if (!parseResult.success) {
    throw new BadRequestError(`Invalid profile payload: ${parseResult.error.message}`);
  }

  const input = parseResult.data;
  const userRef = firestoreDb.collection("users").doc(caller.uid);
  const publicProfileRef = firestoreDb.collection("public_profiles").doc(caller.uid);

  const isDriver = input.role === "fleet_driver";
  const canonicalAccountType = accountTypeFor(input.role);
  const canonicalCapabilities = capabilitiesFor(input.role, input.businessLayer);
  const cleanPostcode = (input.postcode ?? "").toUpperCase().replace(/\s/g, "");

  const defaultTier =
    input.role === "homeowner"
      ? "Standard Homeowner"
      : input.role === "tradesperson"
      ? "Free Explorer"
      : input.role === "business"
      ? "Business Professional"
      : "Standard Driver";

  const userProfileData: Record<string, any> = {
    uid: caller.uid,
    id: caller.uid,
    email: caller.email ?? null,
    isAnonymous: caller.firebase?.sign_in_provider === "anonymous",
    name: input.name,
    displayName: input.name,
    phone: input.phone ?? "",
    postcode: cleanPostcode,
    city: input.city ?? "",
    county: input.county ?? "",
    role: input.role,
    accountType: canonicalAccountType,
    capabilities: canonicalCapabilities,
    activeContext: {
      portal: isDriver ? "anyroller" : "anytrader",
      role: input.role,
    },
    trades: input.trades,
    subcategories: input.subcategories,
    businessLayer: input.role === "business" ? (input.businessLayer ?? null) : null,
    businessCategory: input.role === "business" ? (input.businessCategory ?? null) : null,
    category: input.businessCategory || input.trades[0] || "General Trades",
    primaryTrade: input.trades[0] || input.businessCategory || "General Trades",
    tierId: defaultTier,
    verificationStatus: "unverified",
    driverApproved: isDriver ? false : null,
    fairnessScore: 100,
    joinedDuringBeta: true,
    phantomFeesSaved: 0,
    referralCode: caller.uid.slice(0, 8).toUpperCase(),
    referredBy: input.referrerUid ?? null,
    affiliateId: input.affiliateCode ?? null,
    vehicleCategories: isDriver ? (input.vehicleCategories ?? null) : null,
    isPetFriendly: isDriver ? (input.isPetFriendly ?? false) : false,
    ipAddress: clientIp || "unknown",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    await firestoreDb.runTransaction(async (transaction: any) => {
      const existingSnap = await transaction.get(userRef);
      if (existingSnap && existingSnap.exists) {
        throw new ConflictError("Profile already exists.");
      }

      transaction.set(userRef, userProfileData);

      // Sync sanitized non-PII public profile projection for tradesperson / business
      if (input.role === "tradesperson" || input.role === "business") {
        transaction.set(
          publicProfileRef,
          {
            uid: caller.uid,
            name: input.name,
            role: input.role,
            trades: input.trades,
            subcategories: input.subcategories,
            city: input.city ?? "",
            category: input.businessCategory || input.trades[0] || "General Trades",
            rating: 0,
            trustScore: 0,
            totalReviews: 0,
            verifiedTrader: false,
            isVerified: false,
            videoVerified: false,
            verificationStatus: "unverified",
            tierId: defaultTier,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    return { success: true, uid: caller.uid };
  } catch (err: any) {
    if (err instanceof ConflictError || err instanceof BadRequestError) {
      throw err;
    }
    const isPermissionOrAuthError =
      err?.code === 7 ||
      err?.code === "permission-denied" ||
      err?.message?.includes("PERMISSION_DENIED") ||
      err?.message?.includes("Missing or insufficient permissions") ||
      err?.message?.includes("not been used in project") ||
      err?.message?.includes("The caller does not have permission");

    if (isPermissionOrAuthError) {
      console.warn(
        `[executeBootstrapProfileCommand] Server lacks direct Firestore admin credentials. Authorizing client SDK fallback for uid: ${caller.uid}`,
        err?.message
      );
      return {
        success: true,
        uid: caller.uid,
        fallbackToClient: true,
        profileData: userProfileData,
      } as any;
    }

    throw err;
  }
}
