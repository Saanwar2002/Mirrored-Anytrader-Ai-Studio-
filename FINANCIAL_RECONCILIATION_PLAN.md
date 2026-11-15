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
| Stage 3A financial audit | Source review substantially complete; historical/production evidence remains | FIN-01–FIN-05 mapped to current code and acceptance gaps documented |
| Stage 3B remediation | In progress; substantial code + tests landed | FIN-01 fencing, FIN-02 pagination, FIN-03 recovery guard, FIN-04 binding, FIN-05 evaluator/collector; see status matrix below |
| Integration / merge / deployment | Integration branch CI-ready; promotion not authorised | Exact HEAD 38b4173; run #990 green; PR #5 remains draft/unmerged; no main/deploy/live mutation |
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


## FIN-03 progress — 10 November 2026

The integration branch now conservatively locks ambiguous escrow transfer outcomes: a Stripe transfer exception is recorded as `reconciliation_required`; the milestone retains its original release operation key and released state; and a different caller key is rejected. New transfers also carry explicit Stripe metadata (`releaseOperationId`, deterministic `stripeIdempotencyKey`, `operationType`, job, quote, milestone and trader identifiers) to support later read-only matching. Focused regression assertions were added for ambiguous outcomes, retry-key rejection and transfer metadata.

Commits: `3ff058a1b91066ca25081c82c54e2d6d9b19a6b7`, `f5b2c06a0ca676988267bf7f28d1f04dfc015667`, `14a8c58595f8653748d67af9967ee24d5aa8a965`, `109d10da2ca8f7ecf743d12ca62958e54f39b16e`, `061475123b34bcda9f06940f5c35a293f8aef953`, `e6448fcd96f1b81971c4edd78a3bd0aad8abdb0d`, with plan records `d53829d80a8a6df01d59afb0f1cb299765417803`, `6214245f09e3440d41143d402dac0981aa5302a9` and `fc0f6c45155d683138453fe145474a2df5bf646a`.

**Still open:** there is not yet an automated read-only Stripe transfer lookup/reconciliation worker. Implement that only with pagination, exact identity/destination/amount/currency matching and manual-review handling for zero, multiple, legacy or mismatched candidates. Never create a replacement transfer as part of reconciliation. Test execution and CI remain blocked by pre-runner GitHub Actions failures; no live financial operations were run.


## FIN-02 source-of-truth correction — 10 November 2026

The earlier PR #5-head observation about `charge.refunded`, embedded `charge.refunds.data` and `requiresPaginationReview` is historical and must not be attributed to the current integration branch. At integration HEAD `b430e240d0d0a8fdb3c6372d7176a036d8db08f8`, the `POST /api/webhook` dispatch in `server.ts` contains checkout completion and subscription lifecycle handling, but no `charge.refunded` branch, embedded refunds iteration or `stripe.refunds.list` pagination. The complete, non-truncated 715-entry Git tree has no separately named refund/webhook handler module.

FIN-02 therefore remains open at source-of-truth discovery: locate the current refund persistence/recording contract and determine whether refunds are intentionally ingested elsewhere before adding webhook code. Do not restore the historical ZIP/PR #5 handler blindly. If a webhook is required, it must retrieve every refund page, validate charge/PaymentIntent/currency identity, deduplicate refund IDs, enforce cumulative limits, and remain retryable on incomplete retrieval. No live Stripe/Firebase operations were performed and no tests were run for this source review.


## FIN-02 additional finding — Instant Match timeout refund initiation (10 November 2026)

The current integration branch does have an active refund-creation side effect, although it has no `charge.refunded` webhook ingestion branch. `server.ts` imports `startInstantMatchEngine` from `instantMatchWorker.ts` and invokes it at startup. The worker calls `stripe.refunds.create` when an Instant Match exhausts its attempts, from both the Firestore snapshot listener and a 10-second timeout interval.

