process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

import { describe, it, beforeAll, vi, expect } from "vitest";
import * as admin from "firebase-admin";
import { executeAuthoritativeAccountLinking } from "../../src/server/ssoClaimIntegrity.ts";
import { ConflictError } from "../../src/server/httpErrors.ts";

describe("Task 35-E — Real Firestore Emulator Concurrency Suite", () => {
  const PROJECT_ID = "demo-anytrader";
  let db: admin.firestore.Firestore;

  beforeAll(() => {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error("FIRESTORE_EMULATOR_HOST must be configured to run emulator concurrency tests.");
    }
    const appName = "task35e-real-emulator-concurrency-suite";
    const app =
      admin.apps.find((a) => a?.name === appName) ??
      admin.initializeApp({ projectId: PROJECT_ID }, appName);
    db = app.firestore();
  });

  it("1. Real Firestore Emulator Concurrency Vector: Simultaneous account linking for identical provider sub yields exactly 1 winner and 1 ConflictError", async () => {
    const userA = { uid: `alice_real_emu_${Date.now()}`, email: "alice.emu@example.com" };
    const userB = { uid: `eve_real_emu_${Date.now()}`, email: "eve.emu@example.com" };

    // Seed both users in real Firestore emulator
    await db.collection("users").doc(userA.uid).set({
      uid: userA.uid,
      email: userA.email,
      role: "homeowner",
      createdAt: new Date().toISOString(),
    });

    await db.collection("users").doc(userB.uid).set({
      uid: userB.uid,
      email: userB.email,
      role: "consumer",
      createdAt: new Date().toISOString(),
    });

    const sharedSub = `github_emu_sub_${Date.now()}`;

    const mockAdminAuth = {
      verifyIdToken: vi.fn(async () => ({
        sub: "firebase_emu_user_id",
        email: "shared.emu@example.com",
        email_verified: true,
        firebase: {
          sign_in_provider: "github.com",
          identities: {
            "github.com": [sharedSub],
          },
        },
      })),
    };

    // Execute genuine concurrent account linking against real Firestore emulator using db.runTransaction
    const results = await Promise.allSettled([
      executeAuthoritativeAccountLinking({
        db,
        caller: userA,
        providerCredential: "shared_emu_credential",
        adminAuthInstance: mockAdminAuth,
      }),
      executeAuthoritativeAccountLinking({
        db,
        caller: userB,
        providerCredential: "shared_emu_credential",
        adminAuthInstance: mockAdminAuth,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // 1. Exactly 1 winner
    expect(fulfilled.length).toBe(1);
    // 2. Exactly 1 loser
    expect(rejected.length).toBe(1);
    // 3. Loser received ConflictError
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    // 4. Verify in real Firestore emulator that only one user holds the provider binding
    const docA = await db.collection("users").doc(userA.uid).get();
    const docB = await db.collection("users").doc(userB.uid).get();

    const aliceBinding = docA.data()?.providers?.github;
    const eveBinding = docB.data()?.providers?.github;

    expect((aliceBinding === sharedSub) !== (eveBinding === sharedSub)).toBe(true);
    if (aliceBinding === sharedSub) {
      expect(eveBinding).toBeUndefined();
    } else {
      expect(aliceBinding).toBeUndefined();
    }
  });
});
