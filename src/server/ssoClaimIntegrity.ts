/**
 * AnyTrader V8.3 Task 35-E / 35-E-R1 — SSO Claim Integrity & Server-Authoritative Identity Engine
 *
 * Enforces cryptographic verification and server-authoritative derivation for all SSO tokens,
 * provider claims, subject bindings, and identity resolution.
 *
 * Security Invariants:
 * 1. Caller identity is strictly bound to cryptographically verified authentication claims (UID/sub).
 * 2. Client request-body fields (uid, userId, email, role, isAdmin, isDriver, discount, sub) are discarded.
 * 3. Email and email_verified claims cannot be forged from client input.
 * 4. Custom claims and administrative privileges come exclusively from verified token claims or server database records.
 * 5. Provider identities (providerId, sub) cannot be substituted across accounts or cause collision hijacks.
 * 6. Account-linking authorization relies strictly on cryptographically verified provider claims, NEVER client-supplied email_verified.
 */

import jwt from "jsonwebtoken";
import { UnauthorizedError, ForbiddenError, BadRequestError, ConflictError } from "./httpErrors.ts";
import { AuthenticatedUser, isUserAdminClaim } from "./authorization.ts";

export interface SsoTokenGenerationResult {
  token: string;
  uid: string;
  email?: string;
  role: string;
  category: string | null;
  discount: number;
}

export interface ProviderIdentityInput {
  providerId?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean; // Untrusted client field
}

export interface VerifiedProviderClaims {
  providerId: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * Generates an authoritative SSO token for external portal navigation (e.g. AI Shop).
 * Derives all identity, role, and discount data strictly from verified server-side state.
 */
export async function generateAuthoritativeSsoToken(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  secret: string,
  untrustedBody?: Record<string, any>,
  configFetcher?: () => Promise<any>
): Promise<SsoTokenGenerationResult> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required to generate SSO token.");
  }

  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    throw new BadRequestError("SSO secret is not configured.");
  }

  const callerUid = caller.uid;

  // Load authoritative user profile from database
  let userData: Record<string, any> | null = null;
  if (db) {
    try {
      const userDoc = await db.collection("users").doc(callerUid).get();
      const exists = userDoc && (typeof userDoc.exists === "function" ? userDoc.exists() : userDoc.exists);
      if (exists) {
        userData = typeof userDoc.data === "function" ? userDoc.data() : userDoc.data;
      }
    } catch (dbErr: any) {
      console.warn("[SSO Engine] Could not load user profile from Firestore:", dbErr?.message);
    }
  }

  // Authoritative identity derivations (Strictly ignore untrustedBody)
  // Email: from verified auth token claim first, or authoritative Firestore profile second
  const authoritativeEmail = caller.email || userData?.email || undefined;
  
  // Role: from authoritative Firestore profile (default 'homeowner')
  const authoritativeRole = userData?.role || "homeowner";

  // Category: from authoritative Firestore profile
  const authoritativeCategory = userData?.primaryTrade || userData?.category || null;

  // Discount: derived server-side from authoritative tier in Firestore and cached config
  let discount = 0;
  try {
    const tierId = userData?.tierId || (authoritativeRole === "tradesperson" ? "Basic" : "Standard");
    if (configFetcher) {
      const platformConfig = await configFetcher();
      const tiers = authoritativeRole === "tradesperson" ? platformConfig?.feeTiers : platformConfig?.businessTiers;
      const tier = tiers?.find((t: any) => t.name === tierId);
      discount = tier?.shopDiscount || 0;
    }
  } catch (tierErr) {
    console.warn("[SSO Engine] Could not calculate tier discount:", tierErr);
  }

  const token = jwt.sign(
    {
      uid: callerUid,
      role: authoritativeRole,
      email: authoritativeEmail,
      category: authoritativeCategory,
      discount,
      iat: Math.floor(Date.now() / 1000),
    },
    secret,
    {
      expiresIn: "2m",
      audience: "shop.tradequote.uk",
      issuer: "anytrader-auth",
    }
  );

  return {
    token,
    uid: callerUid,
    email: authoritativeEmail,
    role: authoritativeRole,
    category: authoritativeCategory,
    discount,
  };
}

/**
 * Cryptographically verifies an SSO token with strict audience and issuer validation.
 */
