process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";

import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import * as admin from "firebase-admin";
import { executeCreateJobCommand } from "../../src/server/createJobCommand.ts";
import { executeQuoteCommand } from "../../src/server/quoteCommands.ts";
import { executeJobLifecycleCommand } from "../../src/server/jobLifecycleCommands.ts";
import { ForbiddenError, ConflictError } from "../../src/server/httpErrors.ts";
import { CanonicalIdentity } from "../../src/server/identity.ts";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
} from "firebase/firestore";
import {
  ref,
  getBytes,
  uploadBytes,
  deleteObject,
} from "firebase/storage";
import * as fs from "fs";
import * as path from "path";

describe("Comprehensive Firebase Security Rules Regression Suite (Firestore & Storage)", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-anytrader";
  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), "firestore.rules"), "utf-8");
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), "storage.rules"), "utf-8");

  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: firestoreRules,
          host: "127.0.0.1",
          port: 8088,
        },
        storage: {
          rules: storageRules,
          host: "127.0.0.1",
          port: 9199,
        },
      });
    } catch (err) {
      console.error("FATAL ERROR: Failed to initialize Firebase emulator test environment!", err);
      throw err; // Fail the process
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (!testEnv) {
      throw new Error("FATAL ERROR: Firebase testEnv not initialized!");
    }
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
  });

  // ==========================================
  // CATEGORY 1: FIRESTORE JOB SECURITY & PRIVACY
  // ==========================================
  describe("Category 1: Firestore Private Jobs Security & Privacy", () => {
    const seedPrivateJob = async (jobId: string, homeownerId: string, traderId?: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", jobId), {
          id: jobId,
          homeownerId: homeownerId,
          userId: homeownerId,
          title: "Private Boiler Repair",
          description: "Secret Home details at 123 High Street",
          fullAddress: "123 High Street, London, SW1A 1AA",
          postcode: "SW1A 1AA",
          status: "open",
          acceptedTradespersonId: traderId || null,
          tradespersonId: traderId || null,
          payoutStatus: "pending",
          payoutTransferred: false,
          budget: 500,
        });
      });
    };

    it("1. Anonymous access to private Jobs fails", async () => {
      await seedPrivateJob("job_private_1", "user_alice");
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "jobs", "job_private_1")));
    });

    it("2. Anonymous listing of private Jobs fails", async () => {
      await seedPrivateJob("job_private_1", "user_alice");
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDocs(collection(unauthDb, "jobs")));
    });

    it("3. User A cannot read User B's Job", async () => {
      await seedPrivateJob("job_private_b", "user_bob");
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(getDoc(doc(userADb, "jobs", "job_private_b")));
    });

    it("4. User A cannot list User B's Jobs", async () => {
      await seedPrivateJob("job_private_b1", "user_bob");
      await seedPrivateJob("job_private_b2", "user_bob");
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      const q = query(collection(userADb, "jobs"), where("homeownerId", "==", "user_bob"));
      await assertFails(getDocs(q));
    });

    it("5. Job owner can read their Job", async () => {
      await seedPrivateJob("job_private_a", "user_alice");
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertSucceeds(getDoc(doc(userADb, "jobs", "job_private_a")));
    });

    it("6. Authorized tradesperson can read assigned Job", async () => {
      await seedPrivateJob("job_assigned_trader", "user_alice", "trader_tom");
      const traderDb = testEnv.authenticatedContext("trader_tom").firestore();
      await assertSucceeds(getDoc(doc(traderDb, "jobs", "job_assigned_trader")));
    });

    it("7. Unauthorized tradesperson cannot read Job", async () => {
      await seedPrivateJob("job_assigned_trader", "user_alice", "trader_tom");
      const unauthTraderDb = testEnv.authenticatedContext("trader_eve").firestore();
      await assertFails(getDoc(doc(unauthTraderDb, "jobs", "job_assigned_trader")));
    });

    it("8. Admin access works on private jobs", async () => {
      await seedPrivateJob("job_private_a", "user_alice");
      const adminDb = testEnv.authenticatedContext("admin_user", { role: "admin", isAdmin: true }).firestore();
      await assertSucceeds(getDoc(doc(adminDb, "jobs", "job_private_a")));
      await assertSucceeds(getDocs(collection(adminDb, "jobs")));
    });

    it("8b. Direct client job creation is denied (Task 2: server-authoritative command required)", async () => {
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(
        setDoc(doc(userADb, "jobs", "direct_client_job_fail"), {
          title: "Bypassed Client Job",
          homeownerId: "user_alice",
          status: "open",
          category: "Plumbing",
        })
      );
    });

    it("9. Public job projection is readable anonymously", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "public_job_cards", "pub_card_1"), {
          id: "pub_card_1",
          title: "Public Plumbing Discovery",
          category: "Plumbing",
          postcodeArea: "SW1A",
          status: "open",
        });
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "public_job_cards", "pub_card_1")));
      await assertSucceeds(getDocs(collection(unauthDb, "public_job_cards")));
    });

    it("10. Public job projection cannot be written by ordinary clients", async () => {
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(
        setDoc(doc(userADb, "public_job_cards", "pub_card_forged"), {
          id: "pub_card_forged",
          title: "Forged Public Card",
          category: "Plumbing",
          homeownerId: "user_alice", // Prohibited PII field in public cards
        })
      );
    });

    it("11. Unauthorized ownership changes fail", async () => {
      await seedPrivateJob("job_owner_test", "user_alice");
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      // Client cannot mutate homeownerId / userId
      await assertFails(
        updateDoc(doc(userADb, "jobs", "job_owner_test"), {
          homeownerId: "user_attacker",
        })
      );
    });

    it("12. Unauthorized participant changes fail", async () => {
      await seedPrivateJob("job_participant_test", "user_alice", "trader_tom");
      const traderEveDb = testEnv.authenticatedContext("trader_eve").firestore();
      await assertFails(
        updateDoc(doc(traderEveDb, "jobs", "job_participant_test"), {
          acceptedTradespersonId: "trader_eve",
        })
      );
    });

    it("13. Financial field tampering fails", async () => {
      await seedPrivateJob("job_financial_test", "user_alice", "trader_tom");
      const traderTomDb = testEnv.authenticatedContext("trader_tom").firestore();
      // Trader attempting to modify price or budget
      await assertFails(
        updateDoc(doc(traderTomDb, "jobs", "job_financial_test"), {
          budget: 99999,
          amount: 99999,
        })
      );
    });

    it("14. Payout field tampering fails", async () => {
      await seedPrivateJob("job_payout_test", "user_alice", "trader_tom");
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      const traderTomDb = testEnv.authenticatedContext("trader_tom").firestore();

      // Neither homeowner nor trader can mark payoutStatus as transferred
      await assertFails(
        updateDoc(doc(userADb, "jobs", "job_payout_test"), {
          payoutStatus: "transferred",
          payoutTransferred: true,
        })
      );
      await assertFails(
        updateDoc(doc(traderTomDb, "jobs", "job_payout_test"), {
          payoutStatus: "transferred",
          payoutTransferred: true,
        })
      );
    });

    it("15. Verification/trust field tampering fails", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "users", "user_alice"), {
          id: "user_alice",
          name: "Alice",
          role: "customer",
          verified: false,
          isAdmin: false,
        });
      });

      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      // User cannot escalate verification or admin status
      await assertFails(
        updateDoc(doc(userADb, "users", "user_alice"), {
          verified: true,
          isAdmin: true,
          role: "admin",
        })
      );
    });

    it("15b. Owner CAN delete unassigned, unfunded, non-disputed open job", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_deletable_test"), {
          id: "job_deletable_test",
          homeownerId: "user_alice",
          status: "open",
          funded: false,
          isPaid: false,
          escrowBalance: 0,
          amountPaid: 0,
          escrowStatus: "none",
        });
      });

      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertSucceeds(deleteDoc(doc(userADb, "jobs", "job_deletable_test")));
    });

    it("15c. Owner CANNOT delete funded job or job holding escrow (prevents orphaned escrow)", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_funded_test"), {
          id: "job_funded_test",
          homeownerId: "user_alice",
          status: "open",
          funded: true,
          isPaid: true,
          escrowBalance: 500,
          escrowStatus: "held",
        });
      });

      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(deleteDoc(doc(userADb, "jobs", "job_funded_test")));
    });

    it("15d. Owner CANNOT delete job with assigned/accepted tradesperson", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_assigned_test"), {
          id: "job_assigned_test",
          homeownerId: "user_alice",
          status: "open",
          acceptedTradespersonId: "trader_tom",
          funded: false,
          isPaid: false,
        });
      });

      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(deleteDoc(doc(userADb, "jobs", "job_assigned_test")));
    });

    it("15e. Owner CANNOT delete job with active dispute (preserves dispute evidence)", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_disputed_test"), {
          id: "job_disputed_test",
          homeownerId: "user_alice",
          status: "disputed",
          disputeStatus: "opened",
          disputedAt: new Date().toISOString(),
          funded: false,
        });
      });

      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      await assertFails(deleteDoc(doc(userADb, "jobs", "job_disputed_test")));
    });

    it("15f. Unauthorized attacker CANNOT delete another user's job", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_attacker_delete_test"), {
          id: "job_attacker_delete_test",
          homeownerId: "user_alice",
          status: "open",
          funded: false,
          isPaid: false,
        });
      });

      const attackerDb = testEnv.authenticatedContext("user_attacker").firestore();
      await assertFails(deleteDoc(doc(attackerDb, "jobs", "job_attacker_delete_test")));
    });
  });

  // ==========================================
  // CATEGORY 2: FIRESTORE PROPERTY SECURITY
  // ==========================================
  describe("Category 2: Firestore Private Properties Security & Privacy", () => {
    const seedPrivateProperty = async (propertyId: string, ownerId: string, tenantEmail?: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "properties", propertyId), {
          id: propertyId,
          ownerId: ownerId,
          userId: ownerId,
          name: "Private Manor",
          address: {
            line1: "42 Secret Lane",
            postcode: "NW1 4NP",
            city: "London",
          },
          tenantEmail: tenantEmail || null,
          componentRegistry: {
            stopcockLocation: "Behind kitchen kickboard",
            fuseboxLocation: "Basement under stairs",
          },
          insurancePolicy: "POL-999-SECRET",
        });
      });
    };

    it("15A. Authenticated homeowners cannot bypass the server-only property creation command", async () => {
      const ownerDb = testEnv.authenticatedContext("user_property_creator", { role: "customer" }).firestore();
      await assertFails(setDoc(doc(ownerDb, "properties", "client_created_property"), {
        ownerId: "user_property_creator",
        userId: "user_property_creator",
        name: "Client-side bypass attempt",
        address: { line1: "1 Test Street", city: "London", postcode: "N1 1AA" },
        propertyType: "residential",
        status: "active",
      }));
    });

    it("15B. Property owners cannot bypass quota accounting by deleting directly", async () => {
      await seedPrivateProperty("prop_delete_via_command", "user_property_creator");
      const ownerDb = testEnv.authenticatedContext("user_property_creator", { role: "customer" }).firestore();
      await assertFails(deleteDoc(doc(ownerDb, "properties", "prop_delete_via_command")));
    });

    it("15C. A transfer recipient cannot change property ownership directly", async () => {
      await seedPrivateProperty("prop_transfer_via_command", "user_previous_owner");
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "properties", "prop_transfer_via_command"), {
          transferStatus: "pending",
          pendingTransferToUid: "user_transfer_recipient",
        });
      });
      const recipientDb = testEnv.authenticatedContext("user_transfer_recipient").firestore();
      await assertFails(updateDoc(doc(recipientDb, "properties", "prop_transfer_via_command"), {
        ownerId: "user_transfer_recipient",
        userId: "user_transfer_recipient",
        transferStatus: "completed",
        transferClaimedByUid: "user_transfer_recipient",
      }));
    });

    it("15D. Property owners cannot forge or modify server-managed transfer metadata", async () => {
      await seedPrivateProperty("prop_transfer_metadata_guard", "user_transfer_owner");
      const ownerDb = testEnv.authenticatedContext("user_transfer_owner").firestore();
      const propertyRef = doc(ownerDb, "properties", "prop_transfer_metadata_guard");

      await assertFails(updateDoc(propertyRef, { transferStatus: "pending" }));
      await assertFails(updateDoc(propertyRef, { transferCode: "TRF-ABC234" }));
      await assertFails(updateDoc(propertyRef, { pendingTransferToUid: "attacker_uid" }));
      await assertFails(updateDoc(propertyRef, { transferExpiresAt: new Date(Date.now() + 86400000).toISOString() }));
      await assertFails(updateDoc(propertyRef, { transferTargetEmail: "attacker@example.com" }));
      await assertFails(updateDoc(propertyRef, { transferHistory: [{ fromOwnerUid: "user_transfer_owner", toOwnerUid: "attacker_uid" }] }));
      await assertFails(updateDoc(propertyRef, { homeownerId: "attacker_uid" }));
      await assertFails(updateDoc(propertyRef, { previousOwnersCount: 999 }));
      await assertFails(updateDoc(propertyRef, { transferTargetName: "Forged recipient" }));
      await assertFails(updateDoc(propertyRef, { transferInitiatedAt: new Date().toISOString() }));
      await assertFails(updateDoc(propertyRef, { transferInitiatorUid: "attacker_uid" }));

      await assertSucceeds(updateDoc(propertyRef, { name: "Owner-editable property name" }));
    });

    it("16. Property private access works only for authorized users", async () => {
      await seedPrivateProperty("prop_auth_1", "user_alice");
      const ownerDb = testEnv.authenticatedContext("user_alice").firestore();
      await assertSucceeds(getDoc(doc(ownerDb, "properties", "prop_auth_1")));
    });

    it("17. Anonymous private Property access fails", async () => {
      await seedPrivateProperty("prop_anon_fail", "user_alice");
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "properties", "prop_anon_fail")));
      await assertFails(getDocs(collection(unauthDb, "properties")));
    });

    it("18. Cross-user Property access fails", async () => {
      await seedPrivateProperty("prop_alice_secret", "user_alice");
      const attackerDb = testEnv.authenticatedContext("user_attacker").firestore();
      await assertFails(getDoc(doc(attackerDb, "properties", "prop_alice_secret")));
      const q = query(collection(attackerDb, "properties"), where("ownerId", "==", "user_alice"));
      await assertFails(getDocs(q));
    });

    it("19. Public Property projection is readable if intended", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "public_properties", "pub_prop_1"), {
          id: "pub_prop_1",
          name: "Public Verified Property",
          propertyType: "Flat",
          postcodeArea: "NW1",
          epcRating: "B",
          isPublicPassport: true,
        });
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "public_properties", "pub_prop_1")));
      await assertSucceeds(getDocs(collection(unauthDb, "public_properties")));
    });

    it("20. Public Property projection cannot be forged by normal clients", async () => {
      const userADb = testEnv.authenticatedContext("user_alice").firestore();
      // Client cannot write directly with prohibited private keys or unauthorized docs
      await assertFails(
        setDoc(doc(userADb, "public_properties", "pub_prop_forged"), {
          id: "pub_prop_forged",
          name: "Forged Passport",
          ownerId: "user_alice", // Prohibited PII field in public projection
        })
      );
    });
  });

  // ==========================================
  // CATEGORY 3: FIREBASE STORAGE SECURITY
  // ==========================================
  describe("Category 3: Firebase Storage Media Security & Isolation", () => {
    const mockFileBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header

    beforeEach(async () => {
      // Seed job and property records in Firestore so Storage rules' firestore.get() queries resolve
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_media_100"), {
          id: "job_media_100",
          homeownerId: "user_alice",
          userId: "user_alice",
          acceptedTradespersonId: "trader_tom",
          status: "in_progress",
        });
        await setDoc(doc(adminDb, "properties", "prop_media_100"), {
          id: "prop_media_100",
          ownerId: "user_alice",
          userId: "user_alice",
        });
      });
    });

    it("21. Anonymous private Job media read fails", async () => {
      const unauthStorage = testEnv.unauthenticatedContext().storage();
      const storageRef = ref(unauthStorage, "jobs/job_media_100/private_invoice.png");
      await assertFails(getBytes(storageRef));
    });

    it("22. Cross-user private Job media read fails", async () => {
      const attackerStorage = testEnv.authenticatedContext("user_attacker").storage();
      const storageRef = ref(attackerStorage, "jobs/job_media_100/photos/damage.png");
      await assertFails(getBytes(storageRef));
    });

    it("23. Authorized Job owner can read media", async () => {
      // Upload as owner first
      const ownerStorage = testEnv.authenticatedContext("user_alice").storage();
      const storageRef = ref(ownerStorage, "jobs/job_media_100/photos/damage.png");
      await assertSucceeds(uploadBytes(storageRef, mockFileBytes, { contentType: "image/png" }));
      await assertSucceeds(getBytes(storageRef));
    });

    it("24. Authorized tradesperson can read permitted media", async () => {
      // Seed media as job owner first
      const ownerStorage = testEnv.authenticatedContext("user_alice").storage();
      const ownerRef = ref(ownerStorage, "jobs/job_media_100/photos/damage.png");
      await assertSucceeds(uploadBytes(ownerRef, mockFileBytes, { contentType: "image/png" }));

      const traderStorage = testEnv.authenticatedContext("trader_tom").storage();
      const storageRef = ref(traderStorage, "jobs/job_media_100/photos/damage.png");
      await assertSucceeds(getBytes(storageRef));
    });

    it("25. Unauthorized upload to another user's Job fails", async () => {
      const attackerStorage = testEnv.authenticatedContext("user_attacker").storage();
      const storageRef = ref(attackerStorage, "jobs/job_media_100/malicious_payload.png");
      await assertFails(uploadBytes(storageRef, mockFileBytes, { contentType: "image/png" }));
    });

    it("26. Authorized upload succeeds", async () => {
      const ownerStorage = testEnv.authenticatedContext("user_alice").storage();
      const storageRef = ref(ownerStorage, "jobs/job_media_100/repair_evidence.png");
      await assertSucceeds(uploadBytes(storageRef, mockFileBytes, { contentType: "image/png" }));
    });

    it("27. Public media is readable from explicit public path", async () => {
      // Upload to public path as owner
      const ownerStorage = testEnv.authenticatedContext("user_alice").storage();
      const pubRef = ref(ownerStorage, "public_job_media/job_media_100/showcase.png");
      await assertSucceeds(uploadBytes(pubRef, mockFileBytes, { contentType: "image/png" }));

      // Read anonymously
      const unauthStorage = testEnv.unauthenticatedContext().storage();
      const unauthPubRef = ref(unauthStorage, "public_job_media/job_media_100/showcase.png");
      await assertSucceeds(getBytes(unauthPubRef));
    });

    it("28. Private media is not exposed through alternate nested paths", async () => {
      const attackerStorage = testEnv.authenticatedContext("user_attacker").storage();
      const deepNestedRef = ref(attackerStorage, "jobs/job_media_100/sub/deep/nested/private.png");
      await assertFails(getBytes(deepNestedRef));
      await assertFails(uploadBytes(deepNestedRef, mockFileBytes, { contentType: "image/png" }));
    });
  });

  // ==========================================
  // CATEGORY 4: ADMIN / PRIVILEGE & ENUMERATION TESTS
  // ==========================================
  describe("Category 4: Admin, Privilege & Collection Enumeration Protection", () => {
    it("29. Normal user cannot impersonate admin", async () => {
      const normalUserDb = testEnv.authenticatedContext("user_bob").firestore();
      // Cannot read or write /admins collection
      await assertFails(getDoc(doc(normalUserDb, "admins", "user_bob")));
      await assertFails(
        setDoc(doc(normalUserDb, "admins", "user_bob"), {
          role: "admin",
          grantedAt: new Date().toISOString(),
        })
      );
    });

    it("30. Normal user cannot modify admin-only fields on support tickets or system records", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "support_tickets", "ticket_1"), {
          id: "ticket_1",
          userId: "user_bob",
          subject: "Issue with app",
          priority: "low",
          internalNotes: "Admin only note",
        });
      });

      const bobDb = testEnv.authenticatedContext("user_bob").firestore();
      // Bob cannot mutate priority or internalNotes
      await assertFails(
        updateDoc(doc(bobDb, "support_tickets", "ticket_1"), {
          priority: "urgent_p0",
          internalNotes: "Tampered note",
        })
      );
    });

    it("31. Normal user cannot grant another user access or transfer ownership without authorization", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "properties", "prop_strict_1"), {
          id: "prop_strict_1",
          ownerId: "user_alice",
          userId: "user_alice",
          name: "Strict Property",
        });
      });

      const attackerDb = testEnv.authenticatedContext("user_attacker").firestore();
      // Attacker cannot change ownerId or grant themselves access
      await assertFails(
        updateDoc(doc(attackerDb, "properties", "prop_strict_1"), {
          ownerId: "user_attacker",
        })
      );
    });

    it("32. ENUMERATION: Collection-level listing on sensitive collections fails for unauthorized users", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      const normalUserDb = testEnv.authenticatedContext("user_bob").firestore();

      // List on /admins fails for unauthenticated and normal users
      await assertFails(getDocs(collection(unauthDb, "admins")));
      await assertFails(getDocs(collection(normalUserDb, "admins")));

      // List on /conversations fails for unauthenticated
      await assertFails(getDocs(collection(unauthDb, "conversations")));

      // List on /invoices fails for unauthenticated
      await assertFails(getDocs(collection(unauthDb, "invoices")));

      // List on /recurring_schedules without participant filter fails for unauthenticated
      await assertFails(getDocs(collection(unauthDb, "recurring_schedules")));
    });
  });

  describe("Category 5: Adversarial Remediation & Regression Tests (Confirmed Findings 1-10)", () => {
    it("33. FINDING 1: Attacker cannot overwrite or delete another user's public job card or public property projection", async () => {
      // Seed job and property owned by alice
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "jobs/job_alice_public"), {
          homeownerId: "user_alice",
          title: "Fix leak",
        });
        await setDoc(doc(context.firestore(), "public_job_cards/job_alice_public"), {
          title: "Public Leak Fix",
          category: "Plumbing",
        });
        await setDoc(doc(context.firestore(), "properties/prop_alice_public"), {
          ownerId: "user_alice",
          nickname: "Alice Cottage",
          isPublicPassport: true,
        });
        await setDoc(doc(context.firestore(), "public_properties/prop_alice_public"), {
          nickname: "Public Alice Cottage",
        });
      });

      const attackerDb = testEnv.authenticatedContext("attacker_bob").firestore();
      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();

      // Attacker cannot update or delete Alice's public job card
      await assertFails(updateDoc(doc(attackerDb, "public_job_cards/job_alice_public"), { title: "Defaced Title" }));
      await assertFails(deleteDoc(doc(attackerDb, "public_job_cards/job_alice_public")));

      // Attacker cannot update or delete Alice's public property
      await assertFails(updateDoc(doc(attackerDb, "public_properties/prop_alice_public"), { nickname: "Defaced Property" }));
      await assertFails(deleteDoc(doc(attackerDb, "public_properties/prop_alice_public")));

      // Under V8.0, normal clients CANNOT write directly to public projections
      await assertFails(updateDoc(doc(aliceDb, "public_job_cards/job_alice_public"), { title: "Updated Leak Fix" }));
      await assertFails(updateDoc(doc(aliceDb, "public_properties/prop_alice_public"), { nickname: "Updated Alice Cottage" }));

      // Admins CAN update public projections
      const adminDb = testEnv.authenticatedContext("admin_user", { role: "admin", isAdmin: true }).firestore();
      await assertSucceeds(updateDoc(doc(adminDb, "public_job_cards/job_alice_public"), { title: "Admin Updated Leak Fix" }));
      await assertSucceeds(updateDoc(doc(adminDb, "public_properties/prop_alice_public"), { nickname: "Admin Updated Alice Cottage" }));
    });

    it("34. FINDING 2: Unassigned driver cannot eavesdrop or write to ride chat or hijack in-progress rides", async () => {
      // Seed driver profiles and ride
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users/driver_assigned"), {
          role: "driver",
          isDriver: true,
        });
        await setDoc(doc(context.firestore(), "users/driver_unassigned"), {
          role: "driver",
          isDriver: true,
        });
        await setDoc(doc(context.firestore(), "ride_requests/ride_trip_99"), {
          passengerId: "passenger_charlie",
          driverId: "driver_assigned",
          status: "in_progress",
        });
        await setDoc(doc(context.firestore(), "ride_requests/ride_trip_99/chat/msg_1"), {
          senderId: "passenger_charlie",
          text: "I am waiting at the gate",
        });
      });

      const unassignedDriverDb = testEnv.authenticatedContext("driver_unassigned").firestore();
      const assignedDriverDb = testEnv.authenticatedContext("driver_assigned").firestore();

      // Unassigned driver cannot read ride chat
      await assertFails(getDoc(doc(unassignedDriverDb, "ride_requests/ride_trip_99/chat/msg_1")));

      // Unassigned driver cannot send messages in ride chat
      await assertFails(setDoc(doc(unassignedDriverDb, "ride_requests/ride_trip_99/chat/msg_2"), {
        senderId: "driver_unassigned",
        text: "Intercepted",
      }));

      // Unassigned driver cannot update in-progress ride
      await assertFails(updateDoc(doc(unassignedDriverDb, "ride_requests/ride_trip_99"), {
        status: "cancelled",
      }));

      // Assigned driver can read ride chat and send message
      await assertSucceeds(getDoc(doc(assignedDriverDb, "ride_requests/ride_trip_99/chat/msg_1")));
      await assertSucceeds(setDoc(doc(assignedDriverDb, "ride_requests/ride_trip_99/chat/msg_3"), {
        senderId: "driver_assigned",
        text: "I have arrived at the pickup location",
      }));
    });

    it("35. FINDING 3: User cannot create an invoice with forged paid or transferred status", async () => {
      const traderDb = testEnv.authenticatedContext("trader_dave").firestore();

      // Forged paid invoice creation fails
      await assertFails(setDoc(doc(traderDb, "invoices/inv_forged_paid"), {
        traderId: "trader_dave",
        amount: 500,
        paid: true,
        status: "paid",
      }));

      // Forged payoutTransferred invoice creation fails
      await assertFails(setDoc(doc(traderDb, "invoices/inv_forged_payout"), {
        traderId: "trader_dave",
        amount: 500,
        payoutTransferred: true,
        payoutStatus: "transferred",
      }));

      // Legitimate unpaid draft invoice creation succeeds
      await assertSucceeds(setDoc(doc(traderDb, "invoices/inv_legit_draft"), {
        traderId: "trader_dave",
        amount: 500,
        paid: false,
        status: "draft",
        payoutTransferred: false,
        payoutStatus: "unpaid",
      }));
    });

    it("36. Task 3 — Direct client quote mutations to /jobs/{jobId}/quotes/{quoteId} are strictly DENIED", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "jobs/job_roof_quote"), {
          homeownerId: "user_alice",
          title: "Roof repair",
        });
        await setDoc(doc(context.firestore(), "jobs/job_roof_quote/quotes/quote_1"), {
          tradespersonId: "trader_dave",
          homeownerId: "user_alice",
          amount: 450,
          status: "pending",
          details: "Fix 5 tiles",
        });
      });

      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();
      const daveDb = testEnv.authenticatedContext("trader_dave").firestore();

      // 1. Direct client quote creation is DENIED
      await assertFails(
        setDoc(doc(daveDb, "jobs/job_roof_quote/quotes/quote_direct_inject"), {
          tradespersonId: "trader_dave",
          amount: 500,
          status: "pending",
        })
      );

      // 2. Direct client quote update is DENIED
      await assertFails(
        updateDoc(doc(daveDb, "jobs/job_roof_quote/quotes/quote_1"), {
          details: "Fix 5 tiles including weather sealing",
        })
      );

      // 3. Direct client quote deletion is DENIED
      await assertFails(
        deleteDoc(doc(daveDb, "jobs/job_roof_quote/quotes/quote_1"))
      );

      // 4. Authorized read remains PERMITTED
      await assertSucceeds(
        getDoc(doc(daveDb, "jobs/job_roof_quote/quotes/quote_1"))
      );
      await assertSucceeds(
        getDoc(doc(aliceDb, "jobs/job_roof_quote/quotes/quote_1"))
      );
    });

    it("37. FINDING 5: Homeowner cannot directly mutate payment status or accepted trader on Job", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "jobs/job_garden_fix"), {
          homeownerId: "user_alice",
          title: "Garden fencing",
          paymentStatus: "unpaid",
          funded: false,
        });
      });

      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();

      // Alice cannot mutate paymentStatus or funded
      await assertFails(updateDoc(doc(aliceDb, "jobs/job_garden_fix"), {
        paymentStatus: "paid",
      }));
      await assertFails(updateDoc(doc(aliceDb, "jobs/job_garden_fix"), {
        funded: true,
      }));

      // Alice cannot set acceptedTraderId directly
      await assertFails(updateDoc(doc(aliceDb, "jobs/job_garden_fix"), {
        acceptedTraderId: "trader_dave",
      }));

      // Alice can update legitimate job description
      await assertSucceeds(updateDoc(doc(aliceDb, "jobs/job_garden_fix"), {
        description: "Updated fencing measurements",
      }));
    });

    it("38. FINDING 6: User cannot forge rating, trustScore, or verification status on public profile", async () => {
      const bobDb = testEnv.authenticatedContext("user_bob").firestore();

      // Bob cannot create public profile with forged trustScore or verification
      await assertFails(setDoc(doc(bobDb, "public_profiles/user_bob"), {
        displayName: "Bob",
        trustScore: 100,
        rating: 5.0,
        verifiedTrader: true,
      }));

      // Bob can create legitimate base public profile
      await assertSucceeds(setDoc(doc(bobDb, "public_profiles/user_bob"), {
        displayName: "Bob Builder",
        bio: "Experienced carpenter",
      }));

      // Bob cannot subsequently update profile to inject rating or verification
      await assertFails(updateDoc(doc(bobDb, "public_profiles/user_bob"), {
        rating: 5.0,
      }));
      await assertFails(updateDoc(doc(bobDb, "public_profiles/user_bob"), {
        verifiedTrader: true,
      }));
      await assertFails(updateDoc(doc(bobDb, "public_profiles/user_bob"), {
        trustScore: 98,
      }));

      // Bob can update his bio
      await assertSucceeds(updateDoc(doc(bobDb, "public_profiles/user_bob"), {
        bio: "Experienced master carpenter with 10 years experience",
      }));
    });

    it("39. FINDING 7: Tenant with unverified email cannot read private property", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "properties/prop_tenant_test"), {
          ownerId: "user_alice",
          tenantEmail: "tenant@example.com",
          address: "10 Secret Way",
        });
      });

      // Tenant with unverified email fails
      const unverifiedTenantDb = testEnv.authenticatedContext("user_tenant_unverified", {
        email: "tenant@example.com",
        email_verified: false,
      }).firestore();
      await assertFails(getDoc(doc(unverifiedTenantDb, "properties/prop_tenant_test")));

      // Tenant with verified email succeeds
      const verifiedTenantDb = testEnv.authenticatedContext("user_tenant_verified", {
        email: "tenant@example.com",
        email_verified: true,
      }).firestore();
      await assertSucceeds(getDoc(doc(verifiedTenantDb, "properties/prop_tenant_test")));
    });

    it("40. FINDING 8: Ordinary user cannot read Driver or Trader profile from /users collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users/driver_steve"), {
          role: "driver",
          phoneNumber: "+447700900000",
          licenseNumber: "DRV12345",
        });
        await setDoc(doc(context.firestore(), "users/trader_steve"), {
          role: "tradesperson",
          trade: "Electrician",
          email: "steve.sparks@example.com",
        });
        await setDoc(doc(context.firestore(), "public_profiles/trader_steve"), {
          name: "Steve Sparks",
          trade: "Electrician",
        });
      });

      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();
      const steveDriverDb = testEnv.authenticatedContext("driver_steve").firestore();

      // Alice cannot read Steve's private driver document in /users
      await assertFails(getDoc(doc(aliceDb, "users/driver_steve")));

      // Steve can read his own driver document
      await assertSucceeds(getDoc(doc(steveDriverDb, "users/driver_steve")));

      // H1 REMEDIATION: Alice cannot read Steve's private trader document in /users (PERMISSION_DENIED)
      await assertFails(getDoc(doc(aliceDb, "users/trader_steve")));

      // Alice can read Steve's public profile in /public_profiles
      await assertSucceeds(getDoc(doc(aliceDb, "public_profiles/trader_steve")));
    });

    it("41. FINDING 9 & PL-01: Direct client-side review creation is blocked for all users (server-authoritative only)", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "jobs/job_verified_review"), {
          homeownerId: "user_alice",
          acceptedTraderId: "trader_dave",
        });
      });

      const bobDb = testEnv.authenticatedContext("user_bob").firestore();
      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();

      // Bob (unrelated stranger) cannot create a review for trader_dave without job
      await assertFails(setDoc(doc(bobDb, "reviews/rev_fake_1"), {
        reviewerId: "user_bob",
        traderId: "trader_dave",
        rating: 1,
        comment: "Terrible service",
      }));

      // Bob cannot create review for a job he did not participate in
      await assertFails(setDoc(doc(bobDb, "reviews/rev_fake_2"), {
        reviewerId: "user_bob",
        traderId: "trader_dave",
        jobId: "job_verified_review",
        rating: 1,
        comment: "Fake review",
      }));

      // PL-01: Direct client-side creation is blocked even for job participants;
      // reviews must be submitted server-authoritatively via /api/reviews/submit
      await assertFails(setDoc(doc(aliceDb, "reviews/rev_legit_alice"), {
        reviewerId: "user_alice",
        traderId: "trader_dave",
        jobId: "job_verified_review",
        rating: 5,
        comment: "Excellent service!",
      }));

      // Server-side / Admin SDK creation succeeds (simulating /api/reviews/submit)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "reviews/rev_legit_alice"), {
          reviewerId: "user_alice",
          traderId: "trader_dave",
          jobId: "job_verified_review",
          rating: 5,
          comment: "Excellent service!",
        });
      });

      // Public can read the published review
      await assertSucceeds(getDoc(doc(aliceDb, "reviews/rev_legit_alice")));
    });

    it("42. FINDING 10: Pending property transfer claimer cannot escalate privileges", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "properties/prop_transfer_esc"), {
          ownerId: "user_alice",
          transferStatus: "pending",
          pendingTransferToUid: "user_claim_buyer",
          verifiedByAdmin: false,
        });
      });

      const buyerDb = testEnv.authenticatedContext("user_claim_buyer").firestore();

      // Buyer cannot set verifiedByAdmin during claim
      await assertFails(updateDoc(doc(buyerDb, "properties/prop_transfer_esc"), {
        ownerId: "user_claim_buyer",
        userId: "user_claim_buyer",
        transferStatus: "claimed",
        verifiedByAdmin: true,
      }));

      // Ownership claims must use the authenticated server command so Gotham
      // quota counters move atomically with the property ownership.
      await assertFails(updateDoc(doc(buyerDb, "properties/prop_transfer_esc"), {
        ownerId: "user_claim_buyer",
        userId: "user_claim_buyer",
        transferStatus: "claimed",
      }));
    });

    it("43. Direct/targeted job card cannot be pushed to public_job_cards with target trader PII", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "jobs/direct_job_sec_1"), {
          homeownerId: "user_alice",
          targetTradespersonId: "trader_tom",
          status: "posted",
        });
      });

      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();

      // Alice cannot create a public job card for a direct/targeted job
      await assertFails(setDoc(doc(aliceDb, "public_job_cards/direct_job_sec_1"), {
        title: "Leaky Pipe Repair",
        category: "Plumbing",
        targetTradespersonId: "trader_tom",
      }));
    });

    it("44. Non-public property passport cannot be published to public_properties", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "properties/prop_private_sec_1"), {
          ownerId: "user_alice",
          isPublicPassport: false,
        });
      });

      const aliceDb = testEnv.authenticatedContext("user_alice").firestore();

      // Alice cannot publish a non-public property to public_properties
      await assertFails(setDoc(doc(aliceDb, "public_properties/prop_private_sec_1"), {
        name: "Private Residence",
        postcodeArea: "SW1A",
      }));
    });

    it("45. REGRESSION A: Unauthenticated user cannot create public_job_cards", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(unauthDb, "public_job_cards", "reg_card_1"), {
        title: "Test Job",
        category: "Plumbing",
      }));
    });

    it("46. REGRESSION B: Authenticated homeowner cannot create/update/delete public_job_cards", async () => {
      const homeownerDb = testEnv.authenticatedContext("homeowner_alice", { role: "customer" }).firestore();
      
      await assertFails(setDoc(doc(homeownerDb, "public_job_cards", "reg_card_2"), {
        title: "Test Job 2",
        category: "Electrical",
      }));

      // Assuming doc exists from disabled security rules seeding
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_job_cards/reg_card_2_seed"), {
          title: "Seeded Job",
          category: "Electrical",
        });
      });

      await assertFails(updateDoc(doc(homeownerDb, "public_job_cards", "reg_card_2_seed"), {
        title: "Updated Job",
      }));

      await assertFails(deleteDoc(doc(homeownerDb, "public_job_cards", "reg_card_2_seed")));
    });

    it("47. REGRESSION C: Authenticated tradesperson cannot create/update/delete public_job_cards", async () => {
      const traderDb = testEnv.authenticatedContext("trader_bob", { role: "tradesperson" }).firestore();

      await assertFails(setDoc(doc(traderDb, "public_job_cards", "reg_card_3"), {
        title: "Test Job 3",
        category: "Carpentry",
      }));

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_job_cards/reg_card_3_seed"), {
          title: "Seeded Job 3",
          category: "Carpentry",
        });
      });

      await assertFails(updateDoc(doc(traderDb, "public_job_cards", "reg_card_3_seed"), {
        title: "Updated Job 3",
      }));

      await assertFails(deleteDoc(doc(traderDb, "public_job_cards", "reg_card_3_seed")));
    });

    it("48. REGRESSION D: Unauthenticated user cannot create/update/delete public_properties", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(setDoc(doc(unauthDb, "public_properties", "reg_prop_1"), {
        name: "Unauthenticated Prop",
        postcodeArea: "SW1A",
      }));

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_properties/reg_prop_1_seed"), {
          name: "Seeded Prop",
          postcodeArea: "SW1A",
        });
      });

      await assertFails(updateDoc(doc(unauthDb, "public_properties", "reg_prop_1_seed"), {
        name: "Updated Name",
      }));

      await assertFails(deleteDoc(doc(unauthDb, "public_properties", "reg_prop_1_seed")));
    });

    it("49. REGRESSION E: Authenticated property owner cannot create/update/delete public_properties", async () => {
      const ownerDb = testEnv.authenticatedContext("owner_charlie", { role: "customer" }).firestore();

      await assertFails(setDoc(doc(ownerDb, "public_properties", "reg_prop_2"), {
        name: "Charlie Prop",
        postcodeArea: "SW1A",
      }));

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_properties/reg_prop_2_seed"), {
          name: "Seeded Prop 2",
          postcodeArea: "SW1A",
        });
      });

      await assertFails(updateDoc(doc(ownerDb, "public_properties", "reg_prop_2_seed"), {
        name: "Updated Name 2",
      }));

      await assertFails(deleteDoc(doc(ownerDb, "public_properties", "reg_prop_2_seed")));
    });

    it("50. REGRESSION F: Unauthenticated users CAN still read/list public_job_cards", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_job_cards/reg_card_f"), {
          title: "Public Discovery",
          category: "Plumbing",
        });
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "public_job_cards", "reg_card_f")));
      await assertSucceeds(getDocs(collection(unauthDb, "public_job_cards")));
    });

    it("51. REGRESSION G: Unauthenticated users CAN still read/list public_properties when those documents exist", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "public_properties/reg_prop_g"), {
          name: "Public Property Discovery",
          postcodeArea: "SW1A",
        });
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(unauthDb, "public_properties", "reg_prop_g")));
      await assertSucceeds(getDocs(collection(unauthDb, "public_properties")));
    });
  });

  // =========================================================================
  // CATEGORY 6: SECURITY REMEDIATION H1 — PRIVATE USER PROFILES (PII) ISOLATION
  // =========================================================================
  describe("Category 6: Security Remediation H1 — Private User Profiles (PII) Isolation", () => {
    const seedTestUsersAndProfiles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        // Private user document for User A (Trader with sensitive PII)
        await setDoc(doc(adminDb, "users", "userA"), {
          uid: "userA",
          name: "Alice Trader",
          role: "tradesperson",
          trade: "Plumber",
          email: "alice.private@example.com",
          phoneNumber: "+447700900111",
          homeAddress: "10 Private Lane, London",
          stripeCustomerId: "cus_sec_12345",
          stripeAccountId: "acct_sec_67890",
          balance: 5400,
        });

        // Corresponding sanitized public profile for User A (non-PII)
        await setDoc(doc(adminDb, "public_profiles", "userA"), {
          uid: "userA",
          name: "Alice Trader",
          trade: "Plumber",
          rating: 4.9,
          totalReviews: 42,
          city: "London",
        });
      });
    };

    beforeEach(async () => {
      await seedTestUsersAndProfiles();
    });

    it("52. H1 Test 1 — owner can read own user document (PASS)", async () => {
      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertSucceeds(getDoc(doc(userADb, "users", "userA")));
    });

    it("53. H1 Test 2 — admin can read user document (PASS)", async () => {
      const adminDb = testEnv.authenticatedContext("admin_user", { isAdmin: true }).firestore();
      await assertSucceeds(getDoc(doc(adminDb, "users", "userA")));
    });

    it("54. H1 Test 3 — unrelated authenticated user cannot read another user's private document (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(getDoc(doc(userBDb, "users", "userA")));
    });

    it("55. H1 Test 4 — unauthenticated user cannot read private user document (PERMISSION_DENIED)", async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "users", "userA")));
    });

    it("56. H1 Test 5 — public trader profile remains accessible through public_profiles (PASS)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      // Authenticated user can read public profile
      await assertSucceeds(getDoc(doc(userBDb, "public_profiles", "userA")));
      // Unauthenticated user can read public profile
      await assertSucceeds(getDoc(doc(unauthDb, "public_profiles", "userA")));
      // Public directory listing is allowed
      await assertSucceeds(getDocs(collection(unauthDb, "public_profiles")));
    });
  });

  // =========================================================================
  // CATEGORY 7: SECURITY REMEDIATION H2 — ADVERTISEMENTS BUDGET & STATE INTEGRITY
  // =========================================================================
  describe("Category 7: Security Remediation H2 — Advertisements Budget & State Integrity", () => {
    const seedTestAdvertisement = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "advertisements", "ad_userA_1"), {
          id: "ad_userA_1",
          advertiserUid: "userA",
          advertiserId: "userA",
          advertiserName: "Alice Plumbing",
          title: "Alice Quality Plumbing",
          description: "Emergency leak repairs 24/7",
          bgColor: "bg-blue-600",
          iconName: "Zap",
          targetRole: "homeowner",
          targetCategories: ["Plumbing"],
          costPerDisplay: 0.50,
          dailyDisplayLimit: 100,
          durationDays: 30,
          isActive: false,
          approvalStatus: "pending",
          billingCycle: "prepaid",
          totalBudget: 100,
          prepaidBalance: 100,
          clicks: 10,
          bannerClicks: 5,
          searchFeedClicks: 5,
          impressions: 50,
          lastAutoTopUpAt: "2026-09-01T00:00:00.000Z",
          createdAt: new Date().toISOString(),
        });
      });
    };

    beforeEach(async () => {
      await seedTestAdvertisement();
    });

    it("57. H2 Test 1 — unrelated user cannot modify advertisement creative/metadata (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(updateDoc(doc(userBDb, "advertisements", "ad_userA_1"), {
        title: "Malicious Title Overwrite",
        description: "Compromised ad copy",
      }));
    });

    it("58. H2 Test 2 — unrelated user cannot change prepaidBalance (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(updateDoc(doc(userBDb, "advertisements", "ad_userA_1"), {
        prepaidBalance: 5000,
      }));
    });

    it("59. H2 Test 3 — unrelated user cannot change isActive (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(updateDoc(doc(userBDb, "advertisements", "ad_userA_1"), {
        isActive: true,
      }));
    });

    it("60. H2 Test 4 — unrelated user cannot change lastAutoTopUpAt (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(updateDoc(doc(userBDb, "advertisements", "ad_userA_1"), {
        lastAutoTopUpAt: "2026-09-17T12:00:00.000Z",
      }));
    });

    it("61. H2 Test 5 — owner cannot directly change prepaidBalance through client write (PERMISSION_DENIED)", async () => {
      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertFails(updateDoc(doc(userADb, "advertisements", "ad_userA_1"), {
        prepaidBalance: 9999,
      }));
    });

    it("62. H2 Test 6 — owner cannot change isActive through client write (PERMISSION_DENIED)", async () => {
      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertFails(updateDoc(doc(userADb, "advertisements", "ad_userA_1"), {
        isActive: true,
      }));
    });

    it("63. H2 Test 7 — owner cannot change lastAutoTopUpAt through client write (PERMISSION_DENIED)", async () => {
      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertFails(updateDoc(doc(userADb, "advertisements", "ad_userA_1"), {
        lastAutoTopUpAt: "2026-09-17T12:00:00.000Z",
      }));
    });

    it("64. H2 Test 8 — protected-field injection is rejected when combined with valid engagement counters (PERMISSION_DENIED)", async () => {
      const userBDb = testEnv.authenticatedContext("userB").firestore();
      await assertFails(updateDoc(doc(userBDb, "advertisements", "ad_userA_1"), {
        clicks: 11,
        prepaidBalance: 9999,
      }));

      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertFails(updateDoc(doc(userADb, "advertisements", "ad_userA_1"), {
        clicks: 11,
        isActive: true,
      }));
    });

    it("65. H2 Test 9 — valid engagement counter increments pass (+1 monotonic step) (PASS)", async () => {
      const viewerDb = testEnv.authenticatedContext("viewer_user").firestore();
      
      // Step 1: Single counter increment (+1)
      await assertSucceeds(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        clicks: 11,
      }));

      // Step 2: Multi-counter increment (+1 clicks, +1 bannerClicks)
      await assertSucceeds(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        clicks: 12,
        bannerClicks: 6,
      }));

      // Step 3: Impression increment (+1 impressions)
      await assertSucceeds(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        impressions: 51,
      }));
    });

    it("66. H2 Test 10 — counter decrease is rejected (PERMISSION_DENIED)", async () => {
      const viewerDb = testEnv.authenticatedContext("viewer_user").firestore();
      
      // Attempt to decrease clicks from 10 to 9
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        clicks: 9,
      }));

      // Attempt to decrease bannerClicks from 5 to 4
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        bannerClicks: 4,
      }));

      // Attempt to decrease impressions from 50 to 0
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        impressions: 0,
      }));
    });

    it("67. H2 Test 11 — arbitrary counter jump is rejected (PERMISSION_DENIED)", async () => {
      const viewerDb = testEnv.authenticatedContext("viewer_user").firestore();
      
      // Attempt to jump clicks by +5 (from 10 to 15)
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        clicks: 15,
      }));

      // Attempt to jump clicks to 1000
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        clicks: 1000,
      }));

      // Attempt to jump impressions by +10
      await assertFails(updateDoc(doc(viewerDb, "advertisements", "ad_userA_1"), {
        impressions: 60,
      }));
    });

    it("68. H2 Test 12 — server/Admin SDK can maintain protected fields (prepaidBalance, isActive, lastAutoTopUpAt) (PASS)", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await assertSucceeds(updateDoc(doc(adminDb, "advertisements", "ad_userA_1"), {
          prepaidBalance: 250,
          totalBudget: 250,
          isActive: true,
          approvalStatus: "approved",
          lastAutoTopUpAt: "2026-09-17T12:00:00.000Z",
        }));

        const updatedDoc = await getDoc(doc(adminDb, "advertisements", "ad_userA_1"));
        expect(updatedDoc.data()?.prepaidBalance).toBe(250);
        expect(updatedDoc.data()?.isActive).toBe(true);
        expect(updatedDoc.data()?.approvalStatus).toBe("approved");
      });
    });

    it("69. H2 Supplementary — owner CAN update non-financial creative metadata (PASS)", async () => {
      const userADb = testEnv.authenticatedContext("userA").firestore();
      await assertSucceeds(updateDoc(doc(userADb, "advertisements", "ad_userA_1"), {
        title: "Alice Plumbing & Heating Specialist",
        description: "Boiler installations, emergency leak repair, central heating",
        url: "/profile/userA",
        bgColor: "bg-emerald-600",
        iconName: "Flame",
      }));
    });

    it("70. Task 2 — Direct client job creation to /jobs/{jobId} is strictly DENIED", async () => {
      const homeownerDb = testEnv.authenticatedContext("user_alice", { role: "customer" }).firestore();
      await assertFails(setDoc(doc(homeownerDb, "jobs", "direct_client_job_1"), {
        homeownerId: "user_alice",
        title: "Direct Client Job",
        category: "Plumbing",
        status: "open",
        createdAt: new Date().toISOString(),
      }));
    });

    it("71. Task 2 — Authoritative CreateJob command real Firestore emulator concurrency under quota=1", async () => {
      const emulatorAppName = "task2-real-firestore-concurrency";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const homeownerIdentity: CanonicalIdentity = {
        uid: "real_emulator_homeowner_123",
        accountType: "consumer",
        capabilities: ["homeowner"],
        verification: { status: "verified", credentials: [] },
        subscription: { tierId: "PAYG", status: "active", isFoundingMember: false },
      };

      const validJobPayload = {
        title: "Concurrent Emergency Leak Fix",
        description: "Urgent pipe burst in basement requiring immediate attention.",
        category: "Plumbing",
        postcode: "SW1A 1AA",
        urgency: "standard" as const,
      };

      const quotaConfig = {
        enabled: true,
        limit: 1,
        periodKey: "2026-09",
        periodStart: "2026-09-01T00:00:00.000Z",
        tierId: "strict_race_tier",
        isUnlimited: false,
      };

      // 0. Verify database connection before the race
      const probeRef = db
        .collection("task2_emulator_probes")
        .doc(`probe_${Date.now()}`);

      await probeRef.set({
        projectId: PROJECT_ID,
        createdAt: new Date().toISOString(),
      });

      const probeSnap = await probeRef.get();
      expect(probeSnap.exists).toBe(true);
      await probeRef.delete();

      // 1. Seed/clean quota document state and previous jobs for this user
      const quotaRef = db.collection("user_job_quotas").doc(`${homeownerIdentity.uid}_${quotaConfig.periodKey}`);
      await quotaRef.delete().catch(() => {});

      const existingJobs = await db
        .collection("jobs")
        .where("homeownerId", "==", homeownerIdentity.uid)
        .get();
      for (const d of existingJobs.docs) {
        await d.ref.delete();
      }

      // 2. Create two distinct idempotency keys
      const idempotencyKey1 = `real_race_key_1_${Date.now()}`;
      const idempotencyKey2 = `real_race_key_2_${Date.now()}`;

      // 3. Call executeCreateJobCommand() simultaneously using the same real Admin Firestore instance
      const results = await Promise.allSettled([
        executeCreateJobCommand({
          db,
          identity: homeownerIdentity,
          rawPayload: { ...validJobPayload, title: "Racing Job 1" },
          idempotencyKey: idempotencyKey1,
          quota: quotaConfig,
        }),
        executeCreateJobCommand({
          db,
          identity: homeownerIdentity,
          rawPayload: { ...validJobPayload, title: "Racing Job 2" },
          idempotencyKey: idempotencyKey2,
          quota: quotaConfig,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // 4. Assert exactly one succeeds
      expect(fulfilled.length).toBe(1);
      expect(fulfilled[0].value.jobId).toBeDefined();

      // 5. Assert exactly one receives the quota rejection
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ForbiddenError);
      expect(rejected[0].reason.message).toMatch(/quota exceeded/i);

      // 6. Read the actual quota document from Firestore and assert count === 1
      const quotaSnap = await quotaRef.get();
      expect(quotaSnap.exists).toBe(true);
      expect(quotaSnap.data()?.count).toBe(1);

      // 7. Query actual /jobs collection and assert exactly one job exists
      const jobsSnap = await db
        .collection("jobs")
        .where("homeownerId", "==", homeownerIdentity.uid)
        .get();
      expect(jobsSnap.size).toBe(1);
      expect(jobsSnap.docs[0].id).toBe(fulfilled[0].value.jobId);
    }, 30000);

    it("72. Task 3 — Authoritative CreateQuote command real Firestore emulator concurrency under same trader + same job", async () => {
      const emulatorAppName = "task3-real-firestore-concurrency";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const jobId = `job_task3_concurrency_${Date.now()}`;
      const homeownerId = "real_homeowner_task3_alice";
      const traderId = "real_trader_task3_dave";

      const traderIdentity: CanonicalIdentity = {
        uid: traderId,
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      // 1. Seed authoritative job
      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        title: "Leaking Pipe Emergency",
        description: "Need urgent plumbing assistance in bathroom.",
        category: "Plumbing",
        status: "open",
        quoteCount: 0,
        quotesCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Clean up any locks or quotes for this test run
      const traderLockRef = db.collection("trader_quote_locks").doc(`${jobId}_${traderId}`);
      await traderLockRef.delete().catch(() => {});

      const key1 = `race_quote_key_1_${Date.now()}`;
      const key2 = `race_quote_key_2_${Date.now()}`;

      // 3. Call executeQuoteCommand() simultaneously for same trader + same job
      const results = await Promise.allSettled([
        executeQuoteCommand({
          db,
          identity: traderIdentity,
          command: {
            type: "CreateQuote",
            payload: {
              jobId,
              amount: 500,
              coverNote: "Dave Racing Quote 1",
            },
          },
          idempotencyKey: key1,
        }),
        executeQuoteCommand({
          db,
          identity: traderIdentity,
          command: {
            type: "CreateQuote",
            payload: {
              jobId,
              amount: 550,
              coverNote: "Dave Racing Quote 2",
            },
          },
          idempotencyKey: key2,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // 4. Assert exactly one quote persisted and one conflict rejection
      expect(fulfilled.length).toBe(1);
      expect(fulfilled[0].value.quoteId).toBeDefined();
      expect(fulfilled[0].value.status).toBe("pending");

      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
      expect(rejected[0].reason.message).toMatch(/already have an active quote/i);

      // 5. Query actual /jobs/{jobId}/quotes and assert exactly one quote exists
      const quotesSnap = await db.collection("jobs").doc(jobId).collection("quotes").get();
      expect(quotesSnap.size).toBe(1);
      expect(quotesSnap.docs[0].id).toBe(fulfilled[0].value.quoteId);

      // 6. Query actual job document and assert quoteCount === 1
      const jobSnap = await db.collection("jobs").doc(jobId).get();
      expect(jobSnap.data()?.quoteCount).toBe(1);
      expect(jobSnap.data()?.status).toBe("quoted");
    }, 30000);

    it("73. Task 3 — Authoritative CreateQuote real Firestore emulator concurrency under maximum 5 quotes limit", async () => {
      const emulatorAppName = "task3-real-firestore-quote-limit";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const jobId = `job_task3_limit_${Date.now()}`;
      const homeownerId = "real_homeowner_task3_bob";

      // Seed job with 4 existing quotes
      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        title: "Major Roof Overhaul",
        description: "Roof replacement needed with multiple quotes.",
        category: "Roofing",
        status: "quoted",
        quoteCount: 4,
        quotesCount: 4,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Seed 4 quotes in subcollection
      for (let i = 1; i <= 4; i++) {
        await db.collection("jobs").doc(jobId).collection("quotes").doc(`quote_seed_${i}`).set({
          id: `quote_seed_${i}`,
          jobId,
          tradespersonId: `trader_seed_${i}`,
          amount: 1000 + i * 50,
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }

      const trader5Identity: CanonicalIdentity = {
        uid: "real_trader_task3_5",
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      const trader6Identity: CanonicalIdentity = {
        uid: "real_trader_task3_6",
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      const key5 = `race_quote_limit_key_5_${Date.now()}`;
      const key6 = `race_quote_limit_key_6_${Date.now()}`;

      // Two distinct traders compete for the 5th and final quote slot simultaneously
      const results = await Promise.allSettled([
        executeQuoteCommand({
          db,
          identity: trader5Identity,
          command: {
            type: "CreateQuote",
            payload: {
              jobId,
              amount: 1200,
              coverNote: "Trader 5's quote for 5th slot",
            },
          },
          idempotencyKey: key5,
        }),
        executeQuoteCommand({
          db,
          identity: trader6Identity,
          command: {
            type: "CreateQuote",
            payload: {
              jobId,
              amount: 1250,
              coverNote: "Trader 6's quote for 5th slot",
            },
          },
          idempotencyKey: key6,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // Exactly one succeeds to take slot 5, the other is rejected because limit of 5 is reached
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ForbiddenError);
      expect(rejected[0].reason.message).toMatch(/maximum limit of 5 quotes/i);

      // Verify total quotes in subcollection is exactly 5
      const quotesSnap = await db.collection("jobs").doc(jobId).collection("quotes").get();
      expect(quotesSnap.size).toBe(5);

      // Verify job document quoteCount is 5
      const jobSnap = await db.collection("jobs").doc(jobId).get();
      expect(jobSnap.data()?.quoteCount).toBe(5);
    }, 30000);

    it("74. Task 4 — Authoritative AcceptQuote command real Firestore emulator concurrency under competing quotes", async () => {
      const emulatorAppName = "task4-real-firestore-concurrency";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const jobId = `job_task4_concurrency_${Date.now()}`;
      const homeownerId = "real_homeowner_task4_alice";
      const quoteAId = `quote_a_${Date.now()}`;
      const quoteBId = `quote_b_${Date.now()}`;

      const homeownerIdentity: CanonicalIdentity = {
        uid: homeownerId,
        accountType: "consumer",
        capabilities: ["homeowner"],
        verification: { status: "verified" },
        subscription: { tierId: "free", status: "active" },
      };

      // 1. Seed authoritative job
      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        userId: homeownerId,
        title: "Emergency Roof Leak",
        description: "Urgent roof repair needed.",
        category: "Roofing",
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 2. Seed Quote A (Trader Dave) and Quote B (Trader Bob)
      await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteAId).set({
        id: quoteAId,
        jobId,
        tradespersonId: "trader_dave_task4",
        traderId: "trader_dave_task4",
        amount: 800,
        status: "pending",
        startDate: "2026-10-10",
        createdAt: new Date().toISOString(),
      });

      await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteBId).set({
        id: quoteBId,
        jobId,
        tradespersonId: "trader_bob_task4",
        traderId: "trader_bob_task4",
        amount: 850,
        status: "pending",
        startDate: "2026-10-11",
        createdAt: new Date().toISOString(),
      });

      const keyA = `race_accept_key_a_${Date.now()}`;
      const keyB = `race_accept_key_b_${Date.now()}`;

      // 3. Two simultaneous AcceptQuote operations on the real Firestore emulator
      const results = await Promise.allSettled([
        executeQuoteCommand({
          db,
          identity: homeownerIdentity,
          command: {
            type: "AcceptQuote",
            payload: {
              jobId,
              quoteId: quoteAId,
            },
          },
          idempotencyKey: keyA,
        }),
        executeQuoteCommand({
          db,
          identity: homeownerIdentity,
          command: {
            type: "AcceptQuote",
            payload: {
              jobId,
              quoteId: quoteBId,
            },
          },
          idempotencyKey: keyB,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      // Exactly one succeeds, exactly one is rejected with ConflictError
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      const acceptedQuoteId = fulfilled[0].value.quoteId;
      const otherQuoteId = acceptedQuoteId === quoteAId ? quoteBId : quoteAId;

      // Verify Job state in Firestore
      const jobSnap = await db.collection("jobs").doc(jobId).get();
      const jobData = jobSnap.data()!;
      expect(jobData.status).toBe("accepted");
      expect(jobData.acceptedQuoteId).toBe(acceptedQuoteId);
      expect(jobData.verificationPin).toBeDefined();

      // Verify accepted quote state
      const acceptedQuoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(acceptedQuoteId).get();
      expect(acceptedQuoteSnap.data()?.status).toBe("accepted");

      // Verify competing quote was atomically rejected
      const competingQuoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(otherQuoteId).get();
      expect(competingQuoteSnap.data()?.status).toBe("rejected");
    }, 30000);

    it("75. Task 4 — Authoritative AcceptQuote vs WithdrawQuote real Firestore emulator concurrency", async () => {
      const emulatorAppName = "task4-real-firestore-concurrency-withdraw";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const jobId = `job_task4_accept_vs_withdraw_${Date.now()}`;
      const homeownerId = "homeowner_task4_withdraw_test";
      const traderId = "trader_task4_withdraw_test";
      const quoteId = `quote_withdraw_race_${Date.now()}`;

      const homeownerIdentity: CanonicalIdentity = {
        uid: homeownerId,
        accountType: "consumer",
        capabilities: ["homeowner"],
        verification: { status: "verified" },
        subscription: { tierId: "free", status: "active" },
      };

      const traderIdentity: CanonicalIdentity = {
        uid: traderId,
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      // Seed Job and Quote
      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        userId: homeownerId,
        title: "Kitchen Tiling",
        category: "Tiling",
        status: "open",
        createdAt: new Date().toISOString(),
      });

      await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).set({
        id: quoteId,
        jobId,
        tradespersonId: traderId,
        traderId,
        amount: 600,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      const acceptKey = `race_accept_key_${Date.now()}`;
      const withdrawKey = `race_withdraw_key_${Date.now()}`;

      // Simultaneous AcceptQuote vs WithdrawQuote
      const results = await Promise.allSettled([
        executeQuoteCommand({
          db,
          identity: homeownerIdentity,
          command: {
            type: "AcceptQuote",
            payload: {
              jobId,
              quoteId,
            },
          },
          idempotencyKey: acceptKey,
        }),
        executeQuoteCommand({
          db,
          identity: traderIdentity,
          command: {
            type: "WithdrawQuote",
            payload: {
              jobId,
              quoteId,
              reason: "Schedule conflict",
            },
          },
          idempotencyKey: withdrawKey,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Verify quote is in a valid terminal state (either accepted or withdrawn, never corrupted)
      const quoteSnap = await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).get();
      const quoteStatus = quoteSnap.data()?.status;
      expect(["accepted", "withdrawn"]).toContain(quoteStatus);
    }, 30000);

    it("76. Task 4 — Authoritative AcceptQuote real Firestore emulator persistent idempotency replay", async () => {
      const emulatorAppName = "task4-real-firestore-idemp";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp(
          {
            projectId: PROJECT_ID,
          },
          emulatorAppName
        );
      const db = adminApp.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch {
        // settings already configured
      }

      const jobId = `job_task4_idemp_${Date.now()}`;
      const homeownerId = "homeowner_task4_idemp_alice";
      const traderId = "trader_task4_idemp_dave";
      const quoteId = `quote_idemp_${Date.now()}`;

      const homeownerIdentity: CanonicalIdentity = {
        uid: homeownerId,
        accountType: "consumer",
        capabilities: ["homeowner"],
        verification: { status: "verified" },
        subscription: { tierId: "free", status: "active" },
      };

      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        userId: homeownerId,
        title: "Idempotency Acceptance Test",
        category: "Electrical",
        status: "open",
        createdAt: new Date().toISOString(),
      });

      await db.collection("jobs").doc(jobId).collection("quotes").doc(quoteId).set({
        id: quoteId,
        jobId,
        tradespersonId: traderId,
        traderId,
        amount: 350,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      const fixedIdempKey = `fixed_accept_idemp_key_${Date.now()}`;

      // First call
      const res1 = await executeQuoteCommand({
        db,
        identity: homeownerIdentity,
        command: {
          type: "AcceptQuote",
          payload: {
            jobId,
            quoteId,
          },
        },
        idempotencyKey: fixedIdempKey,
      });

      expect(res1.wasReplayed).toBe(false);
      expect(res1.status).toBe("accepted");
      expect(res1.verificationPin).toBeDefined();

      // Second call (replay)
      const res2 = await executeQuoteCommand({
        db,
        identity: homeownerIdentity,
        command: {
          type: "AcceptQuote",
          payload: {
            jobId,
            quoteId,
          },
        },
        idempotencyKey: fixedIdempKey,
      });

      expect(res2.wasReplayed).toBe(true);
      expect(res2.quoteId).toBe(quoteId);
      expect(res2.verificationPin).toBe(res1.verificationPin);
      expect(res2.status).toBe("accepted");
    }, 30000);

    it("77. Task 5 — Real Firestore security rules deny direct client SDK status mutations on /jobs/{jobId}", async () => {
      const homeownerCtx = testEnv.authenticatedContext("homeowner_task5_rule_user");
      const db = homeownerCtx.firestore();

      // Seed Job via admin rules-disabled context
      await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
        const adminDb = adminCtx.firestore();
        await setDoc(doc(adminDb, "jobs", "job_task5_rule_100"), {
          id: "job_task5_rule_100",
          homeownerId: "homeowner_task5_rule_user",
          userId: "homeowner_task5_rule_user",
          title: "Rule Test Job",
          status: "open",
        });
      });

      // Direct client SDK status mutation MUST be denied
      await assertFails(
        updateDoc(doc(db, "jobs", "job_task5_rule_100"), {
          status: "completed",
        })
      );
    });

    it("78. Task 5 — Authoritative concurrent StartJob real Firestore transaction race", async () => {
      const emulatorAppName = "task5-real-firestore-concurrency-start";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp({ projectId: PROJECT_ID }, emulatorAppName);
      const db = adminApp.firestore();

      const jobId = `job_task5_start_race_${Date.now()}`;
      const homeownerId = "homeowner_task5_start_race";
      const traderId = "trader_task5_start_race";

      const traderIdentity: CanonicalIdentity = {
        uid: traderId,
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        userId: homeownerId,
        acceptedTradespersonId: traderId,
        tradespersonId: traderId,
        title: "Electrical Inspection",
        status: "accepted",
        createdAt: new Date().toISOString(),
      });

      const keyA = `start_race_key_a_${Date.now()}`;
      const keyB = `start_race_key_b_${Date.now()}`;

      // Two simultaneous StartJob requests
      const results = await Promise.allSettled([
        executeJobLifecycleCommand({
          db,
          identity: traderIdentity,
          command: { type: "StartJob", payload: { jobId } },
          idempotencyKey: keyA,
        }),
        executeJobLifecycleCommand({
          db,
          identity: traderIdentity,
          command: { type: "StartJob", payload: { jobId } },
          idempotencyKey: keyB,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      const jobSnap = await db.collection("jobs").doc(jobId).get();
      expect(jobSnap.data()?.status).toBe("in_progress");
    }, 30000);

    it("79. Task 5 — Authoritative StartJob vs CancelJob real Firestore transaction race", async () => {
      const emulatorAppName = "task5-real-firestore-start-vs-cancel";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp({ projectId: PROJECT_ID }, emulatorAppName);
      const db = adminApp.firestore();

      const jobId = `job_task5_start_vs_cancel_${Date.now()}`;
      const homeownerId = "homeowner_task5_svc";
      const traderId = "trader_task5_svc";

      const homeownerIdentity: CanonicalIdentity = {
        uid: homeownerId,
        accountType: "consumer",
        capabilities: ["homeowner"],
        verification: { status: "verified" },
        subscription: { tierId: "free", status: "active" },
      };

      const traderIdentity: CanonicalIdentity = {
        uid: traderId,
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId,
        userId: homeownerId,
        acceptedTradespersonId: traderId,
        tradespersonId: traderId,
        title: "Plumbing Repair",
        status: "accepted",
        createdAt: new Date().toISOString(),
      });

      const startKey = `race_start_key_${Date.now()}`;
      const cancelKey = `race_cancel_key_${Date.now()}`;

      // Simultaneous StartJob vs CancelJob with same expected initial state
      const results = await Promise.allSettled([
        executeJobLifecycleCommand({
          db,
          identity: traderIdentity,
          command: { type: "StartJob", payload: { jobId, expectedStatus: "accepted" } },
          idempotencyKey: startKey,
        }),
        executeJobLifecycleCommand({
          db,
          identity: homeownerIdentity,
          command: { type: "CancelJob", payload: { jobId, reason: "Cancelled", expectedStatus: "accepted" } },
          idempotencyKey: cancelKey,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      const jobSnap = await db.collection("jobs").doc(jobId).get();
      const finalStatus = jobSnap.data()?.status;
      expect(["in_progress", "cancelled"]).toContain(finalStatus);
    }, 30000);

    it("80. Task 5 — Authoritative StartJob persistent idempotency replay", async () => {
      const emulatorAppName = "task5-real-firestore-start-idemp";
      const adminApp =
        admin.apps.find((app) => app?.name === emulatorAppName) ??
        admin.initializeApp({ projectId: PROJECT_ID }, emulatorAppName);
      const db = adminApp.firestore();

      const jobId = `job_task5_start_idemp_${Date.now()}`;
      const traderId = "trader_task5_idemp_dave";

      const traderIdentity: CanonicalIdentity = {
        uid: traderId,
        accountType: "service_provider",
        capabilities: ["tradesperson"],
        verification: { status: "verified" },
        subscription: { tierId: "price_pro", status: "active" },
      };

      await db.collection("jobs").doc(jobId).set({
        id: jobId,
        homeownerId: "homeowner_alice",
        acceptedTradespersonId: traderId,
        tradespersonId: traderId,
        title: "Boiler Installation",
        status: "accepted",
        createdAt: new Date().toISOString(),
      });

      const fixedKey = `fixed_start_idemp_key_${Date.now()}`;

      // First execution
      const res1 = await executeJobLifecycleCommand({
        db,
        identity: traderIdentity,
        command: { type: "StartJob", payload: { jobId } },
        idempotencyKey: fixedKey,
      });

      expect(res1.wasReplayed).toBe(false);
      expect(res1.status).toBe("in_progress");

      // Replay
      const res2 = await executeJobLifecycleCommand({
        db,
        identity: traderIdentity,
        command: { type: "StartJob", payload: { jobId } },
        idempotencyKey: fixedKey,
      });

      expect(res2.wasReplayed).toBe(true);
      expect(res2.status).toBe("in_progress");
    }, 30000);
  });

  // =========================================================================
  // CATEGORY 13: TASK 35-A — USER PRIVILEGE BOUNDARY & DRIVER SELF-ELEVATION
  // =========================================================================
  describe("Category 13: Task 35-A — User Privilege Boundary & Driver Self-Elevation Prevention", () => {
    it("79. Test A — Normal profile creation with approved client-writable fields succeeds (ALLOW)", async () => {
      const userDb = testEnv.authenticatedContext("user_legit_create").firestore();
      await assertSucceeds(
        setDoc(doc(userDb, "users", "user_legit_create"), {
          id: "user_legit_create",
          name: "Legit User",
          displayName: "Legit User",
          email: "legit@example.com",
          phoneNumber: "+447700900222",
          bio: "Just an ordinary homeowner",
          city: "London",
          postcodeArea: "SW1A",
          createdAt: new Date().toISOString(),
        })
      );
    });

    it("80. Test B — Privileged role creation fails (role = admin DENY)", async () => {
      const userDb = testEnv.authenticatedContext("user_attacker_admin").firestore();
      await assertFails(
        setDoc(doc(userDb, "users", "user_attacker_admin"), {
          id: "user_attacker_admin",
          name: "Attacker",
          role: "admin",
          email: "attacker@evil.com",
        })
      );
    });

    it("81. Test C — Driver self-elevation fails on create and update (isDriver = true, role = driver DENY)", async () => {
      const userCreateDb = testEnv.authenticatedContext("user_driver_elevate").firestore();

      // Create with role = driver fails
      await assertFails(
        setDoc(doc(userCreateDb, "users", "user_driver_elevate"), {
          id: "user_driver_elevate",
          name: "Fake Driver",
          role: "driver",
        })
      );

      // Create with isDriver = true fails
      await assertFails(
        setDoc(doc(userCreateDb, "users", "user_driver_elevate"), {
          id: "user_driver_elevate",
          name: "Fake Driver",
          isDriver: true,
        })
      );

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_driver_elevate"), {
          id: "user_driver_elevate",
          name: "Normal User",
          email: "normal@example.com",
        });
      });

      // Update attempting to self-set isDriver = true fails
      await assertFails(
        updateDoc(doc(userCreateDb, "users", "user_driver_elevate"), {
          isDriver: true,
        })
      );

      // Update attempting to self-set role = driver fails
      await assertFails(
        updateDoc(doc(userCreateDb, "users", "user_driver_elevate"), {
          role: "driver",
        })
      );
    });

    it("82. Test D — Verification self-elevation fails (verifiedTrader, idVerified, verified DENY)", async () => {
      const userDb = testEnv.authenticatedContext("user_verify_elevate").firestore();

      // Create with verification flags fails
      await assertFails(
        setDoc(doc(userDb, "users", "user_verify_elevate"), {
          id: "user_verify_elevate",
          name: "Fake Verified",
          verifiedTrader: true,
          idVerified: true,
          verified: true,
        })
      );

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_verify_elevate"), {
          id: "user_verify_elevate",
          name: "Unverified User",
          email: "unverified@example.com",
        });
      });

      // Update with verification flags fails
      await assertFails(
        updateDoc(doc(userDb, "users", "user_verify_elevate"), {
          verifiedTrader: true,
        })
      );
      await assertFails(
        updateDoc(doc(userDb, "users", "user_verify_elevate"), {
          idVerified: true,
        })
      );
    });

    it("83. Test E — Entitlement manipulation fails (tierId, subscriptionStatus DENY)", async () => {
      const userDb = testEnv.authenticatedContext("user_tier_elevate").firestore();

      // Create with tierId/subscriptionStatus fails
      await assertFails(
        setDoc(doc(userDb, "users", "user_tier_elevate"), {
          id: "user_tier_elevate",
          name: "Fake Pro",
          tierId: "pro_tier",
          subscriptionStatus: "active",
        })
      );

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_tier_elevate"), {
          id: "user_tier_elevate",
          name: "Free Tier User",
          email: "free@example.com",
        });
      });

      // Update with tierId/subscriptionStatus fails
      await assertFails(
        updateDoc(doc(userDb, "users", "user_tier_elevate"), {
          tierId: "enterprise_gotham",
        })
      );
      await assertFails(
        updateDoc(doc(userDb, "users", "user_tier_elevate"), {
          subscriptionStatus: "active",
        })
      );
    });

    it("84. Test F — Financial manipulation fails (credits, balance, adWalletBalance DENY)", async () => {
      const userDb = testEnv.authenticatedContext("user_finance_elevate").firestore();

      // Create with financial balances fails
      await assertFails(
        setDoc(doc(userDb, "users", "user_finance_elevate"), {
          id: "user_finance_elevate",
          name: "Rich Attacker",
          balance: 100000,
          credits: 500,
          adWalletBalance: 1000,
        })
      );

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_finance_elevate"), {
          id: "user_finance_elevate",
          name: "Zero Balance User",
          email: "zero@example.com",
        });
      });

      // Update with financial balances fails
      await assertFails(
        updateDoc(doc(userDb, "users", "user_finance_elevate"), {
          balance: 50000,
        })
      );
      await assertFails(
        updateDoc(doc(userDb, "users", "user_finance_elevate"), {
          credits: 999,
        })
      );
      await assertFails(
        updateDoc(doc(userDb, "users", "user_finance_elevate"), {
          adWalletBalance: 500,
        })
      );
    });

    it("85. Test G — Protected-field addition fails on existing user document (ALLOWLIST ENFORCEMENT)", async () => {
      const userDb = testEnv.authenticatedContext("user_allowlist_test").firestore();

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_allowlist_test"), {
          id: "user_allowlist_test",
          name: "Standard User",
          email: "standard@example.com",
        });
      });

      // Attempt to inject arbitrary/newly introduced unapproved field
      await assertFails(
        updateDoc(doc(userDb, "users", "user_allowlist_test"), {
          arbitraryPrivilegeField: true,
        })
      );

      await assertFails(
        updateDoc(doc(userDb, "users", "user_allowlist_test"), {
          customSecurityOverride: "granted",
        })
      );
    });

    it("86. Test H — Legitimate profile update still works on approved fields (ALLOW)", async () => {
      const userDb = testEnv.authenticatedContext("user_legit_update").firestore();

      // Seed legitimate user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "user_legit_update"), {
          id: "user_legit_update",
          name: "Alice Builder",
          email: "alice.builder@example.com",
          bio: "Original bio",
        });
      });

      // Legitimate profile field updates succeed
      await assertSucceeds(
        updateDoc(doc(userDb, "users", "user_legit_update"), {
          bio: "Updated professional carpenter bio with 15 years experience",
          phoneNumber: "+447700900333",
          hourlyRate: 45,
          trade: "Carpentry",
          city: "Manchester",
          updatedAt: new Date().toISOString(),
        })
      );
    });

    it("87. Test I — Trusted server / Admin SDK writes remain fully functional for privileged fields (ALLOW)", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await assertSucceeds(
          setDoc(doc(adminDb, "users", "user_server_managed"), {
            id: "user_server_managed",
            name: "Server Verified Trader",
            role: "driver",
            isDriver: true,
            verifiedTrader: true,
            idVerified: true,
            tierId: "gotham_enterprise",
            subscriptionStatus: "active",
            balance: 2500,
            credits: 50,
          })
        );

        const docSnap = await getDoc(doc(adminDb, "users", "user_server_managed"));
        expect(docSnap.data()?.role).toBe("driver");
        expect(docSnap.data()?.isDriver).toBe(true);
        expect(docSnap.data()?.verifiedTrader).toBe(true);
        expect(docSnap.data()?.tierId).toBe("gotham_enterprise");
      });
    });
  });

  // =========================================================================
  // Category 14: Pre-Live Audit Security Remediations (PL-03 to PL-08, PL-14, PL-15)
  // =========================================================================
  describe("Category 14: Pre-Live Audit Security Remediations", () => {
    it("88. PL-03: Advertisements - pending ads hidden from unauthenticated callers, approved ads readable", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "advertisements", "ad_pending_secret"), {
          advertiserUid: "user_adv_1",
          isActive: false,
          approvalStatus: "pending",
        });
        await setDoc(doc(adminDb, "advertisements", "ad_approved_public"), {
          advertiserUid: "user_adv_1",
          isActive: true,
          approvalStatus: "approved",
        });
      });

      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(unauthDb, "advertisements", "ad_pending_secret")));
      await assertSucceeds(getDoc(doc(unauthDb, "advertisements", "ad_approved_public")));
    });

    it("89. PL-10: Advertisements - ad owner cannot tamper with endDate or financial schedule", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "advertisements", "ad_owner_schedule"), {
          advertiserUid: "user_adv_owner",
          advertiserId: "user_adv_owner",
          isActive: true,
          approvalStatus: "approved",
          endDate: "2026-10-20",
        });
      });

      const ownerDb = testEnv.authenticatedContext("user_adv_owner").firestore();
      await assertFails(
        updateDoc(doc(ownerDb, "advertisements", "ad_owner_schedule"), {
          endDate: "2030-01-01",
        })
      );
    });

    it("90. PL-04: Live Tracking - unassigned stranger cannot read or list online drivers", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "live_tracking", "driver_gps_1"), {
          driverId: "driver_gps_1",
          isOnline: true,
          lat: 51.5074,
          lng: -0.1278,
        });
      });

      const strangerDb = testEnv.authenticatedContext("stranger_user").firestore();
      await assertFails(getDoc(doc(strangerDb, "live_tracking", "driver_gps_1")));
    });

    it("91. PL-05: Reviews - direct client creation is denied (server-only)", async () => {
      const clientDb = testEnv.authenticatedContext("client_reviewer").firestore();
      await assertFails(
        setDoc(doc(clientDb, "reviews", "review_direct_1"), {
          jobId: "job_1",
          reviewerId: "client_reviewer",
          rating: 5,
        })
      );
    });

    it("92. PL-05: Jobs - owner cannot mint participant via targetTradespersonId update", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "jobs", "job_owner_test_mint"), {
          homeownerId: "owner_user_mint",
          status: "open",
        });
      });

      const ownerDb = testEnv.authenticatedContext("owner_user_mint").firestore();
      await assertFails(
        updateDoc(doc(ownerDb, "jobs", "job_owner_test_mint"), {
          targetTradespersonId: "accomplice_trader",
        })
      );
    });

    it("93. PL-06: Public Profiles - owner cannot self-elevate verificationStatus or tierId", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "public_profiles", "trader_self_verify"), {
          name: "Trader T",
          verificationStatus: "unverified",
        });
      });

      const traderDb = testEnv.authenticatedContext("trader_self_verify").firestore();
      await assertFails(
        updateDoc(doc(traderDb, "public_profiles", "trader_self_verify"), {
          verificationStatus: "verified",
        })
      );
      await assertFails(
        updateDoc(doc(traderDb, "public_profiles", "trader_self_verify"), {
          tierId: "Gotham Enterprise VIP",
        })
      );
      // Non-privileged bio update succeeds
      await assertSucceeds(
        updateDoc(doc(traderDb, "public_profiles", "trader_self_verify"), {
          bio: "Updated professional bio description",
        })
      );
    });

    it("94. PL-08: Invitations - verified recipients can only accept their own pending invitation", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "invitations", "inv_email_test"), {
          email: "victim@example.com",
          invitedBy: "manager_uid",
          status: "pending",
        });
        await setDoc(doc(adminDb, "invitations", "inv_email_tamper"), {
          email: "victim@example.com",
          invitedBy: "manager_uid",
          status: "pending",
        });
        await setDoc(doc(adminDb, "invitations", "inv_email_lowercase"), {
          email: "Victim@Example.com",
          invitedBy: "manager_uid",
          status: "pending",
        });
        await setDoc(doc(adminDb, "invitations", "inv_inviter_access"), {
          email: "other-recipient@example.com",
          invitedBy: "manager_uid",
          status: "pending",
        });
        await setDoc(doc(adminDb, "invitations", "inv_admin_access"), {
          email: "admin-managed@example.com",
          invitedBy: "manager_uid",
          status: "pending",
        });
      });

      const unverifiedDb = testEnv
        .authenticatedContext("attacker_fake_email", {
          email: "victim@example.com",
          email_verified: false,
          firebase: { sign_in_provider: "password" },
        })
        .firestore();
      await assertFails(getDoc(doc(unverifiedDb, "invitations", "inv_email_test")));
      await assertFails(
        getDocs(
          query(
            collection(unverifiedDb, "invitations"),
            where("email", "==", "victim@example.com"),
            where("status", "==", "pending")
          )
        )
      );
      await assertFails(
        updateDoc(doc(unverifiedDb, "invitations", "inv_email_test"), {
          status: "accepted",
          acceptedAt: serverTimestamp(),
        })
      );

      const verifiedDb = testEnv
        .authenticatedContext("legit_recipient", {
          email: "victim@example.com",
          email_verified: true,
          firebase: { sign_in_provider: "password" },
        })
        .firestore();
      await assertSucceeds(getDoc(doc(verifiedDb, "invitations", "inv_email_test")));
      await assertSucceeds(getDoc(doc(verifiedDb, "invitations", "inv_email_lowercase")));
      const matchingInvitations = await assertSucceeds(
        getDocs(
          query(
            collection(verifiedDb, "invitations"),
            where("email", "==", "victim@example.com"),
            where("status", "==", "pending")
          )
        )
      );
      expect(matchingInvitations.docs.some((invitation) => invitation.id === "inv_email_test")).toBe(true);
      await assertFails(getDoc(doc(verifiedDb, "invitations", "missing_invitation")));

      const unrelatedDb = testEnv
        .authenticatedContext("unrelated_user", {
          email: "unrelated@example.com",
          email_verified: true,
        })
        .firestore();
      await assertFails(getDoc(doc(unrelatedDb, "invitations", "inv_email_test")));

      // The inviter retains the existing read and management permissions.
      const inviterDb = testEnv
        .authenticatedContext("manager_uid", { firebase: { sign_in_provider: "password" } })
        .firestore();
      await assertSucceeds(getDoc(doc(inviterDb, "invitations", "inv_inviter_access")));
      await assertSucceeds(
        updateDoc(doc(inviterDb, "invitations", "inv_inviter_access"), {
          status: "cancelled",
        })
      );

      // Admin custom claims retain the existing management permissions.
      const adminClaimsDb = testEnv
        .authenticatedContext("platform_admin", {
          admin: true,
          firebase: { sign_in_provider: "password" },
        })
        .firestore();
      await assertSucceeds(getDoc(doc(adminClaimsDb, "invitations", "inv_admin_access")));
      await assertSucceeds(
        updateDoc(doc(adminClaimsDb, "invitations", "inv_admin_access"), {
          status: "admin-reviewed",
        })
      );

      // The intended onboarding action is permitted: pending -> accepted with a server timestamp.
      await assertSucceeds(
        updateDoc(doc(verifiedDb, "invitations", "inv_email_test"), {
          status: "accepted",
          acceptedAt: serverTimestamp(),
        })
      );

      // A verified recipient cannot change invitation ownership or other protected fields.
      await assertFails(
        updateDoc(doc(verifiedDb, "invitations", "inv_email_tamper"), {
          email: "attacker@example.com",
        })
      );
      await assertFails(
        updateDoc(doc(verifiedDb, "invitations", "inv_email_tamper"), {
          invitedBy: "attacker_fake_email",
        })
      );
      await assertFails(
        updateDoc(doc(verifiedDb, "invitations", "inv_email_tamper"), {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          email: "attacker@example.com",
        })
      );
      await assertFails(
        updateDoc(doc(verifiedDb, "invitations", "inv_email_tamper"), {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          notes: "unauthorized extra field",
        })
      );
    });

    it("95. PL-14: Conversations - participant tampering is blocked", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "conversations", "conv_tamper_test"), {
          participants: ["alice_user", "bob_user"],
        });
      });

      const aliceDb = testEnv.authenticatedContext("alice_user").firestore();
      await assertFails(
        updateDoc(doc(aliceDb, "conversations", "conv_tamper_test"), {
          participants: ["alice_user"],
        })
      );
    });

    it("96. PL-15: Assets - non-owner cannot hijack or overwrite another user's asset", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, "assets", "asset_alice_boiler"), {
          ownerId: "alice_asset_owner",
          name: "Worcester Bosch Boiler",
        });
      });

      const attackerDb = testEnv.authenticatedContext("bob_attacker").firestore();
      await assertFails(
        updateDoc(doc(attackerDb, "assets", "asset_alice_boiler"), {
          ownerId: "bob_attacker",
        })
      );
      await assertFails(deleteDoc(doc(attackerDb, "assets", "asset_alice_boiler")));

      const aliceDb = testEnv.authenticatedContext("alice_asset_owner").firestore();
      await assertSucceeds(
        updateDoc(doc(aliceDb, "assets", "asset_alice_boiler"), {
          ownerId: "alice_asset_owner",
          name: "Worcester Bosch Boiler 2026",
        })
      );
    });
  });
});

