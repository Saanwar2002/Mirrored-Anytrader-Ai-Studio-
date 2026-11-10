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


export type GothamPropertyUsageDecrement =
  | { allowed: true; nextUsage: number }
  | { allowed: false; reason: "invalid_usage" | "underflow" };

export function decrementGothamPropertyUsage(currentUsage: number): GothamPropertyUsageDecrement {
  if (!Number.isSafeInteger(currentUsage) || currentUsage < 0) {
    return { allowed: false, reason: "invalid_usage" };
  }
  if (currentUsage < 1) return { allowed: false, reason: "underflow" };
  return { allowed: true, nextUsage: currentUsage - 1 };
}
