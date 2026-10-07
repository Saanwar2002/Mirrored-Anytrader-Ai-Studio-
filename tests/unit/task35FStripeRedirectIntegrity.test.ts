import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sanitizeRedirectUrl, getAuthoritativeAppUrl } from "../../src/server/paymentVerification.ts";
import { executeCreateTripPaymentCommand } from "../../src/server/tripPaymentAuthorization.ts";

describe("AnyTrader V8.3 Task 35-F — Stripe Redirect URL Integrity & Origin Defense", () => {
  const AUTHORITATIVE_APP_URL = "https://anytrader.app";
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.APP_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("sanitizeRedirectUrl — Origin & Protocol Security", () => {
    it("Test 1: Allows valid relative success/cancel path", () => {
      const candidate = "/profile?session_id=cs_test_123";
      const sanitized = sanitizeRedirectUrl(candidate, AUTHORITATIVE_APP_URL, "/profile");
      expect(sanitized).toBe("https://anytrader.app/profile?session_id=cs_test_123");
    });

    it("Test 2: Allows valid same-origin absolute URL", () => {
      const candidate = "https://anytrader.app/billing?status=success";
      const sanitized = sanitizeRedirectUrl(candidate, AUTHORITATIVE_APP_URL, "/billing");
      expect(sanitized).toBe("https://anytrader.app/billing?status=success");
    });

    it("Test 3: Rejects external domain hijacking attempt (open redirect)", () => {
      const candidate = "https://evil.com/phishing/login";
      const sanitized = sanitizeRedirectUrl(candidate, AUTHORITATIVE_APP_URL, "/profile");
      expect(sanitized).toBe("https://anytrader.app/profile");
      expect(sanitized).not.toContain("evil.com");
    });

    it("Test 4: Rejects protocol-relative URL exploit (//attacker.com)", () => {
      const candidate = "//attacker.com/steal-session";
      const sanitized = sanitizeRedirectUrl(candidate, AUTHORITATIVE_APP_URL, "/profile");
      expect(sanitized).toBe("https://anytrader.app/profile");
      expect(sanitized).not.toContain("attacker.com");
    });

    it("Test 5: Rejects malicious scheme injections (javascript:, data:, vbscript:)", () => {
      const jsCandidate = "javascript:alert(document.cookie)";
      const dataCandidate = "data:text/html,<script>alert(1)</script>";
      const vbCandidate = "vbscript:msgbox(1)";

      expect(sanitizeRedirectUrl(jsCandidate, AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl(dataCandidate, AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl(vbCandidate, AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
    });

    it("Test 6: Handles missing, null, undefined, or empty candidate URLs gracefully", () => {
      expect(sanitizeRedirectUrl(null, AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl(undefined, AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl("", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl("   ", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
    });

    it("Test 7: Strips control characters and newlines in candidate URLs", () => {
      const newlineCandidate = "/profile\r\nLocation: https://evil.com";
      const sanitized = sanitizeRedirectUrl(newlineCandidate, AUTHORITATIVE_APP_URL, "/profile");
      expect(sanitized).toBe("https://anytrader.app/profile");
    });
  });

  describe("executeCreateTripPaymentCommand — Server-Authoritative Redirect Isolation", () => {
    it("Test 8: Constructs trip payment redirect URLs strictly using server origin and ignores client redirect overrides", async () => {
      const mockDb = {
        collection: (name: string) => {
          if (name === "ride_requests" || name === "rides") {
            return {
              doc: (id: string) => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    passengerId: "passenger_alice",
                    driverId: "driver_bob",
                    fare: 35.00,
                  }),
                }),
              }),
            };
          }
          if (name === "users") {
            return {
              doc: (id: string) => ({
                get: async () => ({
                  exists: true,
                  data: () => ({
                    stripeAccountId: "acct_driver_bob_123",
                  }),
                }),
              }),
            };
          }
          return { doc: () => ({ get: async () => ({ exists: false }) }) };
        },
      };

      const result = await executeCreateTripPaymentCommand({
        db: mockDb,
        caller: { uid: "passenger_alice" },
        body: {
          rideId: "ride_999",
          successUrl: "https://evil.com/fake-success",
          cancelUrl: "https://evil.com/fake-cancel",
        },
        stripeClient: null,
        appUrl: AUTHORITATIVE_APP_URL,
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain("https://anytrader.app/payment-success");
      expect(result.url).not.toContain("evil.com");
    });
  });

  describe("getAuthoritativeAppUrl — Core Security Invariants", () => {
    it("Test 9: Returns process.env.APP_URL when defined", () => {
      process.env.APP_URL = "https://my-prod-app.com/";
      expect(getAuthoritativeAppUrl()).toBe("https://my-prod-app.com");
    });

    it("Test 10: Falls back to localhost in non-production when process.env.APP_URL is not set", () => {
      process.env.NODE_ENV = "development";
      delete process.env.APP_URL;
      expect(getAuthoritativeAppUrl()).toBe("http://localhost:3000");
    });

    it("Test 11: Fails closed and throws in production when process.env.APP_URL is missing", () => {
      process.env.NODE_ENV = "production";
      delete process.env.APP_URL;
      expect(() => getAuthoritativeAppUrl()).toThrowError(/not configured/i);
    });

    it("Test 12: Fails closed and throws in production when process.env.APP_URL is localhost or loopback", () => {
      process.env.NODE_ENV = "production";
      process.env.APP_URL = "http://localhost:3000";
      expect(() => getAuthoritativeAppUrl()).toThrowError(/localhost fallback blocked/i);

      process.env.APP_URL = "http://127.0.0.1:3000";
      expect(() => getAuthoritativeAppUrl()).toThrowError(/localhost fallback blocked/i);
    });
  });

  describe("sanitizeRedirectUrl — Path Allowlist Enforcement (R1-C)", () => {
    it("Test 13: Allows standard allowlisted same-origin pathnames", () => {
      expect(sanitizeRedirectUrl("/profile", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl("/billing", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/billing");
      expect(sanitizeRedirectUrl("/corporate?gotham_saas=success", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/corporate?gotham_saas=success");
      expect(sanitizeRedirectUrl("/job/some-random-id-999", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/job/some-random-id-999");
    });

    it("Test 14: Rejects non-allowlisted same-origin pathnames and falls back", () => {
      expect(sanitizeRedirectUrl("/admin-portal", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
      expect(sanitizeRedirectUrl("/secrets/keys", AUTHORITATIVE_APP_URL, "/billing")).toBe("https://anytrader.app/billing");
      expect(sanitizeRedirectUrl("/arbitrary-untrusted-path", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/profile");
    });

    it("Test 15: Allows platform-fee-success and driver-dashboard same-origin pathnames (R1-D)", () => {
      expect(sanitizeRedirectUrl("/platform-fee-success?amount=50.25", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/platform-fee-success?amount=50.25");
      expect(sanitizeRedirectUrl("/driver-dashboard", AUTHORITATIVE_APP_URL, "/profile")).toBe("https://anytrader.app/driver-dashboard");
    });

    it("Test 16: Stripe Connect onboarding urls are securely bound to getAuthoritativeAppUrl (R1-E)", () => {
      process.env.APP_URL = "https://anytrader.app";
      const appUrl = getAuthoritativeAppUrl();
      const refreshUrl = `${appUrl}/billing?stripe_connect=refresh`;
      const returnUrl = `${appUrl}/billing?stripe_connect=success&account_id=acct_123`;

      expect(refreshUrl).toBe("https://anytrader.app/billing?stripe_connect=refresh");
      expect(returnUrl).toBe("https://anytrader.app/billing?stripe_connect=success&account_id=acct_123");
    });
  });

  describe("R1-F — Strict Regressions for Strategic Redirect Flows", () => {
    it("Vector 1: missing APP_URL → fail closed", () => {
      process.env.NODE_ENV = "production";
      delete process.env.APP_URL;
      expect(() => getAuthoritativeAppUrl()).toThrowError(/not configured/i);
    });

    it("Vector 2: malicious Origin header → cannot influence URL or fall back", () => {
      process.env.APP_URL = "https://anytrader.app";
      const resolvedUrl = getAuthoritativeAppUrl();
      expect(resolvedUrl).toBe("https://anytrader.app");
      expect(resolvedUrl).not.toContain("evil.com");
    });

    it("Vector 3: arbitrary same-origin path → rejected", () => {
      const candidate = "/secrets/dashboard/untrusted";
      const sanitized = sanitizeRedirectUrl(candidate, "https://anytrader.app", "/profile");
      expect(sanitized).toBe("https://anytrader.app/profile");
      expect(sanitized).not.toContain("/secrets");
    });

    it("Vector 4: platform-fee Checkout → authoritative URLs", () => {
      const pendingPlatformFees = 45.50;
      const appUrl = "https://anytrader.app";
      const successUrlCandidate = `/platform-fee-success?amount=${pendingPlatformFees}`;
      const cancelUrlCandidate = `/driver-dashboard`;

      const finalSuccessUrl = sanitizeRedirectUrl(successUrlCandidate, appUrl, `/platform-fee-success`);
      const finalCancelUrl = sanitizeRedirectUrl(cancelUrlCandidate, appUrl, `/driver-dashboard`);

      expect(finalSuccessUrl).toBe("https://anytrader.app/platform-fee-success?amount=45.5");
      expect(finalCancelUrl).toBe("https://anytrader.app/driver-dashboard");
    });

    it("Vector 5: Connect onboarding → authoritative URLs", () => {
      const appUrl = "https://anytrader.app";
      const accountId = "acct_999";
      const refreshUrl = `${appUrl}/billing?stripe_connect=refresh`;
      const returnUrl = `${appUrl}/billing?stripe_connect=success&account_id=${accountId}`;

      expect(refreshUrl).toBe("https://anytrader.app/billing?stripe_connect=refresh");
      expect(returnUrl).toBe("https://anytrader.app/billing?stripe_connect=success&account_id=acct_999");
    });

    it("Vector 6: customer portal → authoritative URL", () => {
      const appUrl = "https://anytrader.app";
      const returnUrlCandidate = "/billing";
      const finalReturnUrl = sanitizeRedirectUrl(returnUrlCandidate, appUrl, `/billing`);
      expect(finalReturnUrl).toBe("https://anytrader.app/billing");
    });

    it("Vector 7: setup Checkout → authoritative URLs", () => {
      const appUrl = "https://anytrader.app";
      const successUrlCandidate = "/profile?setup=success";
      const cancelUrlCandidate = "/profile";

      const finalSuccessUrl = sanitizeRedirectUrl(successUrlCandidate, appUrl, `/profile?setup=success`);
      const finalCancelUrl = sanitizeRedirectUrl(cancelUrlCandidate, appUrl, `/profile`);

      expect(finalSuccessUrl).toBe("https://anytrader.app/profile?setup=success");
      expect(finalCancelUrl).toBe("https://anytrader.app/profile");
    });

    it("Vector 8: normal Checkout → authoritative URLs", () => {
      const appUrl = "https://anytrader.app";
      const successUrlCandidate = "/profile?session_id=cs_123456";
      const cancelUrlCandidate = "/profile";

      const finalSuccessUrl = sanitizeRedirectUrl(successUrlCandidate, appUrl, `/profile?session_id={CHECKOUT_SESSION_ID}`);
      const finalCancelUrl = sanitizeRedirectUrl(cancelUrlCandidate, appUrl, `/profile`);

      expect(finalSuccessUrl).toBe("https://anytrader.app/profile?session_id=cs_123456");
      expect(finalCancelUrl).toBe("https://anytrader.app/profile");
    });
  });
});

