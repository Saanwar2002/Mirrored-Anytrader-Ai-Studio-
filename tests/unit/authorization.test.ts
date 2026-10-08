import { describe, it, expect } from "vitest";
import {
  assertIsAuthenticated,
  assertIsAdmin,
  assertResourceOwner,
  assertCanAccessConversation,
  assertCanDeleteJob,
  sanitizeClientPayload,
} from "../../src/server/authorization.ts";
import { UnauthorizedError, ForbiddenError } from "../../src/server/httpErrors.ts";

describe("Authorization & Security Guards", () => {
  describe("assertIsAuthenticated", () => {
    it("passes for valid user context", () => {
      expect(() => assertIsAuthenticated({ uid: "user_123" })).not.toThrow();
    });

    it("throws UnauthorizedError when user is missing or has empty uid", () => {
      expect(() => assertIsAuthenticated(null)).toThrow(UnauthorizedError);
      expect(() => assertIsAuthenticated(undefined)).toThrow(UnauthorizedError);
      expect(() => assertIsAuthenticated({ uid: "" })).toThrow(UnauthorizedError);
    });
  });

  describe("assertIsAdmin", () => {
    it("passes for super admin with custom claims (admin: true or isAdmin: true)", () => {
      expect(() => assertIsAdmin({ uid: "admin_1", isAdmin: true })).not.toThrow();
      expect(() => assertIsAdmin({ uid: "admin_2", admin: true })).not.toThrow();
    });

    it("throws ForbiddenError for regular customers, tradespeople, or unverified role attributes", () => {
      expect(() => assertIsAdmin({ uid: "cust_1", role: "customer" })).toThrow(ForbiddenError);
      expect(() => assertIsAdmin({ uid: "trad_1", role: "tradesperson" })).toThrow(ForbiddenError);
      expect(() => assertIsAdmin({ uid: "unverified_admin", role: "admin" })).toThrow(ForbiddenError);
    });
  });

  describe("assertResourceOwner (IDOR / BOLA Prevention)", () => {
    it("allows the resource owner to access their resource", () => {
      const user = { uid: "user_abc" };
      expect(() => assertResourceOwner(user, "user_abc", "Profile")).not.toThrow();
    });

    it("blocks an attacker attempting to access another user's resource", () => {
      const attacker = { uid: "attacker_evil" };
      expect(() => assertResourceOwner(attacker, "victim_123", "Job")).toThrow(ForbiddenError);
    });

    it("allows administrative override for support operations", () => {
      const adminUser = { uid: "admin_1", isAdmin: true };
      expect(() => assertResourceOwner(adminUser, "victim_123", "Job")).not.toThrow();
    });
  });

  describe("assertCanAccessConversation (Chat Eavesdropping Prevention)", () => {
    it("allows message access to conversation participants", () => {
      const participant = { uid: "user_a" };
      expect(() => assertCanAccessConversation(participant, ["user_a", "user_b"])).not.toThrow();
    });

    it("blocks third-party snooping", () => {
      const eavesdropper = { uid: "user_c" };
      expect(() => assertCanAccessConversation(eavesdropper, ["user_a", "user_b"])).toThrow(ForbiddenError);
    });
  });

  describe("sanitizeClientPayload (Mass Assignment Defense)", () => {
    it("strips out server-owned and privileged keys", () => {
      const maliciousPayload = {
        name: "Honest Trader",
        bio: "Skilled plumber",
        role: "admin", // Priv escalation
        isAdmin: true, // Priv escalation
        rating: 5.0, // Rating tampering
        payoutTransferred: true, // Financial tampering
        platformFee: 0, // Fee bypass
      };

      const sanitized = sanitizeClientPayload(maliciousPayload);

      expect(sanitized.name).toBe("Honest Trader");
      expect(sanitized.bio).toBe("Skilled plumber");
      expect((sanitized as any).role).toBeUndefined();
      expect((sanitized as any).isAdmin).toBeUndefined();
      expect((sanitized as any).rating).toBeUndefined();
      expect((sanitized as any).payoutTransferred).toBeUndefined();
      expect((sanitized as any).platformFee).toBeUndefined();
    });
  });

  describe("assertCanDeleteJob (Escrow & Dispute Evidence Protection)", () => {
    const validJob = {
      id: "job_101",
      homeownerId: "owner_alice",
      status: "open",
      funded: false,
      isPaid: false,
      escrowBalance: 0,
      amountPaid: 0,
      escrowStatus: "none",
    };

    it("allows job owner to delete unassigned, unfunded open job", () => {
      const owner = { uid: "owner_alice" };
      expect(() => assertCanDeleteJob(owner, validJob)).not.toThrow();
    });

    it("blocks unauthorized third-party user from deleting job", () => {
      const attacker = { uid: "attacker_eve" };
      expect(() => assertCanDeleteJob(attacker, validJob)).toThrow(ForbiddenError);
    });

    it("blocks owner from deleting funded job (prevents orphaning escrow)", () => {
      const owner = { uid: "owner_alice" };
      const fundedJob = { ...validJob, funded: true };
      expect(() => assertCanDeleteJob(owner, fundedJob)).toThrow(
        "Funded jobs cannot be deleted as this would orphan escrow funds."
      );

      const paidJob = { ...validJob, isPaid: true };
      expect(() => assertCanDeleteJob(owner, paidJob)).toThrow(
        "Funded jobs cannot be deleted as this would orphan escrow funds."
      );
    });

    it("blocks owner from deleting job with active escrow balance or payments", () => {
      const owner = { uid: "owner_alice" };
      const balanceJob = { ...validJob, escrowBalance: 250 };
      expect(() => assertCanDeleteJob(owner, balanceJob)).toThrow(
        "Jobs with an active escrow balance or payments cannot be deleted."
      );

      const amountPaidJob = { ...validJob, amountPaid: 100 };
      expect(() => assertCanDeleteJob(owner, amountPaidJob)).toThrow(
        "Jobs with an active escrow balance or payments cannot be deleted."
      );
    });

    it("blocks owner from deleting job with escrow status 'held' or 'funded'", () => {
      const owner = { uid: "owner_alice" };
      const heldJob = { ...validJob, escrowStatus: "held" };
      expect(() => assertCanDeleteJob(owner, heldJob)).toThrow(
        "Jobs with escrow status 'held' cannot be deleted."
      );
    });

    it("blocks owner from deleting job with assigned/accepted tradesperson", () => {
      const owner = { uid: "owner_alice" };
      const assignedJob = { ...validJob, acceptedTradespersonId: "trader_bob" };
      expect(() => assertCanDeleteJob(owner, assignedJob)).toThrow(
        "Jobs with an assigned or accepted tradesperson cannot be deleted."
      );

      const acceptedTraderJob = { ...validJob, acceptedTraderId: "trader_bob" };
      expect(() => assertCanDeleteJob(owner, acceptedTraderJob)).toThrow(
        "Jobs with an assigned or accepted tradesperson cannot be deleted."
      );
    });

    it("blocks owner from deleting job in progress or completed status", () => {
      const owner = { uid: "owner_alice" };
      const inProgressJob = { ...validJob, status: "in_progress" };
      expect(() => assertCanDeleteJob(owner, inProgressJob)).toThrow(
        "Jobs in 'in_progress' status cannot be deleted."
      );

      const completedJob = { ...validJob, status: "completed" };
      expect(() => assertCanDeleteJob(owner, completedJob)).toThrow(
        "Jobs in 'completed' status cannot be deleted."
      );
    });

    it("blocks owner from deleting job with dispute (preserves dispute evidence)", () => {
      const owner = { uid: "owner_alice" };
      const disputeJob = { ...validJob, disputeStatus: "opened" };
      expect(() => assertCanDeleteJob(owner, disputeJob)).toThrow(
        "Jobs with an active or pending dispute cannot be deleted to preserve evidence."
      );

      const disputedAtJob = { ...validJob, disputedAt: "2026-10-08T12:00:00Z" };
      expect(() => assertCanDeleteJob(owner, disputedAtJob)).toThrow(
        "Disputed jobs cannot be deleted to preserve dispute evidence."
      );
    });

    it("allows platform admin to delete for administrative hygiene", () => {
      const admin = { uid: "admin_super", isAdmin: true };
      const fundedJob = { ...validJob, funded: true, escrowBalance: 500, status: "in_progress" };
      expect(() => assertCanDeleteJob(admin, fundedJob)).not.toThrow();
    });
  });
});
