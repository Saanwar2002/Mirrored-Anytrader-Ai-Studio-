import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  generateAuthoritativeSsoToken,
  verifyAuthoritativeSsoToken,
  evaluateAccountLinkingEligibility,
} from "../../src/server/ssoClaimIntegrity.ts";
import {
  resolveTrustedCanonicalIdentity,
  resolveCanonicalIdentity,
} from "../../src/server/identity.ts";
import {
  UnauthorizedError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../src/server/httpErrors.ts";

function createMockSsoDb() {
  const store: Record<string, any> = {
    "users/user_alice": {
      uid: "user_alice",
      email: "alice@example.com",
      role: "homeowner",
      tierId: "Standard",
      providers: {
        google: "google_sub_alice_123",
      },
    },
    "users/user_bob": {
      uid: "user_bob",
      email: "bob@example.com",
      role: "tradesperson",
      primaryTrade: "Plumbing",
      category: "Plumbing",
      tierId: "Growth",
      providers: {
        google: "google_sub_bob_456",
      },
    },
    "users/attacker_eve": {
      uid: "attacker_eve",
      email: "eve@example.com",
      role: "consumer",
      tierId: "Standard",
    },
    "users/admin_super": {
      uid: "admin_super",
      email: "admin@example.com",
      role: "admin",
      isAdmin: true,
      tierId: "Enterprise",
    },
  };

  return {
    _store: store,
    collection(colName: string) {
      return {
        doc(docId: string) {
          const path = `${colName}/${docId}`;
          return {
            id: docId,
            path,
            async get() {
              const data = store[path];
              return {
                id: docId,
                exists: data !== undefined && data !== null,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              };
            },
            async set(data: any, options?: any) {
              if (options?.merge && store[path]) {
                store[path] = { ...store[path], ...JSON.parse(JSON.stringify(data)) };
              } else {
                store[path] = { id: docId, ...JSON.parse(JSON.stringify(data)) };
              }
            },
          };
        },
        where(field: string, op: string, val: any) {
          let currentDocs = Object.entries(store)
            .filter(([k]) => k.startsWith(`${colName}/`))
            .map(([_, v]) => v)
            .filter((doc: any) => {
              if (field.startsWith("providers.")) {
                const provKey = field.split(".")[1];
                return doc.providers?.[provKey] === val;
              }
              if (op === "==") return doc[field] === val;
              return true;
            });

          return {
            limit(max: number) {
              return {
                get: async () => ({
                  empty: currentDocs.length === 0,
                  docs: currentDocs.slice(0, max).map((d: any) => ({
                    id: d.uid || d.id,
                    data: () => JSON.parse(JSON.stringify(d)),
                  })),
                }),
              };
            },
            get: async () => ({
              empty: currentDocs.length === 0,
              docs: currentDocs.map((d: any) => ({
                id: d.uid || d.id,
                data: () => JSON.parse(JSON.stringify(d)),
              })),
            }),
          };
        },
      };
    },
  };
}

describe("Task 35-E / 35-E-R1: SSO Claim Integrity & Server-Authoritative Identity", () => {
  const TEST_JWT_SECRET = "super_secure_test_sso_jwt_secret_key_12345";
  let mockDb: ReturnType<typeof createMockSsoDb>;
  let mockConfigFetcher: () => Promise<any>;

  beforeEach(() => {
    mockDb = createMockSsoDb();
    mockConfigFetcher = vi.fn(async () => ({
      feeTiers: [
        { name: "Basic", shopDiscount: 5 },
        { name: "Growth", shopDiscount: 15 },
        { name: "Pro", shopDiscount: 25 },
      ],
      businessTiers: [
        { name: "Standard", shopDiscount: 0 },
        { name: "Enterprise", shopDiscount: 20 },
      ],
    }));
  });

  it("Test A — Verified SSO identity establishes caller: A valid, verified caller generates proper SSO token", async () => {
    const caller = {
      uid: "user_bob",
      email: "bob@example.com",
    };

    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {},
      mockConfigFetcher
    );

    expect(ssoResult.uid).toBe("user_bob");
    expect(ssoResult.email).toBe("bob@example.com");
    expect(ssoResult.role).toBe("tradesperson");
    expect(ssoResult.category).toBe("Plumbing");
    expect(ssoResult.discount).toBe(15);

    // Verify token cryptographically
    const verified = verifyAuthoritativeSsoToken(ssoResult.token, TEST_JWT_SECRET);
    expect(verified.uid).toBe("user_bob");
    expect(verified.role).toBe("tradesperson");
    expect(verified.email).toBe("bob@example.com");
    expect(verified.discount).toBe(15);
    expect(verified.aud).toBe("shop.tradequote.uk");
    expect(verified.iss).toBe("anytrader-auth");
  });

  it("Test B — Forged request UID denied: Authenticated User A supplying userId = User B cannot forge token", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    // Attacker supplies uid/userId of User Bob
    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {
        uid: "user_bob",
        userId: "user_bob",
      },
      mockConfigFetcher
    );

    expect(ssoResult.uid).toBe("attacker_eve");
    expect(ssoResult.email).toBe("eve@example.com");
    expect(ssoResult.role).toBe("consumer");

    const verified = verifyAuthoritativeSsoToken(ssoResult.token, TEST_JWT_SECRET);
    expect(verified.uid).toBe("attacker_eve");
    expect(verified.uid).not.toBe("user_bob");
  });

  it("Test C — Forged email denied: User A supplying User B's email in request cannot forge token claim", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    // Attacker supplies Bob's email
    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {
        email: "bob@example.com",
        userEmail: "bob@example.com",
      },
      mockConfigFetcher
    );

    expect(ssoResult.email).toBe("eve@example.com");

    const verified = verifyAuthoritativeSsoToken(ssoResult.token, TEST_JWT_SECRET);
    expect(verified.email).toBe("eve@example.com");
    expect(verified.email).not.toBe("bob@example.com");
  });

  it("Test D — Forged email_verified denied: Unverified email claims cannot grant account linking or elevation", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    // Eve attempts to link an account with Bob's email with email_verified: false in verifiedClaims
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_new_eve_999",
          email: "bob@example.com",
          email_verified: false,
        },
        {
          providerId: "google",
          sub: "google_sub_new_eve_999",
          email: "bob@example.com",
          email_verified: false, // unverified email
        }
      )
    ).rejects.toThrow(ConflictError);
  });

  it("Test E — Forged role/admin claim denied: Supplying role='admin' in payload is ignored", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {
        role: "admin",
        isAdmin: true,
        discount: 99,
      },
      mockConfigFetcher
    );

    expect(ssoResult.role).toBe("consumer");
    expect(ssoResult.discount).toBe(0);

    const verified = verifyAuthoritativeSsoToken(ssoResult.token, TEST_JWT_SECRET);
    expect(verified.role).toBe("consumer");
    expect(verified.discount).toBe(0);
  });

  it("Test E-R1 — Forged 'email_verified=true' Cannot Claim Another User's Email (R1 Critical)", async () => {
    // Setup: User A = authenticated attacker (attacker_eve), User B = Bob (bob@example.com)
    const attackerCaller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    const initialBobState = JSON.stringify(mockDb._store["users/user_bob"]);

    // Attacker Eve supplies client input with email: "bob@example.com" and email_verified: true
    // but without any cryptographically verified provider claims proving control
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        attackerCaller,
        {
          providerId: "google",
          sub: "google_sub_malicious_claim_777",
          email: "bob@example.com",
          email_verified: true, // Client-supplied forged boolean!
        },
        null // No verified provider claims! -> Fails closed
      )
    ).rejects.toThrow();

    // Assert User B's (Bob's) account remains completely untouched in the database
    expect(JSON.stringify(mockDb._store["users/user_bob"])).toBe(initialBobState);
    expect(mockDb._store["users/user_bob"].providers.google).toBe("google_sub_bob_456");
  });

  it("Test E-R2 — Fail Closed on Missing Verified Claims (R2 Critical)", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    // 1. Missing verified claims (undefined)
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_eve",
          email: "eve@example.com",
        }
      )
    ).rejects.toThrow(BadRequestError);

    // 2. Null verified claims
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_eve",
          email: "eve@example.com",
        },
        null
      )
    ).rejects.toThrow(BadRequestError);

    // 3. Verified claims present with empty providerId/sub
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_eve",
        },
        {
          providerId: "",
          sub: "",
        }
      )
    ).rejects.toThrow(BadRequestError);

    // 4. Untrusted providerInput cannot substitute providerId or sub
    // Even if providerInput has valid strings, empty verifiedClaims fails closed
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_attacker",
        },
        {
          providerId: "google",
          sub: "", // missing in verified claims
        }
      )
    ).rejects.toThrow(BadRequestError);
  });

  it("Test F — Unverified JWT payload cannot authorize: Invalid signature / wrong secret is rejected", () => {
    // Generate token signed with wrong secret
    const fakeToken = jwt.sign(
      { uid: "admin_super", role: "admin" },
      "attacker_fake_secret_key",
      { audience: "shop.tradequote.uk", issuer: "anytrader-auth" }
    );

    expect(() =>
      verifyAuthoritativeSsoToken(fakeToken, TEST_JWT_SECRET)
    ).toThrow(UnauthorizedError);

    // Tampered token payload
    const validToken = jwt.sign(
      { uid: "user_alice", role: "homeowner" },
      TEST_JWT_SECRET,
      { audience: "shop.tradequote.uk", issuer: "anytrader-auth" }
    );
    const tampered = validToken.substring(0, validToken.length - 5) + "abcde";

    expect(() =>
      verifyAuthoritativeSsoToken(tampered, TEST_JWT_SECRET)
    ).toThrow(UnauthorizedError);
  });

  it("Test G — SSO subject substitution denied: Supplying another user's sub or providerId is ignored", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {
        sub: "google_sub_bob_456",
        providerId: "google",
      },
      mockConfigFetcher
    );

    expect(ssoResult.uid).toBe("attacker_eve");
    const verified = verifyAuthoritativeSsoToken(ssoResult.token, TEST_JWT_SECRET);
    expect(verified.uid).toBe("attacker_eve");
  });

  it("Test H — Account-link collision denied: Attempting to link a provider sub already belonging to User A is rejected", async () => {
    const caller = {
      uid: "attacker_eve",
      email: "eve@example.com",
    };

    // Eve attempts to claim Alice's google sub with verified claims
    await expect(
      evaluateAccountLinkingEligibility(
        mockDb,
        caller,
        {
          providerId: "google",
          sub: "google_sub_alice_123", // Already belongs to alice
        },
        {
          providerId: "google",
          sub: "google_sub_alice_123",
          email: "eve@example.com",
          email_verified: true,
        }
      )
    ).rejects.toThrow(ConflictError);
  });

  it("Test I — Verified legitimate SSO flow preserved: Legitimate SSO account linking and token generation pass", async () => {
    const caller = {
      uid: "user_alice",
      email: "alice@example.com",
    };

    // Alice linking a new github provider with cryptographically verified claims
    const linkResult = await evaluateAccountLinkingEligibility(
      mockDb,
      caller,
      {
        providerId: "github",
        sub: "github_sub_alice_789",
      },
      {
        providerId: "github",
        sub: "github_sub_alice_789",
        email: "alice@example.com",
        email_verified: true,
      }
    );

    expect(linkResult.eligible).toBe(true);
    expect(linkResult.providerId).toBe("github");
    expect(linkResult.sub).toBe("github_sub_alice_789");

    // Alice generates SSO token
    const ssoResult = await generateAuthoritativeSsoToken(
      mockDb,
      caller,
      TEST_JWT_SECRET,
      {},
      mockConfigFetcher
    );

    expect(ssoResult.uid).toBe("user_alice");
    expect(ssoResult.role).toBe("homeowner");
  });

  it("Test J — Privilege claims remain server-authoritative: Identity resolution enforces server authority", async () => {
    const requestWithSpoofedBody = {
      auth: {
        uid: "user_alice",
        token: {
          admin: false,
          isAdmin: false,
        },
      },
      body: {
        uid: "admin_super",
        role: "admin",
        isAdmin: true,
        accountType: "admin",
      },
    };

    const identity = await resolveTrustedCanonicalIdentity(requestWithSpoofedBody, async (uid) => {
      return mockDb._store[`users/${uid}`];
    });

    expect(identity.uid).toBe("user_alice");
    expect(identity.accountType).toBe("consumer");
    expect(identity.capabilities).toEqual(["homeowner"]);
  });
});
