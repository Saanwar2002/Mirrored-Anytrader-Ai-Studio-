# AnyTrader Financial Reconciliation Plan

Last reviewed: 10 November 2026
Repository: `Saanwar2002/AnyTrader`
Working branch: `integration/pr-consolidation-20261109`
Related draft PR: [#5 — Fix mediation stake payment idempotency and webhook verification](https://github.com/Saanwar2002/AnyTrader/pull/5)
Audited PR head: `6af712f7833f5e60759c87f00f2bc798305210a6`
Integration base observed in PR metadata: `e513c48e65df0fa43dbaf75317fe5a55ead0251e`

## Purpose and safety boundary

This document is the working checklist for the AnyTrader financial audit and reconciliation workstream. It records findings, acceptance criteria, evidence and the order of work.

- AnyTrader only. Taxi/AnyRoller payment, ride, driver-fee and refund changes are out of scope. Preserve their existing behavior.
- Keep PR #5 draft and unmerged. Do not merge to `main`, deploy, change Firebase production state, or perform AI Studio Pull/Push during reconciliation.
- The uploaded AI Studio backup previously identified by the owner remains the authoritative working snapshot for source reconciliation, not proof of deployed Firebase state.
- Preserve AI Studio-only changes. Do not overwrite either side blindly.
- Do not begin application-code remediation until AI Studio/GitHub parity and the required Firebase pre-change checks are reconciled. Documentation and read-only audit work may continue.
- Keep existing branches, applet/workspace and staging evidence intact.

## Current state

| Work item | State | Evidence / note |
|---|---|---|
| Stages 1, 2 and 2B | Complete | Prior audit history |
| Stage 3A financial audit | In progress | Findings FIN-01 through FIN-05 below |
| Stage 3B remediation | Not started | No remediation commit recorded by this review |
| Integration / merge / deployment | Not authorised | PR #5 remains draft and unmerged |
| PR #5 CI | Pass, historical | Run #455 / `42621657222`, commit `6af712f...`; does not validate future fixes |
| AI Studio/Firebase live parity | Unverified | Must complete pre-change gate before code changes |

## Findings and acceptance criteria

### FIN-01 — Stripe webhook lease fencing (High)

**Finding:** The webhook claims `processed_stripe_events/{event.id}` with a processing lease and a generated worker ID. A duplicate delivery is held off while the lease is fresh, but completion/failure writes are not conditioned on the claiming worker still owning the lease. If a worker runs beyond lease expiry and another worker reclaims the event, the stale worker can still write terminal state or finish side effects.

**Required remediation:**
- Generate a unique fencing token for each claim/reclaim and persist it with the claim.
- Carry the token through processing.
- Before every terminal transition (completed, rejected, failed) and any ownership-sensitive recovery write, use a transaction to verify the stored token still matches.
- A stale worker must not mark an event complete or overwrite the current owner's state.
- Preserve retryable behavior for active/failed work; do not acknowledge unfinished work.

**Tests:** concurrent duplicate delivery; lease expiry and takeover; stale worker completion after takeover; stale worker failure after takeover; completed/rejected duplicate acknowledgement; transient failure retry.

### FIN-04 — Generic idempotency resource/payload binding (High)

**Finding:** The generic `executeIdempotentOperation()` path records the operation name but does not adequately bind a key to its authenticated owner, target resource and canonical request payload. Reusing a key for a different resource or materially different payload risks replaying the wrong result or suppressing a legitimate operation.

**Required remediation:**
- Bind each idempotency record to authenticated user ID, operation type, resource ID, and a deterministic hash of canonical validated payload.
- On replay, require all bindings to match; otherwise return a conflict without performing side effects.
- Persist and replay the original result only for an exact matching request.
- Define canonicalization explicitly (stable key ordering, normalized minor-unit amounts/currency, validated identifiers); never hash untrusted raw request JSON.
- Retain records for the documented retry/replay window and ensure concurrent first requests create only one operation.

**Tests:** same key/same owner/resource/payload replay; same key with different owner, operation, resource or payload rejected; concurrent requests; canonical-equivalent payload behavior; original result replay.

### FIN-02 — Stripe refund pagination (High)

**Finding:** The `charge.refunded` webhook processes only `charge.refunds.data` from the embedded Charge object. It detects `charge.refunds.has_more` and creates a manual-review record, but does not retrieve and reconcile the remaining Stripe refund pages. The event is subsequently marked reconciled despite that incomplete page coverage.

**Required remediation:**
- Retrieve all refund pages for the Charge from Stripe using the supported paginated list API and cursor (`starting_after`).
- Validate each refund's Charge, PaymentIntent and currency against the event and selected original ledger entry.
- Deduplicate by Stripe refund ID; reconcile every individual refund through `recordConfirmedRefund`.
- Preserve transactionally enforced cumulative refund limits and manual-review handling for ambiguous/mismatched records.
- Mark the refund event fully reconciled only after every page is processed; record pagination/cursor failures as retryable/incomplete, not complete.

**Tests:** more than one page; duplicate refund across retries; partial refunds across pages; cursor/API failure then retry; mismatched PI/currency; cumulative total cannot exceed original captured amount.

### FIN-03 — Escrow release recovery identity (High)

**Finding:** Firestore milestone state changes and Stripe transfer execution are separate operations. An ambiguous transfer failure can leave the release marker cleared or retryable, allowing a subsequent attempt to use a different idempotency key and create a duplicate transfer.

**Required remediation:**
- Create and persist one durable release-operation identity before calling Stripe.
- Bind it to the milestone, job, payee/connected account, amount, currency and canonical transfer parameters.
- Reuse the same Stripe idempotency key and operation identity after timeouts, worker restarts or ambiguous outcomes.
- Do not clear/reset the operation identity merely because a Stripe request timed out or returned an ambiguous error.
- Reconcile the Stripe transfer result to the same ledger operation before allowing a new release attempt; mismatches go to manual review.

**Tests:** concurrent release requests; timeout after Stripe accepted transfer; worker restart; retry reuses identical key; conflicting payee/amount/resource rejected; exactly one transfer and one corresponding ledger entry.

### FIN-05 — Cross-operation financial consistency (High)

**Finding:** There is no sufficiently complete cross-operation verification proving that payment capture, escrow/milestone state, ledger entries, refunds and payouts agree as one lifecycle.

**Required remediation:**
- Add a read-only reconciliation service/report keyed by the authoritative payment and business-resource identifiers.
- Compare captured Stripe amounts/currency with original ledger entries.
- Compare milestone funded/released state with escrow balances, transfer IDs and payout ledger entries.
- Compare each Stripe refund ID/amount with refund records, cumulative refund totals and reversal ledger entries.
- Detect missing, duplicated, orphaned, mismatched and over-allocated operations.
- Produce actionable discrepancy records with source IDs and status; never auto-correct money movement or mutate financial history in the reconciliation pass.
- Define and test invariants before any automated repair workflow is considered.

**Tests:** balanced lifecycle; missing ledger entry; duplicate transfer/refund; amount/currency mismatch; orphaned payout; escrow released without matching transfer; refunded amount above capture; reconciliation is read-only.

## Ordered execution plan

1. Finish Stage 3A: inspect all affected payment, escrow, webhook, idempotency and payout paths; record exact file/function evidence and confirm AnyTrader-only boundaries.
2. Complete AI Studio ↔ GitHub source reconciliation using the owner-confirmed backup. Preserve AI Studio-only changes and the integration-only documentation/workflow changes. Do not press Pull or Push while both sides show divergence.
3. Complete the Firebase pre-change review: project/database IDs, deployed rules/indexes, Auth, Storage, App Check, IAM/secrets and staging target. Distinguish repository configuration from live verified state.
4. Implement FIN-01 fencing first, with focused regression tests.
5. Implement FIN-04 idempotency binding next, with exact replay/conflict tests.
6. Implement FIN-02 complete refund pagination and retry-safe reconciliation.
7. Implement FIN-03 durable escrow release identity and ambiguous-outcome recovery.
8. Implement FIN-05 read-only cross-operation reconciliation and discrepancy tests.
9. Run targeted tests, Firebase emulator/security suites, full unit suite, typecheck, production build and release audit. Record exact commit and CI run for every gate.
10. Review the complete diff for AnyTrader-only scope, preservation of taxi/AnyRoller behavior, no secret/generated files, and no unintended financial side effects.
11. Only after owner review and explicit authorisation may the reconciliation proceed to merge/deployment planning. This plan itself does not authorise either.

## Audit observations from 10 November 2026

- PR #5 is open, draft and unmerged; it targets `integration/pr-consolidation-20261109`.
- PR #5 head is `6af712f7833f5e60759c87f00f2bc798305210a6`; its current CI run #455 completed successfully. This is historical evidence for that exact commit only.
- The PR diff includes taxi/Instant Match refund-worker changes. The master build plan explicitly defers taxi/AnyRoller refund and webhook work. Do not carry taxi-side behavior changes into the AnyTrader integration candidate; preserve existing taxi behavior.
- The PR's refund handler currently flags `charge.refunds.has_more` for review rather than retrieving all pages.
- The webhook claim path currently uses a time lease but does not fence terminal writes by claim ownership.
- No application-code remediation, merge to main, Firebase deployment or production change is recorded by this review.

## Evidence links

- [PR #5](https://github.com/Saanwar2002/AnyTrader/pull/5)
- [CI run #455](https://github.com/Saanwar2002/AnyTrader/actions/runs/42621657222)
- [Master build plan](./MASTER_BUILD_PLAN.md)
- [AI Studio/Firebase pre-change review](./AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md)


### Additional code-level evidence confirmed on 10 November 2026

- `FIN-01`: `server.ts` claims a webhook with `status: processing`, `claimedAt` and `workerId`, but later marks the event completed/failed without checking that the worker still owns the current claim. The five-minute lease alone does not fence a stale worker.
- `FIN-04`: `PaymentLedgerEngine.executeIdempotentOperation(db, idempotencyKey, operationName, executor)` stores `operationName`, status and response, but not authenticated owner, resource ID or canonical payload hash. The driver payout route passes a client-supplied key and the driver ID is only captured inside the executor; the idempotency record itself is not bound to that driver/amount/account.
- `FIN-03`: `PaymentLedgerEngine.executeStripeEscrowTransfer` constructs a Stripe key from job/quote/milestone and the supplied idempotency key. In the milestone-release route in `server.ts`, a failed transfer causes a Firestore rollback that explicitly sets `releaseOperationId: null`. This discards the original operation identity and permits a retry to mint a different key after an ambiguous Stripe outcome. Do not confuse this escrow path with the separately fenced driver-payout orchestration, which already uses a unique payout claim token.
- `FIN-02`: the `charge.refunded` handler processes only the embedded `charge.refunds.data` array, writes a manual-review marker when `has_more` is true, then marks the refund event `reconciled` with `requiresPaginationReview`. This is explicitly incomplete reconciliation, not a successful full-page reconciliation.

These are source-level findings from the PR #5 head, not runtime or live-Stripe verification. Remediation still requires the AI Studio/Firebase pre-change gates and regression tests above.
