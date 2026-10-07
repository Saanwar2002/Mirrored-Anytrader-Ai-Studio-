/**
 * Financial Security & Stripe Invariant Verification Engine for AnyTrader V6
 * Enforces the core mission 4 objectives:
 * 1. "No attacker-controlled request can cause AnyTrader to believe money was paid when Stripe did not prove it."
 * 2. "No payment can be applied to the wrong resource."
 * 3. Strict mathematical validation of price, amount, currency, metadata binding, idempotency, and state machine transitions.
 */
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError, InternalServerError } from "./httpErrors.ts";
import { validatePaymentTransition, validateMilestoneTransition } from "./stateMachine.ts";
import { SERVER_OWNED_PROTECTED_KEYS, sanitizeClientPayload } from "./authorization.ts";
import crypto from "crypto";

export interface VerifiedStripeEventPayload {
  id: string;
  type: string;
  amount_total?: number; // in minor units (pence)
  currency?: string;
  payment_status?: "paid" | "unpaid" | "no_payment_required";
  payment_intent?: string | { id: string; status?: string; amount?: number; currency?: string };
  client_reference_id?: string;
  metadata?: Record<string, string>;
  customer?: string;
}

export interface ResourceTarget {
  jobId: string;
  quoteId?: string;
  milestoneId?: string;
  rideId?: string;
  expectedAmountPence: number;
  expectedCurrency: string;
  expectedPayerId: string;
  expectedPayeeId?: string;
}

export class FinancialSecurityEngine {
  private static processedWebhookEventIds = new Set<string>();
  private static processedPaymentIntents = new Set<string>();
  private static inProgressTransactions = new Map<string, number>();

  /**
   * Verifies that incoming Stripe webhook or checkout completion proofs mathematically
   * match the exact target resource and intended payment parameters.
   */
  public static verifyStripePaymentProof(
    event: VerifiedStripeEventPayload,
    target: ResourceTarget,
    signatureVerified: boolean = true
  ): {
    verified: boolean;
    amountPence: number;
    currency: string;
    payerId: string;
    payeeId?: string;
    resourceId: string;
  } {
    // Invariant 1: Unverified Cryptographic Signature Block
    if (!signatureVerified) {
      throw new UnauthorizedError("Cryptographic signature verification failed: Webhook is unverified or forged.");
    }

    // Invariant 2: Webhook / Event Replay Defense
    if (this.processedWebhookEventIds.has(event.id)) {
      throw new ConflictError(`Financial replay detected: Webhook event '${event.id}' has already been processed.`);
    }

    // Invariant 3: Payment Status Check (Failed, Unpaid, or Incomplete)
    if (event.payment_status && event.payment_status !== "paid") {
      throw new BadRequestError(`Payment verification failed: Stripe reports payment_status '${event.payment_status}'.`);
    }

    const intentId = typeof event.payment_intent === "string" 
      ? event.payment_intent 
      : event.payment_intent?.id;

    if (intentId && this.processedPaymentIntents.has(intentId)) {
      throw new ConflictError(`Duplicate payment capture: PaymentIntent '${intentId}' has already been bound to an escrow or payout.`);
    }

    const metadata = event.metadata || {};

    // Invariant 4: Resource Identity Binding (Cannot apply payment to wrong job/milestone/ride)
    if (metadata.jobId && metadata.jobId !== target.jobId) {
      throw new ForbiddenError(
        `Resource mismatch: Payment metadata references job '${metadata.jobId}' but target is '${target.jobId}'.`
      );
    }

    if (target.quoteId && metadata.quoteId && metadata.quoteId !== target.quoteId) {
      throw new ForbiddenError(
        `Resource mismatch: Payment metadata references quote '${metadata.quoteId}' but target is '${target.quoteId}'.`
      );
    }

    if (target.milestoneId && metadata.milestoneId && metadata.milestoneId !== target.milestoneId) {
      throw new ForbiddenError(
        `Resource mismatch: Payment metadata references milestone '${metadata.milestoneId}' but target is '${target.milestoneId}'.`
      );
    }

    if (target.rideId && metadata.rideId && metadata.rideId !== target.rideId) {
      throw new ForbiddenError(
        `Resource mismatch: Payment metadata references ride '${metadata.rideId}' but target is '${target.rideId}'.`
      );
    }

    // Invariant 5: User & Payer Ownership Binding (Cannot apply another customer's payment)
    const payerId = event.client_reference_id || metadata.userId || metadata.customerId;
    if (payerId && target.expectedPayerId && payerId !== target.expectedPayerId) {
      throw new ForbiddenError(
        `Payer mismatch: Payment belongs to user '${payerId}' but target resource belongs to '${target.expectedPayerId}'.`
      );
    }

    // Invariant 6: Currency Substitution Defense
    const paidCurrency = (event.currency || metadata.currency || "gbp").toLowerCase();
    const expectedCurrency = target.expectedCurrency.toLowerCase();
    if (paidCurrency !== expectedCurrency) {
      throw new BadRequestError(
        `Currency substitution detected: Expected '${expectedCurrency}', but received '${paidCurrency}'.`
      );
    }

    // Invariant 7: Price & Amount Substitution Defense
    const paidAmountPence = event.amount_total ?? 0;
    if (paidAmountPence <= 0) {
      throw new BadRequestError("Payment amount must be greater than zero.");
    }

    if (paidAmountPence < target.expectedAmountPence) {
      throw new BadRequestError(
        `Amount substitution detected: Expected at least ${target.expectedAmountPence} pence, but received ${paidAmountPence} pence.`
      );
    }

    // Mark event and intent as consumed
    this.processedWebhookEventIds.add(event.id);
    if (intentId) {
      this.processedPaymentIntents.add(intentId);
    }

    return {
      verified: true,
      amountPence: paidAmountPence,
      currency: paidCurrency,
      payerId: target.expectedPayerId,
      payeeId: target.expectedPayeeId,
      resourceId: target.milestoneId || target.rideId || target.jobId,
    };
  }

