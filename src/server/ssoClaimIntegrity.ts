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
  verifiedClaims?: VerifiedProviderClaims | null,
  transaction?: any
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

  // Task 35-E-R3/R4: Untrusted/Verified Conflict Defense.
  // If untrusted client claims (providerInput) are supplied and contradict cryptographically
  // verified claims, fail closed immediately. Untrusted claims must never override or spoof verified claims.
  if (providerInput) {
    if (providerInput.providerId && providerInput.providerId.trim().toLowerCase() !== providerId) {
      throw new BadRequestError("Conflicting provider ID between untrusted client input and verified provider claims.");
    }
    if (providerInput.sub && providerInput.sub.trim() !== sub) {
      throw new BadRequestError("Conflicting subject identifier (sub) between untrusted client input and verified provider claims.");
    }
    if (providerInput.email && providerInput.email.trim().toLowerCase() !== targetEmail) {
      throw new BadRequestError("Conflicting email between untrusted client input and verified provider claims.");
    }
    if (providerInput.email_verified === true && verifiedClaims.email_verified !== true) {
      throw new BadRequestError("Conflicting email verification state between untrusted client input and verified provider claims.");
    }
  }

  // Trusted email verification status comes STRICTLY from verifiedClaims, NEVER providerInput.email_verified
  const isEmailCryptographicallyVerified = verifiedClaims.email_verified === true;

  const callerUid = caller.uid;

  if (db) {
    try {
      const getDocs = async (query: any) => {
        if (transaction && typeof transaction.get === "function") {
          return await transaction.get(query);
        }
        return await query.get();
      };

      // 1. Transactional Query: Check if this providerId + sub is already linked to another account
      const existingQuery = db
        .collection("users")
        .where(`providers.${providerId}`, "==", sub)
        .limit(1);

      const existingSnapshot = await getDocs(existingQuery);

      if (existingSnapshot && !existingSnapshot.empty) {
        const linkedDoc = existingSnapshot.docs[0];
        if (linkedDoc.id !== callerUid) {
          throw new ConflictError("This provider identity is already linked to another AnyTrader account.");
        }
      }

      // 2. Transactional Query: Check if targetEmail belongs to another account
      if (targetEmail.length > 0) {
        const emailMatchQuery = db
          .collection("users")
          .where("email", "==", targetEmail)
          .limit(1);

        const emailMatchSnapshot = await getDocs(emailMatchQuery);

        if (emailMatchSnapshot && !emailMatchSnapshot.empty) {
          const emailOwnerDoc = emailMatchSnapshot.docs[0];
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
      if (
        err instanceof ConflictError ||
        err instanceof BadRequestError ||
        err instanceof UnauthorizedError ||
        err instanceof ForbiddenError
      ) {
        throw err;
      }

      console.error(
        "[SSO Engine] Provider linking authorization lookup failed:",
        err
      );

      throw new UnauthorizedError(
        "Unable to establish authoritative provider-linking state."
      );
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
 * Normalizes provider IDs to canonical names (e.g. "google.com" -> "google").
 */
export function normalizeProviderId(rawProviderId?: string | null): string {
  if (!rawProviderId || typeof rawProviderId !== "string") return "";
  const cleaned = rawProviderId.trim().toLowerCase();
  if (cleaned === "google.com" || cleaned === "google") return "google";
  if (cleaned === "apple.com" || cleaned === "apple") return "apple";
  if (cleaned === "github.com" || cleaned === "github") return "github";
  if (cleaned === "facebook.com" || cleaned === "facebook") return "facebook";
  if (cleaned === "microsoft.com" || cleaned === "microsoft") return "microsoft";
  if (cleaned === "twitter.com" || cleaned === "twitter") return "twitter";
  return cleaned.replace(/\.com$/, "");
}

/**
 * Default cryptographic provider credential verifier.
 * Leverages Firebase Admin Auth verifyIdToken for OIDC/Firebase provider tokens,
 * extracting verified provider identity, federated subject, and verified email status.
 */
export async function verifyProviderCredentialCryptographically(
  credential: string,
  expectedProviderId?: string,
  adminAuthInstance?: any
): Promise<VerifiedProviderClaims> {
  if (!credential || typeof credential !== "string" || credential.trim().length === 0) {
    throw new BadRequestError("Missing or invalid provider credential for cryptographic verification.");
  }

  const cleanExpectedProviderId = expectedProviderId ? normalizeProviderId(expectedProviderId) : undefined;

  // If Firebase Admin Auth is supplied or available globally, verify via verifyIdToken
  if (adminAuthInstance && typeof adminAuthInstance.verifyIdToken === "function") {
    try {
      let decoded: any;
      try {
        decoded = await adminAuthInstance.verifyIdToken(credential.trim(), true);
      } catch (err: any) {
        // Fallback for environments with Identity Toolkit API service restrictions or disabled endpoint.
        // SECURITY BOUNDARY DOCUMENTATION:
        // Falling back to verifyIdToken(credential, false) retains full cryptographic authenticity (JWT signature
        // and claims verification via public keys), but token revocation status is NOT guaranteed because the
        // backend Identity Toolkit API check is unreachable/disabled in this execution environment.
        if (
          err?.message?.includes("identitytoolkit.googleapis.com") ||
          err?.code === "auth/internal-error" ||
          err?.message?.includes("SERVICE_DISABLED") ||
          err?.message?.includes("accessNotConfigured") ||
          err?.message?.includes("has not been used in project")
        ) {
          decoded = await adminAuthInstance.verifyIdToken(credential.trim(), false);
        } else {
          throw err;
        }
      }

      if (!decoded) {
        throw new UnauthorizedError("Provider token could not be decoded.");
      }

      // 1. Authoritative Provider ID extraction from token
      const rawSignInProvider = decoded.firebase?.sign_in_provider;
      if (rawSignInProvider === "anonymous" || rawSignInProvider === "password" || rawSignInProvider === "custom") {
        throw new BadRequestError(`Authentication provider '${rawSignInProvider}' cannot be linked as a federated SSO provider.`);
      }

      let detectedProviderId = "";
      if (rawSignInProvider) {
        detectedProviderId = normalizeProviderId(rawSignInProvider);
      } else if (decoded.iss && typeof decoded.iss === "string") {
        if (decoded.iss.includes("accounts.google.com")) {
          detectedProviderId = "google";
        } else if (decoded.iss.includes("appleid.apple.com")) {
          detectedProviderId = "apple";
        } else if (decoded.iss.includes("github.com")) {
          detectedProviderId = "github";
        }
      }

      // Blocker #1 Fix: Provider ID MUST be cryptographically verified from token claims.
      // A client-supplied expectedProviderId can NEVER be a fallback.
      if (!detectedProviderId) {
        throw new BadRequestError("Provider ID could not be cryptographically verified from the credential.");
      }

      // If client supplied expectedProviderId, enforce strict match against detectedProviderId
      if (cleanExpectedProviderId && cleanExpectedProviderId !== detectedProviderId) {
        throw new BadRequestError(
          `Requested provider ID '${cleanExpectedProviderId}' does not match cryptographically verified provider ID '${detectedProviderId}'.`
        );
      }

      const effectiveProviderId = detectedProviderId;

      // 2. Authoritative Subject identifier (sub) extraction
      let sub = "";
      if (rawSignInProvider) {
        const providerIdentity = decoded.firebase?.identities?.[rawSignInProvider];
        if (
          !Array.isArray(providerIdentity) ||
          typeof providerIdentity[0] !== "string" ||
          providerIdentity[0].trim().length === 0
        ) {
          throw new BadRequestError("Cryptographically verified provider subject is unavailable.");
        }
        sub = String(providerIdentity[0]).trim();
      } else {
        // Direct OIDC provider tokens (e.g. Google / Apple ID tokens directly verified via iss)
        sub = (decoded.sub || "").trim();
        if (!sub) {
          throw new BadRequestError("Cryptographically verified provider subject is unavailable.");
        }
      }

      return {
        providerId: effectiveProviderId,
        sub,
        email: decoded.email ? String(decoded.email).trim().toLowerCase() : undefined,
        email_verified: decoded.email_verified === true,
      };
    } catch (authErr: any) {
      if (authErr instanceof BadRequestError || authErr instanceof UnauthorizedError) {
        throw authErr;
      }
      throw new UnauthorizedError(`Cryptographic verification of provider credential failed: ${authErr.message || authErr}`);
    }
  }

  throw new BadRequestError("No trusted cryptographic verifier is configured for this provider credential.");
}

export interface ExecuteLinkAccountParams {
  db: any;
  caller: AuthenticatedUser | null | undefined;
  providerCredential?: string;
  providerInput?: ProviderIdentityInput;
  verifierFn?: ProviderTokenVerifierFn;
  adminAuthInstance?: any;
}

/**
 * Task 35-E-R3/R4/R4-R1: Production Account Linking Service
 *
 * Implements the complete production cryptographic trust chain:
 * 1. Authenticate caller (server-derived UID)
 * 2. Require and cryptographically verify external provider credential
 * 3. Construct VerifiedProviderClaims exclusively from cryptographic verifier result
 * 4. Transactionally evaluate linking eligibility and collision checks
 * 5. Transactionally persist provider identity binding in Firestore
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

  const requestedProviderId = providerInput?.providerId ? normalizeProviderId(providerInput.providerId) : undefined;

  // Step 2 & 3: Cryptographic verification of provider credential
  let verifiedClaims: VerifiedProviderClaims;
  if (verifierFn) {
    verifiedClaims = await verifierFn(providerCredential, requestedProviderId || "");
  } else {
    verifiedClaims = await verifyProviderCredentialCryptographically(
      providerCredential,
      requestedProviderId,
      adminAuthInstance
    );
  }

  if (!verifiedClaims || !verifiedClaims.providerId || !verifiedClaims.sub) {
    throw new UnauthorizedError("Cryptographic provider verification did not yield valid claims.");
  }

  let finalEligibility: { eligible: boolean; providerId: string; sub: string } = {
    eligible: true,
    providerId: verifiedClaims.providerId,
    sub: verifiedClaims.sub,
  };

  // Step 4 & 5: Transactionally check eligibility AND persist provider identity in database
  if (db) {
    try {
      if (typeof db.runTransaction === "function") {
        await db.runTransaction(async (transaction: any) => {
          finalEligibility = await evaluateAccountLinkingEligibility(
            db,
            caller,
            providerInput || {},
            verifiedClaims,
            transaction
          );

          const userRef = db.collection("users").doc(caller.uid);
          const userDoc = await transaction.get(userRef);
          const userData = userDoc && (typeof userDoc.data === "function" ? userDoc.data() : userDoc.data) || {};
          const existingProviders = userData.providers || {};

          transaction.set(
            userRef,
            {
              providers: {
                ...existingProviders,
                [finalEligibility.providerId]: finalEligibility.sub,
              },
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        });
      } else {
        finalEligibility = await evaluateAccountLinkingEligibility(
          db,
          caller,
          providerInput || {},
          verifiedClaims
        );

        await db.collection("users").doc(caller.uid).set(
          {
            providers: {
              [finalEligibility.providerId]: finalEligibility.sub,
            },
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    } catch (saveErr: any) {
      if (
        saveErr instanceof ConflictError ||
        saveErr instanceof BadRequestError ||
        saveErr instanceof UnauthorizedError
      ) {
        throw saveErr;
      }
      console.error("[SSO Engine] Failed to save linked provider:", saveErr);
      throw saveErr;
    }
  }

  return {
    success: true,
    providerId: finalEligibility.providerId,
    sub: finalEligibility.sub,
  };
}