Neither call supplies a Stripe idempotency key. The worker marks the match expired before the refund call, does not persist a refund ID or durable refund-operation status, and catches/logs errors without a retryable state. The two triggers can overlap; a crash or ambiguous response can leave an expired match with an unknown refund outcome. This is refund initiation, not refund-level ingestion/reconciliation.

Required remediation: one durable per-match refund operation shared by both triggers, with claim-token fencing, stable Stripe idempotency identity, pending/ambiguous/confirmed/manual-review states, persisted Stripe refund ID, and retry/reconciliation that checks the Stripe outcome before creating anything. Add mocked Stripe/Firestore regression tests. No code change or live Stripe/Firebase operation was performed during this audit.


## FIN-02 / Instant Match — production payment identity gap (10 November 2026)

Tracing the Stripe checkout fulfillment path reveals that production-created Instant Match documents do not store the Checkout Session's PaymentIntent ID. The `checkout.session.completed` transaction creates the match with job/customer, `chargeAmountPence`, tier, status and timestamps, while the worker's refund branches require `match.stripePaymentIntentId`. Thus the current worker cannot identify the payment to refund for the normal webhook-created match. The mock checkout path also omits this field and is not evidence of a production payment identity.

Additionally, `initiateNextAttempt` expires a match immediately when it finds no eligible traders, without entering either refund branch. This is a separate missed-refund path from the duplicate/ambiguous Stripe request risk already recorded above.

Remediation order: (1) establish the authoritative PaymentIntent from the verified Stripe Checkout Session and persist it atomically with match fulfillment; handle a missing/not-yet-associated PaymentIntent explicitly rather than inventing an ID; (2) route both attempt exhaustion and zero-eligible-trader expiry through one durable refund-operation coordinator; (3) add claim fencing, a stable Stripe idempotency key, persisted refund ID and reconciliation-required handling for ambiguous results; (4) test all terminal paths and concurrent triggers with mocks. No live Stripe/Firebase access or source-code change was performed for this finding; tests remain unexecuted.


### Instant Match payment-identity trace — 10 November 2026

The production Checkout Session creation route writes a trusted `payment_intents/{intentId}` record containing `checkoutSessionId`, currency and the Stripe-created `paymentIntentId`. The Checkout Session metadata carries the server-generated `intentId`, and the Instant Match fulfillment marker records that same intent ID. However, the production webhook's `instant_matches` document omits the PaymentIntent ID and does not read/validate the corresponding payment-intent registry record; the worker's refund guards therefore do not see the identity. In addition, the worker's no-eligible-traders expiry path does not enter the refund flow.

Remediation should validate the registry record's `checkoutSessionId` against the webhook's session and require a non-empty PaymentIntent ID before persisting it to the match. Missing, mismatched or incomplete identity must be held for retry/manual review, never guessed. Route all terminal no-match paths through one durable, idempotent refund operation. This finding is source review only; no code change or live Stripe/Firebase operation was performed, and tests remain unexecuted.


### Correction — checkout webhook already validates the payment-intent registry

The common `checkout.session.completed` webhook preamble already loads `payment_intents/{session.metadata.intentId}` and validates it against the Stripe Checkout Session using `evaluateCheckoutIntentBinding`. It checks the session/user/mode/amount/currency binding and any PaymentIntent ID already stored; pending bindings remain retryable and mismatches are marked for review. Thus, the registry is not missing and the webhook does not need a second lookup. The actual defect is that the Instant Match-specific fulfillment transaction omits the already-validated `intent.paymentIntentId` when creating `instant_matches/{matchId}`. Also require a non-empty PaymentIntent ID for paid Instant Match refunds: the shared binding helper allows null IDs for product flows that legitimately have none. Preserve the missing-identity review state rather than silently skipping a refund. The no-eligible-traders terminal path still bypasses refund initiation. This correction supersedes the earlier sentence suggesting the webhook does not read/validate the registry; no live operation or code change was made.

## Integration branch remediation progress — 11 November 2026

This section supersedes the older "Stage 3B remediation: Not started" status above. It records source changes on `integration/pr-consolidation-20261109` only; it does not certify live Stripe/Firebase state or authorize merge/deployment.