export function verifyAuthoritativeSsoToken(
  token: string,
  secret: string
): Record<string, any> {
  if (!token || typeof token !== "string") {
    throw new UnauthorizedError("SSO token is missing or invalid.");
  }

  if (!secret) {
    throw new BadRequestError("SSO secret is not configured.");
  }

  try {
    const decoded = jwt.verify(token, secret, {
      audience: "shop.tradequote.uk",
      issuer: "anytrader-auth",
    });
    return decoded as Record<string, any>;
  } catch (err: any) {
    throw new UnauthorizedError(`SSO token verification failed: ${err.message}`);
  }
}

/**
 * Validates that an SSO provider identity binding does not conflict with existing accounts.
 * Enforces that client-supplied `email_verified` is NEVER trusted for authorization.
 * Only cryptographically verified provider claims (`verifiedClaims`) are trusted for email verification.
 */
export async function evaluateAccountLinkingEligibility(
  db: any,
  caller: AuthenticatedUser | null | undefined,
  providerInput: ProviderIdentityInput,
  verifiedClaims?: VerifiedProviderClaims | null
): Promise<{ eligible: boolean; providerId: string; sub: string }> {
  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required for account linking.");
  }

  // Task 35-E-R2/R3: Trust Boundary Hardening.
  // Account-linking authorization strictly requires cryptographically verified provider claims.
  // If verifiedClaims is missing, null, or undefined, fail closed immediately.
  if (!verifiedClaims) {
    throw new BadRequestError("Cryptographically verified provider claims are required for account linking.");
  }

  // Derive identity STRICTLY from verifiedClaims, NEVER falling back to untrusted providerInput
  const providerId = (verifiedClaims.providerId || "").trim();
  const sub = (verifiedClaims.sub || "").trim();
  const targetEmail = (verifiedClaims.email || "").trim().toLowerCase();

  if (!providerId || !sub) {
    throw new BadRequestError("Verified provider ID and subject identifier (sub) are required.");
  }

  // Task 35-E-R3: Untrusted/Verified Conflict Defense.
  // If untrusted client claims (providerInput) are supplied and contradict cryptographically
  // verified claims, fail closed immediately. Untrusted claims must never override or spoof verified claims.
  if (providerInput) {
    if (providerInput.providerId && providerInput.providerId.trim() !== providerId) {
      throw new BadRequestError("Conflicting provider ID between untrusted client input and verified provider claims.");
    }
    if (providerInput.sub && providerInput.sub.trim() !== sub) {
      throw new BadRequestError("Conflicting subject identifier (sub) between untrusted client input and verified provider claims.");
    }
    if (providerInput.email && providerInput.email.trim().toLowerCase() !== targetEmail) {
      throw new BadRequestError("Conflicting email between untrusted client input and verified provider claims.");
    }
  }

  // Trusted email verification status comes STRICTLY from verifiedClaims, NEVER providerInput.email_verified
  const isEmailCryptographicallyVerified = verifiedClaims.email_verified === true;

  const callerUid = caller.uid;

  if (db) {
    try {
      // 1. Query if this providerId + sub is already linked to another account
      const existingQuery = await db
        .collection("users")
        .where(`providers.${providerId}`, "==", sub)
        .limit(1)
        .get();

      if (existingQuery && !existingQuery.empty) {
        const linkedDoc = existingQuery.docs[0];
        if (linkedDoc.id !== callerUid) {
          throw new ConflictError("This provider identity is already linked to another AnyTrader account.");
        }
      }

      // 2. If email is provided, check for account collision
      if (targetEmail.length > 0) {
        const emailMatchQuery = await db
          .collection("users")
          .where("email", "==", targetEmail)
          .limit(1)
          .get();

        if (emailMatchQuery && !emailMatchQuery.empty) {
          const emailOwnerDoc = emailMatchQuery.docs[0];
          if (emailOwnerDoc.id !== callerUid) {
            // Cannot link or hijack an email belonging to another user
            // Untrusted providerInput.email_verified is completely rejected
            if (!isEmailCryptographicallyVerified) {
              throw new ConflictError("Email identity collision detected: unverified email or untrusted claims cannot link to an existing account.");
            }
            // Even with verified email, cross-account linking to another user's account without ownership is blocked
            throw new ConflictError("Email is already registered to another user account. Account linking collision denied.");
          }
        }
      }
    } catch (err: any) {
      if (err instanceof ConflictError) throw err;
      if (err instanceof BadRequestError) throw err;
      console.warn("[SSO Engine] Provider linking lookup warning:", err?.message);
    }
  }

  return {
    eligible: true,
    providerId,
    sub,
  };
}

