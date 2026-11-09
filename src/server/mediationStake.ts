import { getJobParticipantIds } from "./reviewAuthorization.ts";

function httpError(message: string, status?: number): Error {
  const error: any = new Error(message);
  if (status) error.httpStatus = status;
  return error;
}

export async function reserveMediationStakeAttempt(db: any, input: {
  jobId: string; userId: string; candidateAttemptId: string;
  disputeReason?: string; technicalFaultReport?: string; isPropertyDamage?: boolean;
  photos?: unknown[]; serverTimestamp: () => unknown;
}): Promise<{ attemptId: string; existingPaymentIntentId: string }> {
  const jobRef = db.collection("jobs").doc(input.jobId);
  let attemptId = "";
  let existingPaymentIntentId = "";
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw httpError("Job not found", 404);
    const job = snap.data() || {};
    const dispute = job.dispute || {};
    if (job.status !== "disputed") throw httpError("Mediation stake can only be paid for a disputed job", 409);
    const { ownerIds, traderIds } = getJobParticipantIds(job);
    if (!ownerIds.includes(input.userId) && !traderIds.includes(input.userId)) {
      throw httpError("Only a job participant can pay the mediation stake", 403);
    }
    if (job.mediationStakePaid === true || dispute.mediationStakePaid === true || dispute.status === "pending_arbitration") {
      throw httpError("The mediation stake has already been paid for this job", 409);
    }
    if (dispute.stakePaymentAttemptId) {
      if (dispute.raisedBy !== input.userId) throw httpError("Only the participant who initiated this mediation payment can retry it", 403);
      attemptId = String(dispute.stakePaymentAttemptId);
      existingPaymentIntentId = String(dispute.paymentIntentId || "");
    } else {
      attemptId = input.candidateAttemptId;
      tx.update(jobRef, { dispute: {
        ...dispute, raisedBy: input.userId,
        reason: input.disputeReason || dispute.reason || "Dispute raised",
        technicalFaultReport: input.technicalFaultReport || dispute.technicalFaultReport || "",
        isPropertyDamage: Boolean(input.isPropertyDamage), mediationStakePaid: false,
        mediationStakeAmount: 25.00, stakePaymentAttemptId: attemptId,
        stakePaymentStatus: "creating",
        photos: Array.isArray(input.photos) ? input.photos : (dispute.photos || []),
        status: "awaiting_payment", createdAt: dispute.createdAt || input.serverTimestamp()
      }});
    }
  });
  return { attemptId, existingPaymentIntentId };
}

export async function createMediationStakePaymentIntent(db: any, stripe: any, input: {
  jobId: string; userId: string; candidateAttemptId: string;
  disputeReason?: string; technicalFaultReport?: string; isPropertyDamage?: boolean;
  photos?: unknown[]; serverTimestamp: () => unknown;
}): Promise<{ attemptId: string; paymentIntent: any }> {
  const reservation = await reserveMediationStakeAttempt(db, input);
  const paymentIntent = reservation.existingPaymentIntentId
    ? await stripe.paymentIntents.retrieve(reservation.existingPaymentIntentId)
    : await stripe.paymentIntents.create({
        amount: 2500,
        currency: "gbp",
        metadata: {
          type: "mediation_stake",
          jobId: input.jobId,
          disputeReason: input.disputeReason || "",
          technicalFaultReport: input.technicalFaultReport || "",
          isPropertyDamage: String(Boolean(input.isPropertyDamage)),
          userId: input.userId,
          paymentAttemptId: reservation.attemptId
        },
        description: `Mediation Dispute Stake for Job #${input.jobId} (£25.00)`,
        automatic_payment_methods: { enabled: true }
      }, { idempotencyKey: `mediation-stake:${input.jobId}:${reservation.attemptId}` });

  await attachMediationStakePaymentIntent(db, {
    jobId: input.jobId,
    attemptId: reservation.attemptId,
    paymentIntentId: paymentIntent.id,
    paymentIntentStatus: paymentIntent.status
  });
  return { attemptId: reservation.attemptId, paymentIntent };
}

export async function confirmMediationStakePayment(db: any, input: {
  jobId: string; userId: string; attemptId: string; paymentIntentId: string;
  serverTimestamp: () => unknown;
}): Promise<void> {
  const jobRef = db.collection("jobs").doc(input.jobId);
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error("Mediation stake job not found");
    const job = snap.data() || {};
    const dispute = job.dispute || {};
    if (dispute.raisedBy !== input.userId || dispute.stakePaymentAttemptId !== input.attemptId ||
        (dispute.paymentIntentId && dispute.paymentIntentId !== input.paymentIntentId)) {
      throw new Error("Mediation stake reservation mismatch");
    }
    if (dispute.mediationStakePaid === true && dispute.stakePaymentId === input.paymentIntentId) return;
    tx.update(jobRef, { status: "disputed", dispute: {
      ...dispute, paymentIntentId: input.paymentIntentId, mediationStakePaid: true, mediationStakeAmount: 25.00,
      stakePaymentId: input.paymentIntentId, stakePaymentStatus: "succeeded",
      status: "pending_arbitration", paidAt: input.serverTimestamp()
    }, disputedAt: input.serverTimestamp() });
  });
}


export async function recordMediationStakePaymentFailure(db: any, input: {
  jobId: string; userId: string; attemptId: string; paymentIntentId: string;
  paymentIntentStatus: string; lastPaymentError?: string; serverTimestamp: () => unknown;
}): Promise<void> {
  const jobRef = db.collection("jobs").doc(input.jobId);
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error("Mediation stake job not found");
    const job = snap.data() || {};
    const dispute = job.dispute || {};
    if (dispute.raisedBy !== input.userId || dispute.stakePaymentAttemptId !== input.attemptId ||
        (dispute.paymentIntentId && dispute.paymentIntentId !== input.paymentIntentId)) {
      throw new Error("Mediation stake failure reservation mismatch");
    }
    if (dispute.mediationStakePaid === true || dispute.stakePaymentStatus === "succeeded") return;
    tx.update(jobRef, { dispute: {
      ...dispute, paymentIntentId: input.paymentIntentId,
      stakePaymentStatus: input.paymentIntentStatus,
      lastPaymentError: input.lastPaymentError || "Payment attempt failed",
      lastPaymentFailedAt: input.serverTimestamp()
    }});
  });
}

export async function attachMediationStakePaymentIntent(db: any, input: {
  jobId: string; attemptId: string; paymentIntentId: string; paymentIntentStatus: string;
}): Promise<void> {
  const jobRef = db.collection("jobs").doc(input.jobId);
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) throw new Error("Job not found");
    const dispute = (snap.data() || {}).dispute || {};
    if (dispute.stakePaymentAttemptId !== input.attemptId) {
      throw new Error("Mediation stake reservation changed; refusing to attach PaymentIntent");
    }
    if (dispute.paymentIntentId && dispute.paymentIntentId !== input.paymentIntentId) {
      throw new Error("A different PaymentIntent is already attached to this mediation attempt");
    }
    if (dispute.mediationStakePaid === true || dispute.stakePaymentStatus === "succeeded") return;
    const hasWebhookFailure = dispute.paymentIntentId === input.paymentIntentId && Boolean(dispute.lastPaymentFailedAt);
    tx.update(jobRef, { dispute: {
      ...dispute, paymentIntentId: input.paymentIntentId,
      stakePaymentStatus: hasWebhookFailure ? dispute.stakePaymentStatus : input.paymentIntentStatus
    }});
  });
}