### FIN-01 — webhook lease fencing

- The current webhook claim stores a unique `claimToken` on each claim/takeover.
- Fulfillment/review mutations check current ownership; terminal completion and failure writes are transactionally fenced by the token.
- `ownsStripeWebhookClaim` and stale-claim decision tests exist.
- Remaining acceptance gap: add route-level/concurrent integration tests proving a stale webhook worker cannot commit a financial side effect after takeover. Treat FIN-01 as implementation-present, test-hardening-open.

### FIN-04 — generic idempotency binding

- `PaymentLedgerEngine.executeIdempotentOperation` canonicalizes semantic binding keys, hashes the validated binding, rejects mismatched operation/binding replays, and fences stale executors with a claim token.
- Current financial call sites bind the relevant owner and resource context: funding includes customer/job/milestone/payment intent/amount/currency; release includes authenticated caller/job/quote/milestone/authorization mode; driver payout includes driver/connected account/currency/amount mode and amount.
- Remaining acceptance gap: expand adversarial tests across owner, resource, operation and canonical-payload variations; verify raw client keys cannot create unsafe document paths. FIN-04 is substantially implemented, final audit/tests open.

### FIN-03 — escrow transfer recovery and response binding

- Ambiguous Stripe outcomes retain the original release identity and require reconciliation; different operation keys cannot silently create a second release.
- Stripe transfer responses are checked against the requested transfer ID, amount, GBP currency, connected-account destination and full operation metadata before being marked completed.
- The release route passes the exact ledger entry ID to the Stripe side-effect handler. The fallback lookup is also constrained by job, quote, milestone and release type rather than updating the first row with a matching client idempotency key.
- Mismatch/ambiguous outcomes remain reconciliation-required; reconciliation does not create a replacement transfer.
- CI run `43064977003` passed all stages at commit `c3dfecf10db0c064b48a2b0bbda1d911642a0491`. This run includes transfer response validation, exact ledger binding and the LedgerEntry identifier typing fix.

### FIN-02 — Instant Match refund initiation and reconciliation

- Paid Instant Match fulfillment now persists the already-validated PaymentIntent ID; missing identity is held for manual review. The no-eligible-trader path uses the same expiry/refund coordinator as attempt exhaustion.
- Refund initiation reserves one durable per-match operation with a stable Stripe idempotency key, amount/currency/PaymentIntent binding, a claim token and a five-minute lease.
- Expired processing claims can be reclaimed with the same Stripe idempotency key only inside a conservative 23-hour retry window. Stale workers cannot overwrite a successor claim; pending Stripe responses receive a retry cooldown; expired/unknown idempotency windows require reconciliation rather than a new refund.
- The read-only Stripe refund inspector scans all PaymentIntent refund pages, rejects malformed/non-advancing pagination, deduplicates repeated refund IDs, flags multiple/mismatched candidates, and only reports a match when the Stripe refund status is `succeeded`.
- CI run `43065421728` passed all stages at commit `aaa5f364aa95965683dc6a46f3565b3415d2c170` for the refund-inspector changes. The subsequent claim-fencing and pending-response cooldown changes also passed all stages: run `43065811061` at commit `8a8d01397939cbb9cd935efc26ece68e53640f9a` and run `43066046301` at commit `6d8a16f3262fe90dcf4b15ab99131aa1d5ed5c38` both completed successfully.

### FIN-05 — cross-operation read-only reconciliation

- Still open. Next work is a read-only discrepancy report keyed by PaymentIntent, original ledger entry, job/quote/milestone, Stripe transfer ID and Stripe refund ID.
- It must report missing, duplicate, orphaned, mismatched and over-allocated records without changing ledger history or initiating/canceling Stripe operations. Build the pure invariant evaluator and tests before wiring any scheduled/admin runner.

### Scope and execution guardrails

