import { describe, expect, it } from "vitest";
import { getJobParticipantIds } from "../../src/server/reviewAuthorization";

describe("canonical job participant identity resolution", () => {
  it("recognizes all supported homeowner identity fields", () => {
    const { ownerIds } = getJobParticipantIds({
      homeownerId: "homeowner-a",
      userId: "homeowner-b",
      ownerId: "homeowner-c",
      customerId: "homeowner-d",
      posterId: "homeowner-e",
    });
    expect(ownerIds).toEqual(["homeowner-a", "homeowner-b", "homeowner-c", "homeowner-d", "homeowner-e"]);
  });

  it("recognizes accepted and assigned trader identity fields", () => {
    const { traderIds } = getJobParticipantIds({
      acceptedTradespersonId: "trader-a",
      acceptedTraderId: "trader-b",
      assignedTraderId: "trader-c",
      tradespersonId: "trader-d",
      traderId: "trader-e",
    });
    expect(traderIds).toEqual(["trader-a", "trader-b", "trader-c", "trader-d", "trader-e"]);
  });

  it("ignores empty and non-string participant values", () => {
    const participants = getJobParticipantIds({
      homeownerId: "",
      posterId: 42,
      assignedTraderId: null,
      traderId: "trader-valid",
    });
    expect(participants.ownerIds).toEqual([]);
    expect(participants.traderIds).toEqual(["trader-valid"]);
  });
});
