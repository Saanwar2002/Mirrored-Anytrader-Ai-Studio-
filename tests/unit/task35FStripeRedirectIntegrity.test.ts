import { describe, it, expect, beforeEach } from "vitest";
import { sanitizeRedirectUrl } from "../../src/server/paymentVerification.ts";
import { executeCreateTripPaymentCommand } from "../../src/server/tripPaymentAuthorization.ts";

describe("AnyTrader V8.3 Task 35-F — Stripe Redirect URL Integrity & Origin Defense", () => {
  const AUTHORITATIVE_APP_URL = "https://anytrader.app";

  beforeEach(() => {
    delete process.env.APP_URL;
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
});