- All code/documentation changes in this progress section are on `integration/pr-consolidation-20261109`.
- No merge, deployment, production Firebase mutation, live Stripe financial operation, or AI Studio Pull/Push was performed.
- No local test execution is claimed. CI status is cited per exact commit above; newer pending commits remain unverified.

### FIN-02 — Charge refund webhook pagination — 11 November 2026

- The `charge.refunded` and `refund.updated` paths now retrieve the complete Charge refund collection through Stripe's `refunds.list({ charge, limit: 100, starting_after })` API rather than relying on the embedded Charge expansion or processing only the triggering refund.
- Added `src/server/stripeRefundPagination.ts` to follow every cursor, deduplicate repeated refund IDs, and fail closed on malformed pages, missing IDs, non-advancing cursors or conflicting financial details for a repeated ID. A Stripe retrieval failure propagates so the webhook is not marked complete against an incomplete page set.
- Each returned refund is checked against the exact Charge ID, PaymentIntent ID and currency before ledger reconciliation. The event records the number of pages scanned. A stale pagination-only review marker is cleared only after the complete list has been fetched.
- Added focused tests in `tests/unit/stripeRefundPagination.test.ts` for multi-page retrieval, cursor use, duplicate handling, conflicting duplicate details, malformed responses and non-advancing pagination.
- Integration-branch commits: `3a15d55a0dac65cce8f5f9e579d99910cd830f02`, `0470442f1854c0792469a94262029a4df6615b9f`, `d78f3b39673d26d958a83f7ac7ef024104cb2a58`, `5a191b29880c83f8f7dea5ab150886f3f23b10ef`, `c8d0039d699f8138c54d469d93ad8a7845929466`.
- **Verification pending:** no local test execution is claimed. The latest commit's combined status endpoint currently returns no status checks; the push-triggered CI result must be checked before treating this remediation as verified. No live Stripe/Firebase operation was performed.



## FIN-04 final audit hardening — 11 November 2026

The formal FIN-04 scope remains generic idempotency resource/payload binding. The implementation already canonicalizes semantic bindings and binds them to the operation name, but final review found two additional gaps:

1. An expired `in_progress` claim is moved to `reconciliation_required` and blocks the current call, but a later call previously could fall through and replace that state with a new claim. This could replay a possibly completed external financial effect.
2. Caller-provided idempotency keys were used directly as Firestore document IDs without rejecting path separators or bounding their length.

Both are corrected on `integration/pr-consolidation-20261109`:
- Existing `reconciliation_required` and unknown operation states now fail closed on every replay.
- Keys containing `/` or exceeding 200 characters are rejected before Firestore access.
- Regression tests now cover a second retry after the reconciliation stop state, canonical object-key ordering, owner/resource mismatch, and unsafe/oversized keys.

Commits: `d8784e5ad57ad170a69dde7b9d50c4e96298d6c3` and `bce37dd205ff58046057286c9fad6b3504afda62`.

**Verification pending:** no local execution is claimed; run the focused `tests/unit/paymentLedger.test.ts` suite and full CI against the exact integration head before marking FIN-04 complete.

The domain-event dispatcher observation recorded in the unified plan is a separate supplementary reliability finding; it is not the formal FIN-04 scope and does not change this acceptance criteria.


## Exact-head CI validation — 11 November 2026

The current integration head at the time of verification was `c6cddd4cef5b5aa93f4e92ca59a21f18e5f0e6bb`. GitHub Actions run **#958** (`43101671335`) for that exact SHA completed successfully. Its `security-and-build-gate` job passed Firebase Security Rules/Firestore emulator concurrency tests, unit and penetration tests, TypeScript/lint, production build and final release audit.

Accordingly, the FIN-04 hardening and driver payout stale-worker regression committed before this SHA have passed the full CI gate. FIN-02 changes are also included in the successful exact-head run. This is repository CI evidence only; no live Stripe/Firebase production reconciliation was performed.

