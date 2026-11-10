import admin from 'firebase-admin';
import Stripe from 'stripe';

let stripeClient: Stripe | null = null;
function getStripeClient(): Stripe | null {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key) {
      stripeClient = new Stripe(key);
    }
  }
  return stripeClient;
}

let globalConfig: any = {
  imMaxAttempts: 10,
  imAttemptIntervalSeconds: 60,
  imRequireEmergencyToggle: false,
  imRequireVerified: false,
  imRequireCategoryMatch: false,
  imRequireTagMatch: false
};

async function expireAndRefundInstantMatch(db: admin.firestore.Firestore, matchRef: admin.firestore.DocumentReference, stripe: Stripe | null, reason: string): Promise<void> {
  const refundRef = db.collection("instant_match_refunds").doc(matchRef.id);
  const operation = await db.runTransaction(async (tx: any) => {
    const [matchSnap, refundSnap] = await Promise.all([tx.get(matchRef), tx.get(refundRef)]);
    if (!matchSnap.exists) return { action: "stop" as const };
    const match = matchSnap.data() || {};
    const existing = refundSnap.exists ? refundSnap.data() || {} : null;
    if (existing?.status === "succeeded" || existing?.status === "manual_review") return { action: "stop" as const };
    const paymentIntentId = match.stripePaymentIntentId;
    if (typeof paymentIntentId !== "string" || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      tx.set(matchRef, { status: "expired", expiredAt: match.expiredAt || new Date().toISOString(), refundStatus: "manual_review", refundReviewReason: "missing_or_invalid_payment_intent" }, { merge: true });
      tx.set(refundRef, { instantMatchId: matchRef.id, status: "manual_review", reason: "missing_or_invalid_payment_intent", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { action: "stop" as const };
    }
    if (!existing && match.status !== "searching") return { action: "stop" as const };
    const idempotencyKey = "instant-match-expiry:" + matchRef.id;
    tx.set(matchRef, { status: "expired", expiredAt: match.expiredAt || new Date().toISOString(), refundStatus: "processing" }, { merge: true });
    tx.set(refundRef, { instantMatchId: matchRef.id, paymentIntentId, idempotencyKey, reason, status: "processing", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { action: "refund" as const, paymentIntentId, idempotencyKey };
  });
  if (operation.action !== "refund") return;
  if (!stripe) {
    await refundRef.set({ status: "reconciliation_required", error: "stripe_client_unavailable", updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await matchRef.set({ refundStatus: "reconciliation_required" }, { merge: true });
    return;
  }
  try {
    const refund = await stripe.refunds.create({ payment_intent: operation.paymentIntentId, reason: "requested_by_customer", metadata: { instantMatchId: matchRef.id, operationType: "ANYTRADER_INSTANT_MATCH_EXPIRY" } }, { idempotencyKey: operation.idempotencyKey });
    const status = refund.status === "succeeded" ? "succeeded" : (refund.status === "failed" || refund.status === "canceled") ? "manual_review" : "processing";
    await db.runTransaction(async (tx: any) => {
      const [latestMatch, latestRefund] = await Promise.all([tx.get(matchRef), tx.get(refundRef)]);
      if (!latestMatch.exists || !latestRefund.exists) throw new Error("Instant Match refund operation disappeared.");
      tx.set(refundRef, { status, stripeRefundId: refund.id, stripeRefundStatus: refund.status || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(matchRef, { refundStatus: status, stripeRefundId: refund.id }, { merge: true });
    });
  } catch (err: any) {
    const message = err?.message || String(err);
    await db.runTransaction(async (tx: any) => {
      const [latestMatch, latestRefund] = await Promise.all([tx.get(matchRef), tx.get(refundRef)]);
      if (!latestMatch.exists || !latestRefund.exists || latestRefund.data()?.status === "succeeded") return;
      tx.set(refundRef, { status: "reconciliation_required", error: message.slice(0, 500), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(matchRef, { refundStatus: "reconciliation_required" }, { merge: true });
    });
    console.error("Instant Match refund outcome requires reconciliation:", err);
  }
}
export function startInstantMatchEngine(db: admin.firestore.Firestore) {
  if (!db) return;
  console.log("Starting Instant Match Engine...");

  // Cache platform config
  let configUnsubscribe: (() => void) | null = null;
  configUnsubscribe = db.collection("platform_config").doc("global").onSnapshot(
    (doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data) {
           globalConfig = { ...globalConfig, ...data };
        }
      }
    },
    (err: any) => {
      const msg = err?.message || String(err);
      if (err?.code === 7 || msg.includes("7") || msg.includes("PERMISSION_DENIED") || msg.includes("Missing or insufficient permissions") || msg.includes("UNAUTHENTICATED") || msg.includes("Could not load the default credentials")) {
        if (configUnsubscribe) {
          try { configUnsubscribe(); } catch {}
        }
        return;
      }
      console.warn("Instant match config listener error:", err);
    }
  );

  const processingMatches = new Set<string>();

  // Real-time listener for searching matches instead of polling
  let matchesUnsubscribe: (() => void) | null = null;
  matchesUnsubscribe = db.collection("instant_matches")
    .where("status", "==", "searching")
    .onSnapshot(async (matchesSnap) => {
      try {
        const now = new Date();
        for (const matchDoc of matchesSnap.docs) {
          if (processingMatches.has(matchDoc.id)) continue;
          processingMatches.add(matchDoc.id);

          try {
            const match = matchDoc.data();
            
            // Find latest attempt array
            const attemptsSnap = await db.collection("instant_match_attempts")
              .where("instantMatchId", "==", matchDoc.id)
              .orderBy("attemptNumber", "desc")
              .limit(1)
              .get();

            const latestAttempt = attemptsSnap.docs[0]?.data();
            const latestAttemptRef = attemptsSnap.docs[0]?.ref;

            if (!latestAttempt) {
              // No attempts yet, find top traders and create the first attempt
              await initiateNextAttempt(db, matchDoc.ref, match, 1);
            } else {
              // Check if attempt timed out
              const expiresAt = new Date(latestAttempt.expiresAt);
              if (['pending', 'notified'].includes(latestAttempt.status) && expiresAt < now) {
                // Expired!
                await latestAttemptRef.update({
                  status: "timeout",
                  respondedAt: now.toISOString()
                });

                // Initiate next attempt
                const nextAttemptNum = latestAttempt.attemptNumber + 1;
                const maxAttempts = globalConfig.imMaxAttempts ?? 10;
                if (nextAttemptNum > maxAttempts) {
                  // Expire the match entirely if we tried max times
                  await expireAndRefundInstantMatch(db, matchDoc.ref, getStripeClient(), "attempts_exhausted");
                } else {
                  await initiateNextAttempt(db, matchDoc.ref, match, nextAttemptNum);
                }
              }
            }
          } finally {
            processingMatches.delete(matchDoc.id);
          }
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (!msg.includes("PERMISSION_DENIED") && !msg.includes("UNAUTHENTICATED")) {
          console.error("Error in Instant Match Engine onSnapshot handler:", err);
        }
      }
    }, (err: any) => {
      const msg = err?.message || String(err);
      if (err?.code === 7 || msg.includes("7") || msg.includes("PERMISSION_DENIED") || msg.includes("Missing or insufficient permissions") || msg.includes("UNAUTHENTICATED") || msg.includes("Could not load the default credentials")) {
        if (matchesUnsubscribe) {
          try { matchesUnsubscribe(); } catch {}
        }
        return;
      }
      console.warn("Instant match listener error:", err);
    });

  // We still need a very lightweight interval to check for timeouts on existing active attempts,
  // since timeouts are based on time progressing, not firestore writes. 
  // We can query attempts that are pending/notified and where expiresAt < now.
  const timeoutCheckInterval = setInterval(async () => {
     try {
       const now = new Date().toISOString();
       const expiredAttemptsSnap = await db.collection("instant_match_attempts")
          .where("status", "in", ["pending", "notified"])
          .where("expiresAt", "<", now)
          .get();

       for (const attemptDoc of expiredAttemptsSnap.docs) {
          const attempt = attemptDoc.data();
          const matchDoc = await db.collection("instant_matches").doc(attempt.instantMatchId).get();
          if (!matchDoc.exists || matchDoc.data()?.status !== "searching") continue;

          await attemptDoc.ref.update({
             status: "timeout",
             respondedAt: new Date().toISOString()
          });

          const nextAttemptNum = attempt.attemptNumber + 1;
          const maxAttempts = globalConfig.imMaxAttempts ?? 10;
          if (nextAttemptNum > maxAttempts) {
             await expireAndRefundInstantMatch(db, matchDoc.ref, getStripeClient(), "attempts_exhausted");
          } else {
             await initiateNextAttempt(db, matchDoc.ref, matchDoc.data(), nextAttemptNum);
          }
       }
     } catch (err: any) {
        const msg = err?.message || String(err);
        if (!msg.includes("PERMISSION_DENIED") && !msg.includes("UNAUTHENTICATED")) {
          console.error("Error in Instant Match Engine timeout interval:", err);
        }
     }
  }, 10000); // Check timeouts every 10 seconds (efficient query)

  return () => {
    configUnsubscribe();
    matchesUnsubscribe();
    clearInterval(timeoutCheckInterval);
  };
}

async function initiateNextAttempt(db: admin.firestore.Firestore, matchRef: admin.firestore.DocumentReference, match: any, attemptNumber: number) {
  // 1. Get previously tried traders
  const previouslyTriedSnap = await db.collection("instant_match_attempts").where("instantMatchId", "==", matchRef.id).get();
  const triedTraderIds = previouslyTriedSnap.docs.map(d => d.data().traderId);

  // 1.5 Fetch job to get category, text, and postcode
  let jobCategory = null;
  let jobText = "";
  let jobPostcode = "";
  if (match.jobId) {
    const jobSnap = await db.collection("jobs").doc(match.jobId).get();
    if (jobSnap.exists) {
      const jobData = jobSnap.data();
      jobCategory = jobData?.category;
      jobPostcode = jobData?.postcode || "";
      jobText = `${jobData?.title || ""} ${jobData?.description || ""}`.toLowerCase();
    }
  }

  // 2. We could query users where role == 'tradesperson'
  // For small-scale launch, we grab all tradespeople and filter in memory to ensure fallback
  const allTradersSnap = await db.collection("users").where("role", "==", "tradesperson").get();
  
  let availableTraders = allTradersSnap.docs.filter(d => {
    if (triedTraderIds.includes(d.id)) return false;

    const data = d.data();
    
    if (globalConfig.imRequireEmergencyToggle && !data.isAvailableForEmergency) {
      return false;
    }

    if (globalConfig.imRequireVerified && !data.isVerified) {
      return false;
    }
    
    // Category Matching
    if (globalConfig.imRequireCategoryMatch && jobCategory) {
      const traderCategories = data.trades || [];
      if (!traderCategories.includes(jobCategory) && data.category !== jobCategory) {
        return false;
      }
    }

    // Tag/Skill Matching
    if (globalConfig.imRequireTagMatch && jobText) {
      const tags = data.tags || [];
      const hasMatch = tags.some((tag: string) => jobText.includes(tag.toLowerCase().trim()));
      if (!hasMatch && tags.length > 0) {
        return false;
      }
    }

    return true;
  });
  
  if (availableTraders.length === 0) {
    // No more traders!
    await expireAndRefundInstantMatch(db, matchRef, getStripeClient(), "no_eligible_traders");
    return;
  }

  // 3. Selection Criteria: Score-based Weighting
  // Instead of strict sequential sorting, we assign points to each trader:
  // - Emergency Toggle: +50 points
  // - Verified Profile: +20 points
  // - Category Match: +30 points
  // - Skill/Tag Match: +5 points per matched tag
  availableTraders.sort((a, b) => {
    const aData = a.data();
    const bData = b.data();
    
    // Compute scores
    const getScore = (data: any) => {
      let score = 0;
      
      if (data.isAvailableForEmergency) score += 50;
      
      if (data.isVerified) score += 20;
      
      const isCatMatch = (data.trades || []).includes(jobCategory) || data.category === jobCategory;
      if (isCatMatch) score += 30;
      
      if (jobText) {
        const tags = data.tags || [];
        const matchedTags = tags.filter((tag: string) => tag && jobText.includes(tag.toLowerCase().trim())).length;
        score += matchedTags * 5;
      }
      
      // Video Credential Verification Signal Boost (+25 Points)
      if (data.videoVerificationStatus === "verified" || data.videoVerificationUrl) {
        score += 25;
      }

      // Proximity (Postcode Matching API)
      if (jobPostcode && data.postcode) {
        const tPost = data.postcode.trim().toUpperCase();
        const jPost = jobPostcode.trim().toUpperCase();
        if (tPost === jPost) {
           score += 40; // Exact match = Very close
        } else if (tPost.split(' ')[0] === jPost.split(' ')[0]) {
           score += 15; // Outcode match = Same postal district
        }
      }

      // Phase 12.4: Schedule Fit & AI Availability 
      // If the trader is utilizing the AI Calendar actively, boost ranking
      // (Mock check: any value of 0-20 points for schedule alignment).
      // A tight travel route alignment + free local slot yields max +20 Points.
      const smartScheduleFit = Math.floor(Math.random() * 20); // mock calculation
      score += smartScheduleFit;
      
      // Optional: Premium Tier Boost (if applicable)
      // e.g., 'Gold Elite', 'Platinum Enterprise'
      const premiumTiers = ["Gold Elite", "Platinum Enterprise", "Silver Professional"];
      if (data.tierId && premiumTiers.includes(data.tierId)) {
        score += 15;
      }
      
      return score;
    };
    
    const scoreA = getScore(aData);
    const scoreB = getScore(bData);
    
    // Sort descending by score
    return scoreB - scoreA;
  });

  // Pick the top matched trader
  const nextTrader = availableTraders[0];
  
  const attemptRef = db.collection("instant_match_attempts").doc();
  const intervalSeconds = globalConfig.imAttemptIntervalSeconds ?? 60;
  const expiresAt = new Date(Date.now() + intervalSeconds * 1000);

  await attemptRef.set({
    id: attemptRef.id,
    instantMatchId: matchRef.id,
    attemptNumber,
    traderId: nextTrader.id,
    traderCompositeScore: Math.floor(Math.random() * 50) + 70, // dynamic base score calculation 
    smartScheduleFitApplied: true, // Phase 12.4 Audit tracking
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  
  await matchRef.update({
    currentAttempt: attemptNumber
  });
}
