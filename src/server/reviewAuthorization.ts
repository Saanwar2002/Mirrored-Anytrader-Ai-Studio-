import { BadRequestError, ConflictError, ForbiddenError } from "./httpErrors.ts";

export type ReviewType = "tradesperson_review" | "homeowner_review";

const ids = (...v: unknown[]): string[] =>
  v.filter((x): x is string => typeof x === "string" && x.length > 0);

export function getJobParticipantIds(job: Record<string, any>): { ownerIds: string[]; traderIds: string[] } {
  return {
    ownerIds: ids(job.homeownerId, job.userId, job.ownerId, job.customerId, job.posterId),
    traderIds: ids(job.acceptedTradespersonId, job.acceptedTraderId, job.assignedTraderId, job.tradespersonId, job.traderId),
  };
}

/**
 * Server-authoritative review authorization guard.
 * Strictly verifies that:
 * 1. The job is in 'completed' status.
 * 2. For tradesperson_review: reviewer is the job owner, reviewee is the engaged trader.
 * 3. For homeowner_review: reviewer is the engaged trader, reviewee is the job owner.
 * Note: targetTradespersonId is a *request*, not an engagement, and is deliberately excluded.
 */
export function assertCanReview(
  job: Record<string, any>,
  reviewerId: string,
  revieweeId: string,
  type: ReviewType
): void {
  const ownerIds = ids(job.homeownerId, job.userId, job.ownerId, job.customerId, job.posterId);
  const traderIds = ids(
    job.acceptedTradespersonId,
    job.acceptedTraderId,
    job.assignedTraderId,
    job.tradespersonId,
    job.traderId
  );

  if (job.status !== "completed") {
    throw new ConflictError("Reviews can only be left once the job is completed.");
  }

  if (type === "tradesperson_review") {
    if (!ownerIds.includes(reviewerId)) {
      throw new ForbiddenError("Only the job owner can review the tradesperson.");
    }
    if (!traderIds.includes(revieweeId)) {
      throw new BadRequestError("Reviewee is not the tradesperson engaged on this job.");
    }
  } else {
    if (!traderIds.includes(reviewerId)) {
      throw new ForbiddenError("Only the engaged tradesperson can review the customer.");
    }
    if (!ownerIds.includes(revieweeId)) {
      throw new BadRequestError("Reviewee is not the owner of this job.");
    }
  }
}