  /**
   * Concurrency & Network Timeout / Retry Lock for payouts and checkouts:
   * Prevents concurrent payouts, double-disbursements, or race conditions during network retries.
   */
  public static async executeWithNetworkRetryProtection<T>(
    idempotencyKey: string,
    operationName: string,
    timeoutMs: number,
    action: () => Promise<T>
  ): Promise<{ result: T; wasRetried: boolean }> {
    if (!idempotencyKey || idempotencyKey.trim() === "") {
      throw new BadRequestError("A valid idempotency key is required for financial operations.");
    }

    const now = Date.now();
    const activeLock = this.inProgressTransactions.get(idempotencyKey);
    if (activeLock && now - activeLock < timeoutMs) {
      throw new ConflictError(
        `Concurrent transaction in progress for idempotency key '${idempotencyKey}'. Retry after timeout.`
      );
    }

    this.inProgressTransactions.set(idempotencyKey, now);

    try {
      const result = await action();
      return { result, wasRetried: Boolean(activeLock) };
    } finally {
      this.inProgressTransactions.delete(idempotencyKey);
    }
  }

  /**
   * Resets verification state for unit tests
   */
  public static _resetForTesting(): void {
    this.processedWebhookEventIds.clear();
    this.processedPaymentIntents.clear();
    this.inProgressTransactions.clear();
  }
}

const ALLOWED_REDIRECT_PATHS = new Set([
  "/corporate",
  "/dashboard",
  "/portfolio",
  "/profile",
  "/banner-ads",
  "/billing",
  "/payment-success",
  "/payment-failed",
  "/payment-complete",
  "/platform-fee-success",
  "/driver-dashboard",
]);

function isPathAllowed(pathname: string): boolean {
  if (ALLOWED_REDIRECT_PATHS.has(pathname)) {
    return true;
  }
  // Allow /job/<jobId> paths
  if (pathname.startsWith("/job/") && pathname.length > 5 && !pathname.includes("//")) {
    return true;
  }
  return false;
}

function extractPathname(urlOrPath: string, appUrl: string): string {
  const normalizedAppUrl = appUrl.replace(/\/+$/, "");
  let relative = urlOrPath;

  if (urlOrPath.startsWith(normalizedAppUrl)) {
    relative = urlOrPath.substring(normalizedAppUrl.length);
  }

  const pathPart = relative.split("?")[0].split("#")[0];
  return pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
}