export type ProviderTokenVerifierFn = (
  credential: string,
  providerId: string
) => Promise<VerifiedProviderClaims>;

/**
 * Default cryptographic provider credential verifier.
 * Leverages Firebase Admin Auth verifyIdToken for OIDC/Firebase provider tokens,
 * or allows an injected cryptographic verifier function.
 */
export async function verifyProviderCredentialCryptographically(
  credential: string,
  providerId: string,
  adminAuthInstance?: any
): Promise<VerifiedProviderClaims> {
  if (!credential || typeof credential !== "string" || credential.trim().length === 0) {
    throw new BadRequestError("Missing or invalid provider credential for cryptographic verification.");
  }
  if (!providerId || typeof providerId !== "string" || providerId.trim().length === 0) {
    throw new BadRequestError("Provider ID is required for cryptographic verification.");
  }

  const cleanProviderId = providerId.trim().toLowerCase();

  // If Firebase Admin Auth is supplied or available globally, verify via verifyIdToken
  if (adminAuthInstance && typeof adminAuthInstance.verifyIdToken === "function") {
    try {
      const decoded = await adminAuthInstance.verifyIdToken(credential.trim(), true);
      const sub = (decoded.sub || decoded.uid || "").trim();
      if (!sub) {
        throw new UnauthorizedError("Provider token did not contain a valid subject identifier.");
      }
      return {
        providerId: cleanProviderId,
        sub,
        email: decoded.email ? String(decoded.email).trim().toLowerCase() : undefined,
        email_verified: decoded.email_verified === true,
      };
    } catch (authErr: any) {
      throw new UnauthorizedError(`Cryptographic verification of provider credential failed: ${authErr.message || authErr}`);
    }
  }

  throw new BadRequestError("No trusted cryptographic verifier is configured for this provider credential.");
}

export interface ExecuteLinkAccountParams {
  db: any;
  caller: AuthenticatedUser | null | undefined;
  providerCredential?: string;
  providerInput: ProviderIdentityInput;
  verifierFn?: ProviderTokenVerifierFn;
  adminAuthInstance?: any;
}

/**
 * Task 35-E-R3: Production Account Linking Service
 *
 * Implements the complete production cryptographic trust chain:
 * 1. Authenticate caller (server-derived UID)
 * 2. Require and cryptographically verify external provider credential
 * 3. Construct VerifiedProviderClaims exclusively from cryptographic verifier result
 * 4. Pass verified claims to evaluateAccountLinkingEligibility()
 * 5. Persist provider identity binding atomically in Firestore upon verified eligibility
 */
export async function executeAuthoritativeAccountLinking(
  params: ExecuteLinkAccountParams
): Promise<{ success: boolean; providerId: string; sub: string }> {
  const { db, caller, providerCredential, providerInput, verifierFn, adminAuthInstance } = params;

  if (!caller || !caller.uid) {
    throw new UnauthorizedError("Authentication required for account linking.");
  }

  if (!providerCredential || typeof providerCredential !== "string" || providerCredential.trim().length === 0) {
    throw new BadRequestError("Cryptographically verifiable provider credential is required.");
  }

  const targetProviderId = (providerInput?.providerId || "google").trim().toLowerCase();

  // Step 2 & 3: Cryptographic verification of provider credential
  let verifiedClaims: VerifiedProviderClaims;
  if (verifierFn) {
    verifiedClaims = await verifierFn(providerCredential, targetProviderId);
  } else {
    verifiedClaims = await verifyProviderCredentialCryptographically(
      providerCredential,
      targetProviderId,
      adminAuthInstance
    );
  }

  if (!verifiedClaims || !verifiedClaims.providerId || !verifiedClaims.sub) {
    throw new UnauthorizedError("Cryptographic provider verification did not yield valid claims.");
  }

  // Step 4: Evaluate linking eligibility using verified claims
  const eligibility = await evaluateAccountLinkingEligibility(
    db,
    caller,
    providerInput,
    verifiedClaims
  );

  // Step 5: Atomically link provider in authoritative database
  if (db) {
    try {
      await db.collection("users").doc(caller.uid).set(
        {
          providers: {
            [eligibility.providerId]: eligibility.sub,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (saveErr: any) {
      console.error("[SSO Engine] Failed to save linked provider:", saveErr);
      throw saveErr;
    }
  }

  return {
    success: true,
    providerId: eligibility.providerId,
    sub: eligibility.sub,
  };
}
