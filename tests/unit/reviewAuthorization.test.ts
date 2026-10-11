import { describe, it, expect } from "vitest";
import { assertCanReview } from "../../src/server/reviewAuthorization.ts";
import { ForbiddenError, BadRequestError, ConflictError } from "../../src/server/httpErrors.ts";

const validCompletedJob = {
  id: "job_test_100",
  homeownerId: "owner_alice",
  acceptedTradespersonId: "trader_bob",
  status: "completed",
};

describe("PL-01: Server-Authoritative Review Authorization (assertCanReview)", () => {
  it("allows homeowner to review the engaged tradesperson on a completed job", () => {
    expect(() =>
      assertCanReview(validCompletedJob, "owner_alice", "trader_bob", "tradesperson_review")
    ).not.toThrow();
  });

  it("allows engaged tradesperson to review the homeowner on a completed job", () => {
    expect(() =>
      assertCanReview(validCompletedJob, "trader_bob", "owner_alice", "homeowner_review")
    ).not.toThrow();
  });

  it("rejects an unrelated stranger attempting to review tradesperson", () => {
    expect(() =>
      assertCanReview(validCompletedJob, "stranger_eve", "trader_bob", "tradesperson_review")
    ).toThrow(ForbiddenError);
  });

  it("rejects review if reviewee is not the engaged tradesperson", () => {
    expect(() =>
      assertCanReview(validCompletedJob, "owner_alice", "trader_other", "tradesperson_review")
    ).toThrow(BadRequestError);
  });

  it("rejects homeowner review if reviewee is not the job owner", () => {
    expect(() =>
      assertCanReview(validCompletedJob, "trader_bob", "wrong_owner", "homeowner_review")
    ).toThrow(BadRequestError);
  });

  it("rejects reviews on non-completed jobs across all lifecycle states", () => {
    const nonCompletedStatuses = ["open", "accepted", "in_progress", "disputed", "cancelled", "draft"];
    for (const status of nonCompletedStatuses) {
      expect(() =>
        assertCanReview({ ...validCompletedJob, status }, "owner_alice", "trader_bob", "tradesperson_review")
      ).toThrow(ConflictError);
    }
  });

  it("strictly excludes targetTradespersonId from qualifying as engaged counterparty", () => {
    const jobWithTargetOnly = {
      id: "job_targeted",
      homeownerId: "owner_alice",
      targetTradespersonId: "trader_charlie",
      status: "completed",
    };
    expect(() =>
      assertCanReview(jobWithTargetOnly, "owner_alice", "trader_charlie", "tradesperson_review")
    ).toThrow(BadRequestError);
  });
});