FIN-05 remains open: implement a pure read-only cross-operation discrepancy evaluator with fixtures for missing, duplicate, orphaned, mismatched and over-allocated records. FIN-01 route-level stale-worker integration tests remain open. Supplementary durable per-consumer domain-event delivery/retry is a separate reliability workstream, not formal FIN-04.


## FIN-05 implementation checkpoint — 11 November 2026

Added a pure, snapshot-only evaluator in `src/server/financialReconciliation.ts` and deterministic tests in `tests/unit/financialReconciliation.test.ts`. It reports duplicate ledger IDs; capture-ledger absence/amount/currency mismatch; duplicate/orphaned/mismatched succeeded refunds and refund totals over capture; payout/Stripe transfer amount, currency and destination mismatches; missing or orphaned transfer evidence; released escrow missing transfer identity; and payout destination over-allocation against explicit caps.

The evaluator does not access Firestore/Stripe, mutate supplied snapshots, infer an allocation cap, or initiate a financial action. It is not yet wired to a runner. Commits: `638dc4a`, `051c3e4`, `0a80f0e`, `1466f8e`.

**Status: implementation started, validation pending.** Run the focused Vitest file and full exact-head CI; review multi-capture/duplicate handling and transfer identity assumptions before acceptance. FIN-01 route-level stale-worker tests and durable per-consumer domain-event delivery remain open.


## FIN-05 hardening checkpoint — 12 November 2026

Evaluator and tests extended to detect duplicate Stripe transfer identities and refund-ledger PaymentIntent cross-link mismatches. Commits: `88e545b`, `692e9cf`. CI at exact test commit SHA `692e9cf6a0ead3a035b2fb67b2432fd6dca9c6d1` is pending. Prior run #966 was at docs-only SHA `f65f971`; #967 at evaluator SHA `88e545b`. FIN-05 remains unvalidated pending complete exact-head CI.

The pure evaluator is not a production runner: no Firestore/Stripe data collection, pagination, endpoint, mutation, repair, or money movement exists. Continue with bounded read-only collection only after schema and access review. FIN-01 route-level stale-worker test and durable domain-event delivery remain open.


## CI failure + repair — FIN-05 (12 November 2026)

Runs #968 (test commit `692e9cf`), #969 (docs), and #970 (docs) failed in Unit & Pen-Testing because `tests/unit/financialReconciliation.test.ts` contained literal `\\n` characters at line 91, causing esbuild syntax error. The evaluator code commit #967 (`88e545b`) passed its CI. CI output shows 1,264 existing tests passed; the FIN-05 test suite failed to parse and therefore did not execute.

Corrected newline and committed `723475d38860444911554ead29b3d27d60c5705d`. Exact-head CI pending; keep FIN-05 status open until all stages pass.


## FIN-05 collector checkpoint — 12 November 2026

Implemented bounded, read-only collection in `src/server/financialReconciliationCollector.ts` and tests in `tests/unit/financialReconciliationCollector.test.ts`. It scans ledger, payout operations, PaymentIntent registry, refund totals/operations/records, jobs and nested quotes; retrieves Stripe PaymentIntents and exhaustively paginates per-intent refunds plus transfers within a global page budget. Any malformed page/cursor or budget overflow throws; no partial snapshot is returned. Stripe `transfer_data.destination` is the authoritative destination-charge signal. Missing escrow release ledger evidence and reconciliation-required payouts without transfer IDs are now evaluator findings.

Exact integration HEAD `acd6834e2591829be2ace6f238206711b404922e` passed full CI run #983 (`43131521528`) including emulator/security, unit/pen-testing, TS/lint, build and audit. Collector is not yet invoked against production and no real financial report or mutation was performed. Remaining acceptance: historical schema coverage/source completeness review, safe operator-only report entry point, FIN-01 route-level stale worker test, and supplementary domain-event durable consumer delivery.


## FIN-01 webhook fencing checkpoint — 12 November 2026

Webhook claim terminal writes now use `completeStripeWebhookClaim` and `failStripeWebhookClaimIfOwned` helpers in `src/server/stripeWebhookIdempotency.ts`. Both reread claim ownership transactionally; stale completion throws and stale failure returns false without touching successor state. Tests exercise owner completion, stale worker completion/failure against a successor lease, and owner failure. Server webhook route calls both helpers.

