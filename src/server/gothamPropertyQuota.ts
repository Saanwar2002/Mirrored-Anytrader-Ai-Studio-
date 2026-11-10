export type GothamPropertyQuotaDecision =
  | { allowed: true; nextUsage: number }
  | { allowed: false; reason: "invalid_usage" | "invalid_allowance" | "limit_reached" };

export function evaluateGothamPropertyQuota(
  currentUsage: number,
  allowance: number,
  enforceAllowance: boolean
): GothamPropertyQuotaDecision {
  if (!Number.isSafeInteger(currentUsage) || currentUsage < 0 || currentUsage >= Number.MAX_SAFE_INTEGER) {
    return { allowed: false, reason: "invalid_usage" };
  }
  if (enforceAllowance && (!Number.isSafeInteger(allowance) || allowance < 1)) {
    return { allowed: false, reason: "invalid_allowance" };
  }
  if (enforceAllowance && currentUsage >= allowance) {
    return { allowed: false, reason: "limit_reached" };
  }
  return { allowed: true, nextUsage: currentUsage + 1 };
}
