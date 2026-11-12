import { describe, expect, it } from "vitest";
import { decrementGothamPropertyUsage, evaluateGothamPropertyQuota } from "../../src/server/gothamPropertyQuota.ts";

describe("Gotham property quota decision", () => {
  it("allows creation below the purchased allowance", () => {
    expect(evaluateGothamPropertyQuota(4, 5, true)).toEqual({ allowed: true, nextUsage: 5 });
  });

  it("allows creation exactly up to the purchased allowance", () => {
    expect(evaluateGothamPropertyQuota(0, 1, true)).toEqual({ allowed: true, nextUsage: 1 });
  });

  it("blocks creation once current usage reaches the purchased allowance", () => {
    expect(evaluateGothamPropertyQuota(5, 5, true)).toEqual({ allowed: false, reason: "limit_reached" });
  });

  it("blocks invalid or zero purchased allowances", () => {
    expect(evaluateGothamPropertyQuota(0, 0, true)).toEqual({ allowed: false, reason: "invalid_allowance" });
    expect(evaluateGothamPropertyQuota(0, 1.5, true)).toEqual({ allowed: false, reason: "invalid_allowance" });
  });

  it("rejects invalid or unsafe usage counters", () => {
    expect(evaluateGothamPropertyQuota(-1, 5, true)).toEqual({ allowed: false, reason: "invalid_usage" });
    expect(evaluateGothamPropertyQuota(Number.MAX_SAFE_INTEGER, 5, true)).toEqual({ allowed: false, reason: "invalid_usage" });
  });

  it("keeps counting existing usage without enforcing an inactive allowance", () => {
    expect(evaluateGothamPropertyQuota(7, 0, false)).toEqual({ allowed: true, nextUsage: 8 });
  });
});


describe("Gotham property usage decrement", () => {
  it("decrements a positive valid counter", () => {
    expect(decrementGothamPropertyUsage(3)).toEqual({ allowed: true, nextUsage: 2 });
  });

  it("rejects zero to prevent underflow", () => {
    expect(decrementGothamPropertyUsage(0)).toEqual({ allowed: false, reason: "underflow" });
  });

  it("rejects negative and non-integer counters", () => {
    expect(decrementGothamPropertyUsage(-1)).toEqual({ allowed: false, reason: "invalid_usage" });
    expect(decrementGothamPropertyUsage(1.5)).toEqual({ allowed: false, reason: "invalid_usage" });
  });
});