Exact HEAD `1cde50b25ea8de0d9c901f34871febac747d1bd1` passed CI #986 in full (emulator/security, unit/pen-testing, TS/lint, build, release audit). This is helper and handler wiring coverage, not a full two-request route concurrency test. Remaining: route-level lease-takeover regression and FIN-05 production-safe operator report path (read-only only).


## FIN-05 source schema audit — 12 November 2026

Reviewed collector mappings against current writers. Payment ledger release records are stored under `payment_ledger`; quote milestones under `jobs/{jobId}/quotes/{quoteId}.milestones[]` link via `escrowReleaseLedgerId`; transfer metadata uses `jobId`, `quoteId`, `milestoneId`, `releaseOperationId`, `operationType=ANYTRADER_ESCROW_RELEASE`; transfer amount is net payout in minor units. Refund record docs keyed by Stripe refund ID persist PaymentIntent in `transactionId`, with operation and aggregate fields aligned to collector. Checkout intent registry internal doc ID differs from Stripe PaymentIntent ID, and collector reads explicit `paymentIntentId`. Destination charge skip behavior is confirmed in release code.

Schema mapping is confirmed for current write paths, not every historical document variant. Legacy orphan/missing evidence remains reportable/manual review; no production dataset was accessed.


## Current acceptance matrix — 12 November 2026

| Workstream | Current state | Verified evidence | Remaining acceptance / boundary |
|---|---|---|---|
| FIN-01 webhook lease fencing | Implemented at claim helper + production handler | Owner-checked terminal transitions and stale-worker unit tests; exact ancestor SHA passed CI #986; current branch CI #990 green | Route-level two-request lease takeover integration test remains follow-up; not full end-to-end race proof. |
| FIN-02 refund pagination | Implemented in integration | Full Stripe refund pagination helper, identity/currency checks, dedupe/fail-closed cursor tests; included in current exact-head CI #990 | Historical refund source variants and live data not audited. |
| FIN-03 escrow recovery identity | Conservative recovery guard implemented | Ambiguous outcome keeps operation identity; idempotency key reuse and metadata tests; current branch CI #990 green | Automated read-only transfer lookup/reconciliation for zero/multiple/legacy candidates remains open; never create replacement transfer in reconcile. |
| FIN-04 idempotency binding | Implemented/hardened | Owner/resource/operation/canonical payload binding, fail-closed reconciliation state, unsafe key checks; current branch CI #990 green | Historical records and real concurrent external-operation behavior require review; no live money operation. |
| FIN-05 cross-operation reconciliation | Evaluator + bounded read-only collector + source-schema audit | Fixtures and current-writer mapping; current branch CI #990 green | No operator report runner executed; production data not accessed. Safe report entry point and historical variants remain. |
| CI/release gate | PASS at exact current branch HEAD | Run #990 43177128010, SHA 38b417309fa8b44ed0cbd3c2724a05dea10b6768, all release gate jobs completed success | Gemini changes must rerun CI on their new commit SHA. |

## Promotion and Gemini hand-off gate

This branch is the reconciliation candidate, not an instruction to merge or overwrite main. Use GEMINI_AI_STUDIO_RECONCILIATION_HANDOFF.md before any AI Studio Pull/Push. Preserve AI Studio-only edits, pull only after comparing the workspace against this exact branch, and push Gemini edits to integration first. Main promotion requires explicit owner approval, full diff review and exact-head CI green; no direct push to main is authorized by this plan.

---

## Task-616 & Unified Workspace Reconciliation Status (12–13 November 2026)

This section records the unified integration in `/app/applet` combining `AnyTrader-main` (`AnyTrader-main_be48a8f2.zip`, baseline `38b417309fa8b44ed0cbd3c2724a05dea10b6768`) with the Task-616 workspace deliverables:

