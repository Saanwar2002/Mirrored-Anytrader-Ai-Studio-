import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  generateAuthoritativeSsoToken,
  verifyAuthoritativeSsoToken,
  evaluateAccountLinkingEligibility,
  executeAuthoritativeAccountLinking,
  verifyProviderCredentialCryptographically,
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

  let storeVersion = 0;
  let commitLock: Promise<void> = Promise.resolve();
  let nextTxId = 1;
  const txLog: Array<any> = [];

  function applyWrite(targetStore: Record<string, any>, path: string, data: any, options?: any) {
    if (options?.merge && targetStore[path]) {
      const existing = targetStore[path];
      const merged = { ...existing, ...JSON.parse(JSON.stringify(data)) };
      if (data.providers && existing.providers) {
        merged.providers = { ...existing.providers, ...data.providers };
      }
      targetStore[path] = merged;
    } else {
      const docId = path.split("/").pop();
      targetStore[path] = { id: docId, ...JSON.parse(JSON.stringify(data)) };
    }
  }

  function evalQueryOnStore(targetStore: Record<string, any>, colName: string, field: string, op: string, val: any) {
    return Object.entries(targetStore)
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
  }

  return {
    _store: store,
    _txLog: txLog,
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
              applyWrite(store, path, data, options);
            },
          };
        },
        where(field: string, op: string, val: any) {
          const evalWhere = () => evalQueryOnStore(store, colName, field, op, val);

          return {
            colName,
            field,
            op,
            val,
            limit(max: number) {
              return {
                colName,
                field,
                op,
                val,
                limitMax: max,
                get: async () => {
                  const currentDocs = evalWhere().slice(0, max);
                  return {
                    empty: currentDocs.length === 0,
                    docs: currentDocs.map((d: any) => ({
                      id: d.uid || d.id,
                      data: () => JSON.parse(JSON.stringify(d)),
                    })),
                  };
                },
              };
            },
            get: async () => {
              const currentDocs = evalWhere();
              return {
                empty: currentDocs.length === 0,
                docs: currentDocs.map((d: any) => ({
                  id: d.uid || d.id,
                  data: () => JSON.parse(JSON.stringify(d)),
                })),
              };
            },
          };
        },
      };
    },
    async runTransaction(cb: (tx: any) => Promise<any>) {
      const txId = nextTxId++;
      const maxRetries = 5;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const snapshotVersion = storeVersion;
        const snapshotStore: Record<string, any> = JSON.parse(JSON.stringify(store));
        const pendingWrites: Array<{ path: string; data: any; options?: any }> = [];

        txLog.push({ txId, attempt, event: "TX_START", snapshotVersion });

        const tx = {
          get: async (refOrQuery: any) => {
            // Yield to event loop to simulate realistic async I/O delay and ensure concurrent transactions overlap
            await new Promise((resolve) => setTimeout(resolve, 10));

            if (refOrQuery?.path) {
              const data = snapshotStore[refOrQuery.path];
              txLog.push({ txId, attempt, event: "TX_READ_DOC", path: refOrQuery.path, exists: data !== undefined });
              return {
                id: refOrQuery.id || refOrQuery.path.split("/").pop(),
                exists: data !== undefined && data !== null,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
              };
            }
            if (refOrQuery?.colName && refOrQuery?.field) {
              let docs = evalQueryOnStore(snapshotStore, refOrQuery.colName, refOrQuery.field, refOrQuery.op, refOrQuery.val);
              if (refOrQuery.limitMax !== undefined) {
                docs = docs.slice(0, refOrQuery.limitMax);
              }
              txLog.push({
                txId,
                attempt,
                event: "TX_QUERY",
                query: `${refOrQuery.colName}.${refOrQuery.field} ${refOrQuery.op} ${refOrQuery.val}`,
                resultCount: docs.length,
              });
              return {
                empty: docs.length === 0,
                docs: docs.map((d: any) => ({
                  id: d.uid || d.id,
                  data: () => JSON.parse(JSON.stringify(d)),
                })),
              };
            }
            if (typeof refOrQuery.get === "function") {
              return await refOrQuery.get();
            }
            return refOrQuery;
          },
          set: async (ref: any, data: any, options?: any) => {
            const path = ref.path || `${ref.colName}/${ref.id}`;
            txLog.push({ txId, attempt, event: "TX_STAGE_WRITE", path });
            pendingWrites.push({ path, data, options });
          },
        };

        let result: any;
        try {
          result = await cb(tx);
        } catch (err: any) {
          txLog.push({ txId, attempt, event: "TX_REJECTED", error: err?.name || err?.message });
          throw err;
        }

        let releaseCommit = () => {};
        const commitPromise = new Promise<void>((resolve) => { releaseCommit = resolve; });
        const currentLock = commitLock;
        commitLock = commitLock.then(() => commitPromise);

        await currentLock;
        try {
          if (snapshotVersion !== storeVersion) {
            // OCC conflict! Snapshot is stale because another transaction committed in the interim.
            txLog.push({ txId, attempt, event: "TX_OCC_CONFLICT_RETRY", snapshotVersion, currentStoreVersion: storeVersion });
            continue; // Retry transaction against fresh snapshot version
          }
          // Snapshot is fresh! Apply staged pending writes to live database store
          for (const w of pendingWrites) {
            applyWrite(store, w.path, w.data, w.options);
          }
          storeVersion++;
          txLog.push({ txId, attempt, event: "TX_COMMIT_SUCCESS", newStoreVersion: storeVersion });
          return result;
        } finally {
          releaseCommit();
        }
      }

      throw new ConflictError("Optimistic concurrency conflict: maximum retry attempts exceeded.");
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

  it("Test J — Database lookup infrastructure failure: FAILS CLOSED with UnauthorizedError", async () => {
    const caller = {
      uid: "user_alice",
      email: "alice@example.com",
    };

    const faultyDb = {
      collection: () => {
        throw new Error("PERMISSION_DENIED: Firestore emulator unavailable");
      },
    };

    await expect(
      evaluateAccountLinkingEligibility(
        faultyDb,
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
      )
    ).rejects.toThrow(UnauthorizedError);
  });

  it("Test K — Privilege claims remain server-authoritative: Identity resolution enforces server authority", async () => {
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

  describe("Task 35-E-R3: Production Cryptographic Verification Integration", () => {
    // Trusted cryptographic verifier double for testing production trust chain
    const createTrustedVerifier = (mockVerifiedTokens: Record<string, any>) => {
      return async (credential: string, providerId: string) => {
        const token = mockVerifiedTokens[credential];
        if (!token) {
          throw new UnauthorizedError("Invalid or forged provider credential.");
        }
        return {
          providerId,
          sub: token.sub,
          email: token.email,
          email_verified: token.email_verified === true,
        };
      };
    };

    it("Test R3-A — Missing verified claims: Account linking with no verified provider claims is DENIED", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      // Attempt linking without credential
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "",
          providerInput: { providerId: "google", sub: "google_123" },
        })
      ).rejects.toThrow(BadRequestError);

      // Verify no account link occurred
      expect(mockDb._store["users/user_alice"].providers.google).toBe("google_sub_alice_123");
    });

    it("Test R3-B — Request body cannot create trusted claims: Body fields without cryptographically verified credential are DENIED", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({});

      // Attacker supplies untrusted payload with fake unverified credential
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "forged_invalid_credential_string",
          providerInput: {
            providerId: "attacker-provider",
            sub: "attacker-sub",
            email: "victim@example.com",
            email_verified: true,
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow(UnauthorizedError);

      // Verify attacker did not get provider linked
      expect(mockDb._store["users/attacker_eve"].providers).toBeUndefined();
    });

    it("Test R3-C — Forged 'email_verified': Client supplies email_verified=true but verified claims do not establish ownership", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "valid_cred_unverified_email": {
          sub: "eve_unverified_sub",
          email: "victim@example.com",
          email_verified: false, // Provider verified that email is NOT verified
        },
      });

      // Attacker supplies email_verified=true in client input to try to claim Bob's email
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "valid_cred_unverified_email",
          providerInput: {
            providerId: "google",
            sub: "eve_unverified_sub",
            email: "bob@example.com",
            email_verified: true, // Forged client boolean
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow();

      // Bob's account must remain untouched
      expect(mockDb._store["users/user_bob"].providers.google).toBe("google_sub_bob_456");
    });

    it("Test R3-D — Forged provider subject: Client attempts to substitute sub=another-user-provider-sub", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      // Provider actually verified Eve's own sub
      const trustedVerifier = createTrustedVerifier({
        "eve_real_token": {
          sub: "eve_legit_sub_999",
          email: "eve@example.com",
          email_verified: true,
        },
      });

      // Client attempts to claim Alice's sub in providerInput
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "eve_real_token",
          providerInput: {
            providerId: "google",
            sub: "google_sub_alice_123", // Forged Alice sub in request body
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow(BadRequestError);

      // Alice's provider remains untouched
      expect(mockDb._store["users/user_alice"].providers.google).toBe("google_sub_alice_123");
    });

    it("Test R3-E — Forged provider ID: Client attempts to substitute providerId=another-provider", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "eve_token": {
          sub: "eve_sub_123",
          email: "eve@example.com",
          email_verified: true,
        },
      });

      // Verified providerId is passed to verifier as "google", but client input claims "github"
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "eve_token",
          providerInput: {
            providerId: "github", // Contradicts verified provider
            sub: "eve_sub_123",
          },
          verifierFn: async (cred, prov) => {
            return {
              providerId: "google", // Verified provider is google
              sub: "eve_sub_123",
              email: "eve@example.com",
              email_verified: true,
            };
          },
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R3-F — Forged email: Client substitutes email=victim@example.com while verified claims identify another account", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "eve_cred": {
          sub: "eve_sub_888",
          email: "eve@example.com",
          email_verified: true,
        },
      });

      // Client attempts to claim Bob's email
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "eve_cred",
          providerInput: {
            providerId: "google",
            sub: "eve_sub_888",
            email: "bob@example.com", // Spoofed email in request body
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R3-G — Verified claims positive case: Legitimate cryptographically verified provider credential is ALLOWED", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "alice_valid_github_credential": {
          sub: "github_alice_valid_777",
          email: "alice@example.com",
          email_verified: true,
        },
      });

      const result = await executeAuthoritativeAccountLinking({
        db: mockDb,
        caller,
        providerCredential: "alice_valid_github_credential",
        providerInput: {
          providerId: "github",
          sub: "github_alice_valid_777",
        },
        verifierFn: trustedVerifier,
      });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe("github");
      expect(result.sub).toBe("github_alice_valid_777");

      // Verify persistence in authoritative database
      expect(mockDb._store["users/user_alice"].providers.github).toBe("github_alice_valid_777");
      expect(mockDb._store["users/user_alice"].providers.google).toBe("google_sub_alice_123");
    });

    it("Test R3-H — Untrusted/verified conflict: Conflicting request fields NEVER override verified values and are rejected", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      // 1. Conflicting sub rejected
      await expect(
        evaluateAccountLinkingEligibility(
          mockDb,
          caller,
          {
            providerId: "google",
            sub: "attacker_spoofed_sub", // Conflict with verified sub
          },
          {
            providerId: "google",
            sub: "verified_legit_sub",
            email: "alice@example.com",
            email_verified: true,
          }
        )
      ).rejects.toThrow(BadRequestError);

      // 2. Conflicting providerId rejected
      await expect(
        evaluateAccountLinkingEligibility(
          mockDb,
          caller,
          {
            providerId: "attacker_provider", // Conflict with verified providerId
            sub: "verified_legit_sub",
          },
          {
            providerId: "google",
            sub: "verified_legit_sub",
            email: "alice@example.com",
            email_verified: true,
          }
        )
      ).rejects.toThrow(BadRequestError);

      // 3. Conflicting email rejected
      await expect(
        evaluateAccountLinkingEligibility(
          mockDb,
          caller,
          {
            providerId: "google",
            sub: "verified_legit_sub",
            email: "spoofed_victim@example.com", // Conflict with verified email
          },
          {
            providerId: "google",
            sub: "verified_legit_sub",
            email: "alice@example.com",
            email_verified: true,
          }
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R3-I — Provider collision: Verified provider identity already belonging to another account is DENIED", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "eve_has_alice_cred": {
          sub: "google_sub_alice_123", // Already linked to Alice!
          email: "eve@example.com",
          email_verified: true,
        },
      });

      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "eve_has_alice_cred",
          providerInput: {
            providerId: "google",
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow(ConflictError);

      // Alice's provider link is preserved
      expect(mockDb._store["users/user_alice"].providers.google).toBe("google_sub_alice_123");
    });

    it("Test R3-J — Email collision: Verified provider email belonging to another account is DENIED", async () => {
      const caller = { uid: "attacker_eve", email: "eve@example.com" };

      const trustedVerifier = createTrustedVerifier({
        "eve_with_bob_email": {
          sub: "eve_new_sub_444",
          email: "bob@example.com", // Belongs to user_bob
          email_verified: true,
        },
      });

      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "eve_with_bob_email",
          providerInput: {
            providerId: "google",
          },
          verifierFn: trustedVerifier,
        })
      ).rejects.toThrow(ConflictError);

      // Bob's account is preserved
      expect(mockDb._store["users/user_bob"].providers.google).toBe("google_sub_bob_456");
    });

    it("Test R3-K — Real Firebase Admin verifier abstraction: verifyProviderCredentialCryptographically exercises verifyIdToken", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async (token: string, checkRevoked: boolean) => {
          if (token === "valid_firebase_jwt") {
            return {
              sub: "firebase_verified_sub_123",
              email: "test@example.com",
              email_verified: true,
              firebase: {
                sign_in_provider: "google.com",
                identities: {
                  "google.com": ["firebase_verified_sub_123"],
                },
              },
            };
          }
          throw new Error("Decoding Firebase ID token failed");
        }),
      };

      // 1. Success path through cryptographic verifier
      const claims = await verifyProviderCredentialCryptographically(
        "valid_firebase_jwt",
        "google",
        mockAdminAuth
      );

      expect(mockAdminAuth.verifyIdToken).toHaveBeenCalledWith("valid_firebase_jwt", true);
      expect(claims.providerId).toBe("google");
      expect(claims.sub).toBe("firebase_verified_sub_123");
      expect(claims.email).toBe("test@example.com");
      expect(claims.email_verified).toBe(true);

      // 2. Invalid token path fails closed
      await expect(
        verifyProviderCredentialCryptographically("invalid_jwt", "google", mockAdminAuth)
      ).rejects.toThrow(UnauthorizedError);
    });

    it("Test R4-A — Authoritative Provider ID extraction from token: sign_in_provider='google.com' derives 'google' without client input", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async (token: string) => {
          return {
            sub: "firebase_user_999",
            email: "verified@google.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "google.com",
              identities: {
                "google.com": ["google_federated_sub_12345"],
              },
            },
          };
        }),
      };

      // Call without specifying expectedProviderId
      const claims = await verifyProviderCredentialCryptographically(
        "real_google_jwt",
        undefined,
        mockAdminAuth
      );

      expect(claims.providerId).toBe("google");
      expect(claims.sub).toBe("google_federated_sub_12345");
      expect(claims.email).toBe("verified@google.com");
      expect(claims.email_verified).toBe(true);
    });

    it("Test R4-B — Zero-client-input linking: Request with only providerCredential derives provider and links", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      const mockAdminAuth = {
        verifyIdToken: vi.fn(async (token: string) => {
          return {
            sub: "alice_firebase_id",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "apple.com",
              identities: {
                "apple.com": ["apple_sub_alice_777"],
              },
            },
          };
        }),
      };

      // Call executeAuthoritativeAccountLinking with NO providerInput
      const result = await executeAuthoritativeAccountLinking({
        db: mockDb,
        caller,
        providerCredential: "valid_apple_token",
        adminAuthInstance: mockAdminAuth,
      });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe("apple");
      expect(result.sub).toBe("apple_sub_alice_777");
      expect(mockDb._store["users/user_alice"].providers.apple).toBe("apple_sub_alice_777");
    });

    it("Test R4-C — Conflicting client provider ID rejected: Token is Google but client claims Apple", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      const mockAdminAuth = {
        verifyIdToken: vi.fn(async (token: string) => {
          return {
            sub: "google_user_sub",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "google.com",
            },
          };
        }),
      };

      // Client requests Apple with a Google token -> Must fail closed
      await expect(
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller,
          providerCredential: "google_token",
          providerInput: {
            providerId: "apple", // Conflicts with token's google.com!
          },
          adminAuthInstance: mockAdminAuth,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-D — Non-federated provider rejected: anonymous or password auth cannot link as SSO provider", async () => {
      const mockAdminAuthAnon = {
        verifyIdToken: vi.fn(async () => ({
          sub: "anon_sub_123",
          firebase: { sign_in_provider: "anonymous" },
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically("anon_token", undefined, mockAdminAuthAnon)
      ).rejects.toThrow(BadRequestError);

      const mockAdminAuthPassword = {
        verifyIdToken: vi.fn(async () => ({
          sub: "pwd_sub_123",
          firebase: { sign_in_provider: "password" },
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically("pwd_token", undefined, mockAdminAuthPassword)
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-E — Conflicting client email_verified=true rejected when verified claims do not prove it", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };

      await expect(
        evaluateAccountLinkingEligibility(
          mockDb,
          caller,
          {
            providerId: "google",
            sub: "google_sub_123",
            email_verified: true, // Untrusted client claims true!
          },
          {
            providerId: "google",
            sub: "google_sub_123",
            email: "alice@example.com",
            email_verified: false, // Token claims prove false!
          }
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-F — Transactional persistence: runTransaction used when available for atomic linking", async () => {
      const caller = { uid: "user_alice", email: "alice@example.com" };
      let transactionRun = false;

      const transactionalDb = {
        ...mockDb,
        runTransaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
          transactionRun = true;
          const tx = {
            get: vi.fn(async (ref: any) => ref.get()),
            set: vi.fn(async (ref: any, data: any, opts: any) => ref.set(data, opts)),
          };
          return await cb(tx);
        }),
      };

      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "tx_sub_123",
          firebase: {
            sign_in_provider: "github.com",
            identities: {
              "github.com": ["tx_sub_123"],
            },
          },
        })),
      };

      const result = await executeAuthoritativeAccountLinking({
        db: transactionalDb,
        caller,
        providerCredential: "valid_github_jwt",
        adminAuthInstance: mockAdminAuth,
      });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe("github");
      expect(transactionRun).toBe(true);
      expect(transactionalDb.runTransaction).toHaveBeenCalled();
    });

    it("Test R4-R1-A — Missing verified provider + forged client provider: Token without provider identity cannot be assigned client provider", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "user_sub_no_provider",
          uid: "user_uid_no_provider",
          email: "test@example.com",
          email_verified: true,
          // NO firebase.sign_in_provider or iss!
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically(
          "valid_token_without_provider_identity",
          "github",
          mockAdminAuth
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-R1-B — Missing provider identity with NO client provider: Token without provider identity fails closed", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "user_sub_no_provider",
          uid: "user_uid_no_provider",
          email: "test@example.com",
          email_verified: true,
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically(
          "valid_token_without_provider_identity",
          undefined,
          mockAdminAuth
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-R1-C — Verified provider + matching client provider: ALLOWED and claims.providerId comes from token", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "google_sub_100",
          email: "test@example.com",
          email_verified: true,
          firebase: {
            sign_in_provider: "google.com",
            identities: {
              "google.com": ["google_sub_100"],
            },
          },
        })),
      };

      const claims = await verifyProviderCredentialCryptographically(
        "valid_google_token",
        "google",
        mockAdminAuth
      );

      expect(claims.providerId).toBe("google");
      expect(claims.sub).toBe("google_sub_100");
    });

    it("Test R4-R1-F — Missing federated provider subject in identities: FAILS CLOSED with BadRequestError", async () => {
      const mockAdminAuthMissingIdentities = {
        verifyIdToken: vi.fn(async () => ({
          uid: "firebase_uid_abc123",
          sub: "firebase_uid_abc123",
          email: "test@example.com",
          email_verified: true,
          firebase: {
            sign_in_provider: "github.com",
            identities: {}, // Missing "github.com" array!
          },
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically(
          "github_token_without_identities",
          "github",
          mockAdminAuthMissingIdentities
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-R1-D — Verified provider + conflicting client provider: DENIED", async () => {
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "google_sub_100",
          email: "test@example.com",
          email_verified: true,
          firebase: {
            sign_in_provider: "google.com",
          },
        })),
      };

      await expect(
        verifyProviderCredentialCryptographically(
          "valid_google_token",
          "apple", // Conflicting requested provider
          mockAdminAuth
        )
      ).rejects.toThrow(BadRequestError);
    });

    it("Test R4-R1-E — Genuine concurrent provider-link race: exactly one winner, exactly one ConflictError", async () => {
      const userA = { uid: "user_alice", email: "alice@example.com" };
      const userB = { uid: "attacker_eve", email: "eve@example.com" };

      // Shared verified provider credential claiming github_race_sub_999
      const mockAdminAuth = {
        verifyIdToken: vi.fn(async () => ({
          sub: "user_firebase_id",
          email: "race@example.com",
          email_verified: true,
          firebase: {
            sign_in_provider: "github.com",
            identities: {
              "github.com": ["github_race_sub_999"],
            },
          },
        })),
      };

      // Concurrent link attempts by userA and userB for the SAME credential
      const results = await Promise.allSettled([
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller: userA,
          providerCredential: "shared_race_credential",
          adminAuthInstance: mockAdminAuth,
        }),
        executeAuthoritativeAccountLinking({
          db: mockDb,
          caller: userB,
          providerCredential: "shared_race_credential",
          adminAuthInstance: mockAdminAuth,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Required race assertions:
      // 1. Exactly one operation succeeds
      expect(fulfilled.length).toBe(1);
      // 2. Exactly one operation loses
      expect(rejected.length).toBe(1);
      // 3. Loser receives ConflictError
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      // 4. Final provider binding exists exactly once in store
      const aliceHasBinding = mockDb._store["users/user_alice"]?.providers?.github === "github_race_sub_999";
      const eveHasBinding = mockDb._store["users/attacker_eve"]?.providers?.github === "github_race_sub_999";

      // Exactly 1 winner holds the binding
      expect(aliceHasBinding !== eveHasBinding).toBe(true);
      if (aliceHasBinding) {
        // Winning user is Alice, losing user Eve has no binding
        expect(mockDb._store["users/attacker_eve"]?.providers?.github).toBeUndefined();
      } else {
        // Winning user is Eve, losing user Alice has no binding
        expect(mockDb._store["users/user_alice"]?.providers?.github).toBeUndefined();
      }

      // 5. Transaction log audit verifying genuine Firestore OCC semantics (overlapping transactions & staged writes):
      const txStartEvents = mockDb._txLog.filter((e: any) => e.event === "TX_START" && e.snapshotVersion === 0);
      expect(txStartEvents.length).toBeGreaterThanOrEqual(2); // At least 2 transactions started at initial snapshot v0

      const stageWriteEvents = mockDb._txLog.filter((e: any) => e.event === "TX_STAGE_WRITE");
      expect(stageWriteEvents.length).toBeGreaterThanOrEqual(2); // Staged writes occurred before commit

      const occRetryEvents = mockDb._txLog.filter((e: any) => e.event === "TX_OCC_CONFLICT_RETRY");
      expect(occRetryEvents.length).toBe(1); // Exactly 1 OCC conflict retry occurred due to stale snapshot

      const occRejectedEvents = mockDb._txLog.filter((e: any) => e.event === "TX_REJECTED" && e.error === "ConflictError");
      expect(occRejectedEvents.length).toBe(1); // Retried transaction failed with ConflictError after reading updated state
    });

    describe("Task 35-E-R4-R2: Granular Fail-Closed Infrastructure & Transaction Security Invariants", () => {
      it("Test R4-R2-A1 — Provider collision query failure fails closed: no provider binding persisted", async () => {
        const caller = { uid: "user_alice", email: "alice@example.com" };
        const mockAdminAuth = {
          verifyIdToken: vi.fn(async () => ({
            sub: "user_firebase_id",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "github.com",
              identities: { "github.com": ["github_sub_fail_1"] },
            },
          })),
        };

        const store: Record<string, any> = {
          "users/user_alice": { id: "user_alice", uid: "user_alice", email: "alice@example.com", providers: {} },
        };

        const failingProviderDb = {
          collection: (colName: string) => ({
            doc: (docId: string) => ({
              path: `${colName}/${docId}`,
              get: async () => ({ id: docId, exists: true, data: () => store[`${colName}/${docId}`] }),
            }),
            where: (field: string) => ({
              field,
              limit: () => ({
                field,
                get: async () => {
                  if (field.startsWith("providers.")) {
                    throw new Error("PERMISSION_DENIED: Provider collision query failed");
                  }
                  return { empty: true, docs: [] };
                },
              }),
            }),
          }),
          runTransaction: async (cb: (tx: any) => Promise<any>) => {
            const tx = {
              get: async (refOrQuery: any) => {
                if (refOrQuery?.field?.startsWith("providers.")) {
                  throw new Error("PERMISSION_DENIED: Provider collision query failed in transaction");
                }
                if (refOrQuery?.path) {
                  const data = store[refOrQuery.path];
                  return { id: refOrQuery.id, exists: !!data, data: () => data };
                }
                return { empty: true, docs: [] };
              },
              set: (ref: any, data: any) => {
                store[ref.path] = data;
              },
            };
            return await cb(tx);
          },
        };

        await expect(
          executeAuthoritativeAccountLinking({
            db: failingProviderDb,
            caller,
            providerCredential: "valid_github_credential",
            adminAuthInstance: mockAdminAuth,
          })
        ).rejects.toThrow();

        // Critical Security Assertion: No provider binding persisted
        expect(store["users/user_alice"]?.providers?.github).toBeUndefined();
      });

      it("Test R4-R2-A2 — Email collision query failure fails closed: no provider binding persisted", async () => {
        const caller = { uid: "user_alice", email: "alice@example.com" };
        const mockAdminAuth = {
          verifyIdToken: vi.fn(async () => ({
            sub: "user_firebase_id",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "github.com",
              identities: { "github.com": ["github_sub_fail_2"] },
            },
          })),
        };

        const store: Record<string, any> = {
          "users/user_alice": { id: "user_alice", uid: "user_alice", email: "alice@example.com", providers: {} },
        };

        const failingEmailDb = {
          collection: (colName: string) => ({
            doc: (docId: string) => ({
              path: `${colName}/${docId}`,
              get: async () => ({ id: docId, exists: true, data: () => store[`${colName}/${docId}`] }),
            }),
            where: (field: string) => ({
              field,
              limit: () => ({
                field,
                get: async () => {
                  if (field === "email") {
                    throw new Error("UNAVAILABLE: Email query timeout");
                  }
                  return { empty: true, docs: [] };
                },
              }),
            }),
          }),
          runTransaction: async (cb: (tx: any) => Promise<any>) => {
            const tx = {
              get: async (refOrQuery: any) => {
                if (refOrQuery?.field === "email") {
                  throw new Error("UNAVAILABLE: Email query failed in transaction");
                }
                if (refOrQuery?.path) {
                  const data = store[refOrQuery.path];
                  return { id: refOrQuery.id, exists: !!data, data: () => data };
                }
                return { empty: true, docs: [] };
              },
              set: (ref: any, data: any) => {
                store[ref.path] = data;
              },
            };
            return await cb(tx);
          },
        };

        await expect(
          executeAuthoritativeAccountLinking({
            db: failingEmailDb,
            caller,
            providerCredential: "valid_github_credential",
            adminAuthInstance: mockAdminAuth,
          })
        ).rejects.toThrow();

        // Critical Security Assertion: No provider binding persisted
        expect(store["users/user_alice"]?.providers?.github).toBeUndefined();
      });

      it("Test R4-R2-A3 — Transaction read failure fails closed: no provider binding persisted", async () => {
        const caller = { uid: "user_alice", email: "alice@example.com" };
        const mockAdminAuth = {
          verifyIdToken: vi.fn(async () => ({
            sub: "user_firebase_id",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "github.com",
              identities: { "github.com": ["github_sub_fail_3"] },
            },
          })),
        };

        const store: Record<string, any> = {
          "users/user_alice": { id: "user_alice", uid: "user_alice", email: "alice@example.com", providers: {} },
        };

        const failingReadDb = {
          collection: (colName: string) => ({
            doc: (docId: string) => ({
              path: `${colName}/${docId}`,
              get: async () => ({ id: docId, exists: true, data: () => store[`${colName}/${docId}`] }),
            }),
            where: (field: string) => ({
              field,
              limit: () => ({
                field,
                get: async () => ({ empty: true, docs: [] }),
              }),
            }),
          }),
          runTransaction: async (cb: (tx: any) => Promise<any>) => {
            const tx = {
              get: async (refOrQuery: any) => {
                if (refOrQuery?.path) {
                  throw new Error("INTERNAL: Transaction user doc read error");
                }
                return { empty: true, docs: [] };
              },
              set: (ref: any, data: any) => {
                store[ref.path] = data;
              },
            };
            return await cb(tx);
          },
        };

        await expect(
          executeAuthoritativeAccountLinking({
            db: failingReadDb,
            caller,
            providerCredential: "valid_github_credential",
            adminAuthInstance: mockAdminAuth,
          })
        ).rejects.toThrow();

        // Critical Security Assertion: No provider binding persisted
        expect(store["users/user_alice"]?.providers?.github).toBeUndefined();
      });

      it("Test R4-R2-A4 — Transaction commit failure fails closed: no provider binding persisted", async () => {
        const caller = { uid: "user_alice", email: "alice@example.com" };
        const mockAdminAuth = {
          verifyIdToken: vi.fn(async () => ({
            sub: "user_firebase_id",
            email: "alice@example.com",
            email_verified: true,
            firebase: {
              sign_in_provider: "github.com",
              identities: { "github.com": ["github_sub_fail_4"] },
            },
          })),
        };

        const store: Record<string, any> = {
          "users/user_alice": { id: "user_alice", uid: "user_alice", email: "alice@example.com", providers: {} },
        };

        const failingCommitDb = {
          collection: (colName: string) => ({
            doc: (docId: string) => ({
              path: `${colName}/${docId}`,
              get: async () => ({ id: docId, exists: true, data: () => store[`${colName}/${docId}`] }),
            }),
            where: (field: string) => ({
              field,
              limit: () => ({
                field,
                get: async () => ({ empty: true, docs: [] }),
              }),
            }),
          }),
          runTransaction: async (cb: (tx: any) => Promise<any>) => {
            const tx = {
              get: async (refOrQuery: any) => {
                if (refOrQuery?.path) {
                  return { id: "user_alice", exists: true, data: () => store["users/user_alice"] };
                }
                return { empty: true, docs: [] };
              },
              set: () => {
                // staged write - not committed
              },
            };
            await cb(tx);
            // Fail during commit phase
            throw new Error("ABORTED: Transaction commit lock conflict");
          },
        };

        await expect(
          executeAuthoritativeAccountLinking({
            db: failingCommitDb,
            caller,
            providerCredential: "valid_github_credential",
            adminAuthInstance: mockAdminAuth,
          })
        ).rejects.toThrow();

        // Critical Security Assertion: No provider binding persisted
        expect(store["users/user_alice"]?.providers?.github).toBeUndefined();
      });
    });
  });
});