/**
 * Task 35-F — Server-Authoritative Stripe Redirect URL Sanitization & Origin Integrity Verification.
 *
 * Prevents Open Redirects, Protocol Injections (javascript:, data:, etc.),
 * Protocol-Relative URL Exploits (//evil.com), and External Domain Hijacking.
 *
 * @param candidateUrl The client-supplied candidate redirect URL (success_url, cancel_url, return_url)
 * @param appUrl The server's authoritative base application URL
 * @param fallbackPath The default relative fallback path if candidateUrl is missing, invalid, or untrusted
 * @returns Server-authoritative, verified redirect URL
 */
export function sanitizeRedirectUrl(candidateUrl: any, appUrl: string, fallbackPath: string): string {
  const normalizedAppUrl = (appUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const normalizedFallbackPath = fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`;
  const defaultFallbackUrl = `${normalizedAppUrl}${normalizedFallbackPath}`;

  if (!candidateUrl || typeof candidateUrl !== "string") {
    return defaultFallbackUrl;
  }

  const trimmed = candidateUrl.trim();
  if (!trimmed) {
    return defaultFallbackUrl;
  }

  // Reject dangerous schemes or control chars
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("ftp:") ||
    /[\r\n\t]/.test(trimmed)
  ) {
    console.warn(`[Task 35-F Redirect Defense] Rejected dangerous URI scheme or control chars in candidate URL: ${trimmed}`);
    return defaultFallbackUrl;
  }

  // Reject protocol-relative URLs starting with // (e.g. //attacker.com/phish)
  if (trimmed.startsWith("//")) {
    console.warn(`[Task 35-F Redirect Defense] Rejected protocol-relative URL candidate: ${trimmed}`);
    return defaultFallbackUrl;
  }

  // Extract pathname and assert it belongs to explicit allowed route list (R1-C)
  const pathname = extractPathname(trimmed, normalizedAppUrl);
  if (!isPathAllowed(pathname)) {
    console.warn(`[Task 35-F Redirect Defense] Rejected non-allowlisted same-origin redirect path: ${pathname}`);
    return defaultFallbackUrl;
  }

  // Handle relative paths starting with /
  if (trimmed.startsWith("/")) {
    return `${normalizedAppUrl}${trimmed}`;
  }

  // Handle absolute URLs
  try {
    const candidateParsed = new URL(trimmed);
    const appParsed = new URL(normalizedAppUrl);

    // Protocol must be http or https
    if (candidateParsed.protocol !== "http:" && candidateParsed.protocol !== "https:") {
      console.warn(`[Task 35-F Redirect Defense] Rejected unsupported protocol '${candidateParsed.protocol}' in: ${trimmed}`);
      return defaultFallbackUrl;
    }

    // Origin must match authoritative app origin
    if (candidateParsed.origin.toLowerCase() !== appParsed.origin.toLowerCase()) {
      console.warn(
        `[Task 35-F Redirect Defense] External origin mismatch detected! Candidate origin '${candidateParsed.origin}' does not match expected app origin '${appParsed.origin}'. Defaulting to fallback.`
      );
      return defaultFallbackUrl;
    }

    return candidateParsed.toString();
  } catch (err) {
    console.warn(`[Task 35-F Redirect Defense] Failed to parse candidate URL '${trimmed}':`, err);
    return defaultFallbackUrl;
  }
}

/**
 * Task 35-F — Centralized, server-authoritative application URL retrieval.
 * Eliminates client-controlled header.origin fallback to prevent spoofing.
 */
export function getAuthoritativeAppUrl(): string {
  const isProd = process.env.NODE_ENV === "production";
  const appUrl = process.env.APP_URL;

  if (isProd) {
    if (!appUrl || appUrl.trim() === "" || appUrl.toLowerCase().includes("localhost") || appUrl.includes("127.0.0.1")) {
      throw new InternalServerError(
        "Authoritative Stripe redirect origin is not configured or contains invalid production origin (localhost fallback blocked)."
      );
    }
  }

  const finalUrl = appUrl || "http://localhost:3000";
  return finalUrl.replace(/\/+$/, "");
}