### Preserved & Unified Task-616 Components
1. **FIN-01 (`src/server/stripeWebhookHandler.ts`, `server.ts`, `tests/unit/task6StripeWebhookTakeover.test.ts` — 8/8 passing)**:
   - `claimStripeEventLease`, `markStripeEventCompleted`, and `markStripeEventFailed` now coordinate both `workerId` and `claimToken` fencing (`ownsStripeWebhookClaim` from `src/server/stripeWebhookIdempotency.ts`) inside `/api/webhook` in `server.ts`.
   - Active leases (`< 5 min`) return HTTP 200 without duplicate side effects; stale leases (`> 5 min`) are atomically reclaimed with `takeoverFromStaleWorker: true` and `previousWorkerId` logging; stale zombie workers are rejected (`staleRejected: true`).
   - Concurrent two-worker integration suite (`FIN-01: Concurrent Two-Worker Webhook Lease & Fencing Integration Verification`) deterministically verifies via controlled promise barriers and `vi.useFakeTimers()` (`STALE_LEASE_THRESHOLD_MS = 300000` preserved):
     - Worker A claims lease and pauses; fresh duplicate delivery is suppressed without invoking side effects.
     - After fake-clock advance past 5 minutes, Worker B reclaims the stale lease with a fresh `workerId` + `claimToken` and completes cleanly (`status: "completed"`).
     - Worker A resuming (on both completion path and timeout/error failure path) receives `{ success: false, staleRejected: true }` without overwriting Worker B's active or completed terminal state.
     - Explicit `claimToken`-only transaction fencing rejects stale tokens; post-completion duplicates return HTTP 200 with zero repeat side effects; transient failures transition to `"failed"` and remain immediately retryable.
   - **Honest Implementation / Environment Note**: `createStripeWebhookHandler` relies on per-request `assignedWorkerId` for stale rejection and ignores `{ staleRejected: true }` when returning HTTP 200, whereas `server.ts` `/api/webhook` explicitly forwards `claimToken` to `claimStripeEventLease`, `markStripeEventCompleted`, and `markStripeEventFailed`, enforces `ownsStripeWebhookClaim` inside mid-flight transactions, and throws (returning HTTP 500) if completion fencing fails. Real Firestore emulator verification (`npm run test:security-rules`) requires Java (`temurin` 21 in GitHub Actions CI) and was not executed in the Java-less container.
2. **FIN-03 (`src/server/escrowRecovery.ts`, `tests/unit/task6EscrowRecoveryEvidence.test.ts` — 7/7 passing)**:
   - `EscrowRecoveryEngine.inspectTransferEvidence()` remains 100% strictly read-only (`moneyMovementAttempted: false`, `ledgerUpdated: false`, zero Firestore writes, zero Stripe transfer creation calls).
   - `applyLedgerEvidenceRepair()` remains explicitly separated and requires `RESOLVED_EXACT_MATCH`.
3. **FIN-05 (`src/server/reconciliationReport.ts`, `server.ts`, `tests/unit/task6ReconciliationReport.test.ts` — 10/10 passing, `tests/unit/task6ReconciliationReportRoute.test.ts` — 4/4 passing)**:
   - Mounted at `GET /api/admin/financial-reconciliation/report` behind `requireAdmin`, enforcing `1 <= limit <= 100`, integer `offset >= 0`, V6/V7/V8 schema normalization, and Stripe transfer ID masking (`tr_s...7890`).
   - Complements `main`'s pure evaluator (`src/server/financialReconciliation.ts`) and bounded collector (`src/server/financialReconciliationCollector.ts`).

### Unified Verification Baseline (14 November 2026)
- **Focused FIN-01 Suite (`npx vitest run tests/unit/task6StripeWebhookTakeover.test.ts`)**: **8 / 8 passing** (5 takeover scenarios + 3 concurrent two-worker integration scenarios).
- **Safety Boundaries**: No production Firebase mutation, no deployment, no live Stripe transfer or ledger mutation, and no GitHub push was performed.
