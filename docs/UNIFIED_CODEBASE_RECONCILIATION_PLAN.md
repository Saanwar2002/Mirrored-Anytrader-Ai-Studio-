# AnyTrader — Unified Codebase Reconciliation Plan

**Version:** 1.0  
**Prepared:** 9 November 2026  
**Status:** In progress — read-only audit and reconciliation planning  
**Repository:** [Saanwar2002/AnyTrader](https://github.com/Saanwar2002/AnyTrader)  
**Working branch:** `integration/pr-consolidation-20261109`  
**Final destination:** `main`

> **Instruction to future agents:** Read this document before making changes. Re-fetch current GitHub branch heads and PR state; all branch counts, file comparisons and other observations below are historical and must be verified before acting.

---

## 1. Mission and definition of done

The objective is to establish **one complete, validated codebase in the original repository `Saanwar2002/AnyTrader`, on `main`**, so Google AI Studio can safely synchronise that code into the existing AI Studio workspace. Gemini must then be able to continue development and push reviewed changes back to the same repository and branch.

The work is a reconciliation of three development states—not a simple pull or push:

1. The recent Google AI Studio workspace, represented by the recoverable ZIP backup.
2. The original GitHub `main`.
3. The existing GitHub integration work, including relevant PR #5 financial/security changes.

**Done means:**
- AI Studio-only functionality and files are preserved.
- Approved integration-branch work is retained.
- Relevant PR #5 work is reviewed and incorporated where appropriate.
- Conflicts are resolved deliberately, especially security, payments and configuration.
- The unified candidate passes agreed tests and CI.
- The reviewed candidate is merged into the original repository's `main`.
- AI Studio is safely synchronised from that `main`.
- A controlled round-trip proves Gemini can pull, develop, push, and resynchronise without losing work.

## 2. Why reconciliation is necessary

The AI Studio GitHub panel was connected to `Saanwar2002/AnyTrader` on `main` and reported changes on both sides (screenshot history showed last sync on 6 November 2026). Recent Gemini work had not all been pushed. Meanwhile, ChatGPT-assisted improvements were made in GitHub, including work on an integration branch that AI Studio did not have.

Therefore:
- Pulling from the currently diverged AI Studio panel before reconciliation may introduce conflicts or overwrite workspace work.
- Pushing from that panel before reconciliation may overwrite or conflict with GitHub work.
- Neither operation is safe until the unified baseline is established.

**Do not press Pull or Push in the currently diverged AI Studio panel.**

## 3. Sources to preserve and reconcile

| Source | Role | Required handling |
|---|---|---|
| `anytrader (Full Code Backup)_112216(1).zip` | Recoverable snapshot of AI Studio project | Preserve unchanged. Treat as a snapshot, not automatically newer than every GitHub change. Confirm whether it represents the latest live workspace. |
| Original `main` | Current shared repository baseline and final destination | Keep unchanged until candidate is reviewed and approved. |
| `integration/pr-consolidation-20261109` | Existing integration workspace | Continue this branch. Do not create a competing integration branch. |
| PR #5 / audited commit `6af712f7833f5e60759c87f00f2bc798305210a6` | Additional financial/security work under review | Inspect current PR head/base/status and exact diff. Do not assume all changes are approved or already included. |
| `sync/integration-into-pr5-20261109` | Earlier synchronisation work | Inspect ancestry and differences; do not merge blindly. |

Do not create a separate staging repository unless a concrete technical blocker is demonstrated and the user approves it.

## 4. Historical findings — reverify before relying on them

The following were observed during earlier investigation, but are **not guaranteed to describe current branch heads**:

- `integration/pr-consolidation-20261109` was reported as 27 commits ahead of `main` and 0 behind.
- `sync/integration-into-pr5-20261109` was reported as 26 commits ahead of `main` and 0 behind.
- A prior integration-versus-main comparison reported these six net changed paths:
  - `.github/workflows/ci.yml`
  - `DEVELOPMENT.md`
  - `MASTER_BUILD_PLAN.md`
  - `firestore.rules`
  - `src/server/reviewAuthorization.ts`
  - `tests/unit/firebaseEmulatorSecurityRules.test.ts`
- The ZIP was inspected as approximately 23.6 MB, with 705 archive entries and 605 files, and did not contain Git history.
- Prior Git blob checks against PR commit `6af712f7833f5e60759c87f00f2bc798305210a6` found exact matches for:
  - `package.json`
  - `server.ts`
  - `src/server/paymentLedger.ts`
  - `src/server/driverPayoutOrchestration.ts`
  - `tests/unit/paymentLedger.test.ts`
  These checks were against that PR commit, not proof of equality against every current branch head.
- The ZIP's `firestore.rules` differed from the integration version. Earlier file sizes were reported as 76,059 bytes (ZIP) and 77,835 bytes (integration). Size alone does not determine correctness or security.
- The ZIP did not contain `MASTER_BUILD_PLAN.md`. Differences were also reported for `DEVELOPMENT.md`, `src/server/reviewAuthorization.ts` and `tests/unit/firebaseEmulatorSecurityRules.test.ts`.
- A prior PR #5 file inventory identified files absent from the ZIP, including `src/server/mediationStake.ts`, `src/server/refundReconciliation.ts` and associated mediation/refund/webhook/payment tests. Recheck the exact PR head and whether these files are already present in integration.

## 5. Execution plan

### Stage 0 — Preserve and freeze
1. Keep the AI Studio workspace and original ZIP untouched; retain a verified copy of the ZIP.
2. Do not use AI Studio Pull/Push while its panel reports changes on both sides.
3. Do not write to original `main`, merge PR #5, change production Firebase, or deploy during the audit.
4. Record current SHAs for `main`, integration and sync branches; record PR #5 head/base/status and recent CI results.

**Gate:** recoverable backup and current repository state recorded.

### Stage 1 — Audit the existing integration branch
1. Inspect every commit on `integration/pr-consolidation-20261109` relative to `main`, including messages and changed paths.
2. Inspect `sync/integration-into-pr5-20261109` and PR #5 ancestry/diffs.
3. Identify duplicated, superseded, missing or conflicting work.
4. Read and understand the integration branch's CI workflow, `DEVELOPMENT.md`, `MASTER_BUILD_PLAN.md`, `firestore.rules`, `src/server/reviewAuthorization.ts` and emulator security tests.
5. Map each change to its purpose, dependencies, tests and risk.

**Deliverable:** integration-branch inventory and branch/PR relationship map.

### Stage 2 — Full ZIP-to-GitHub comparison
Compare the ZIP against the exact current heads of:
- original `main`
- `integration/pr-consolidation-20261109`
- relevant PR #5 head
- sync branch where useful

Create a normalized complete file inventory and classify every path:
- identical
- ZIP-only
- GitHub-only
- modified in both
- deleted on one side
- generated/vendor/build output
- platform-specific
- sensitive configuration

Use content hashes first, then inspect diffs for every changed or overlapping file. Include source, tests, package manifests and lockfiles, server code, Firebase config/rules/indexes, environment templates, Android and iOS files. If the ZIP may not be the latest live AI Studio workspace, request a fresh export before final reconciliation.

**Deliverable:** complete file-level reconciliation manifest with no unexplained high-risk paths.

### Stage 3 — Security and financial correctness review

**Firestore/security**
- Compare rules semantically, rule by rule—not by file size.
- Review collection matches, read/write predicates, authentication, ownership, role checks, admin paths and default-deny behaviour.
- Preserve all required security protections while maintaining legitimate application access.
- Validate proposed rules with Firebase emulator tests. Do not deploy them during reconciliation.

**Payments/financial flows**
- Trace payment, escrow, mediation, refund, payout, Stripe webhook and ledger flows across all sources.
- Review idempotency-key binding, webhook retry/claim ownership and fencing, refund pagination, ambiguous Stripe transfer recovery, duplicate payout prevention and ledger reconciliation.
- Review PR #5 implementation and tests; a green CI run alone is not proof of financial correctness.

**Deliverable:** security decision log and financial test/gap report.

### Stage 4 — Build candidate on the existing integration branch
1. Use `integration/pr-consolidation-20261109` as the working integration line.
2. Add approved AI Studio-only files and edits without dropping existing integration work.
3. Incorporate approved PR #5 changes after checking ancestry, conflicts and duplication.
4. Resolve overlapping files individually; preserve compatible functionality from all sources.
5. Update lockfiles only using the project's package manager; avoid unrelated dependency churn.
6. Maintain a manifest mapping each significant applied change to its source and review decision.

**Deliverable:** reconciled candidate on the existing integration branch.

### Stage 5 — Validate the candidate
Run the repository's applicable checks:
1. Clean dependency installation from the lockfile.
2. Formatting/lint.
3. TypeScript/type checks.
4. Unit tests.
5. Integration tests.
6. Firebase emulator security tests.
7. Payment and financial integrity tests.
8. Production build.
9. Relevant Android/iOS checks.
10. GitHub CI.

Investigate failures; do not bypass or weaken tests just to obtain a green result. Review secrets/configuration and inspect the final diff, especially deletions, Firestore rules and financial paths.

**Deliverable:** tested candidate and recorded CI/test evidence.

### Stage 6 — Merge to original `main`
1. Re-fetch `main` and integration heads immediately before merge.
2. Confirm the candidate SHA is exactly the reviewed and tested commit.
3. Use the repository's normal reviewed PR process.
4. Do not force-push or rewrite shared history.
5. Record merge commit SHA and CI evidence.

**Deliverable:** approved unified codebase on original `Saanwar2002/AnyTrader` `main`.

### Stage 7 — Safely synchronise AI Studio
1. Preserve/export the current AI Studio workspace before any sync operation.
2. Confirm the AI Studio GitHub connection points to original `Saanwar2002/AnyTrader`, branch `main`.
3. Only after confirming unified `main` contains all required AI Studio work, use the supported sync sequence.
4. Verify key files and hashes in AI Studio against GitHub; inspect any conflicts.
5. Make a harmless controlled test edit, review the exact diff, and push only when the sync state is clean and the user approves.
6. Verify the resulting GitHub commit and confirm AI Studio can return to a clean synchronised state.

**Deliverable:** proven pull → Gemini development → reviewed push → clean resynchronisation workflow.

## 6. Non-negotiable safeguards

- Original `main` remains unchanged until the unified candidate is validated and approved.
- Do not Pull or Push from the currently diverged AI Studio panel.
- Do not create another integration branch or staging repository without a demonstrated blocker and user approval.
- Never silently discard AI Studio-only functionality.
- Do not merge PR #5 blindly.
- Do not modify production Firebase, run production migrations or deploy during reconciliation.
- Do not introduce credentials, service-account keys, API keys or private environment files into Git history.
- No force-pushes, destructive resets, branch deletion or unreviewed bulk file replacement.

## 7. Immediate next actions

1. Re-fetch current SHAs for `main`, `integration/pr-consolidation-20261109` and `sync/integration-into-pr5-20261109`; record PR #5 head/base/status.
2. Inspect all integration commits and diffs, not only the final branch comparison.
3. Recreate the ZIP inventory and compare it against the exact integration head using path and content hashes.
4. Produce the full differing-path manifest.
5. Begin detailed Firestore rules and emulator-test comparison.
6. Continue payment/financial reconciliation after the source inventory is clear.
7. Make no code changes until the manifest and security decisions have been reviewed.

## 8. Progress tracker

Update this table after each work session. Record exact SHAs, commands/checks and evidence in the relevant commit/PR or a dated checkpoint.

| Workstream | Status at document creation |
|---|---|
| Integration branch audit | Partially completed |
| ZIP inventory | Completed (initial inventory; reverify if backup changes) |
| Full ZIP comparison | Partially completed |
| Firestore rules reconciliation | Pending |
| Financial/PR #5 reconciliation | Pending |
| Unified candidate on integration | Pending |
| Comprehensive validation | Pending |
| Merge into original main | Pending |
| AI Studio synchronisation | Pending |

## 9. Resume instructions for future agents

Read this document first, then inspect the latest progress entry and current GitHub state. The goal is one unified codebase in `Saanwar2002/AnyTrader` `main` so Gemini can safely pull into AI Studio, develop, and push back to that same branch.

Continue using the existing `integration/pr-consolidation-20261109` branch. Do not create a new staging repository or competing integration branch without a demonstrated blocker and user approval. Re-verify branch SHAs, PR status and file diffs before acting; historical counts and comparisons above are not live state.

Preserve the AI Studio workspace, ZIP, integration branch, sync branch and PR #5. Do not use the currently diverged AI Studio Pull/Push controls until the unified main is validated. No production Firebase changes or deployment. Proceed read-only through the branch audit, file comparison and security review before proposing writes.

**The measure of success is not merely a merged PR: it is a verified, safe, repeatable AI Studio ↔ original GitHub `main` workflow.**


---

## 10. Dated progress update — 9 November 2026 (continued audit)

This update supersedes earlier estimated branch counts and adds verified findings from the Library reconciliation checklist and current GitHub reads. Always re-fetch before acting.

### 10.1 Current branch relationship observed

- Current `main` base SHA observed: `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Current integration branch is **28 commits ahead and 0 behind** `main` (the reconciliation-plan documentation commit increased the prior count from 27 to 28).
- `sync/integration-into-pr5-20261109` is **0 ahead and 2 behind** the current integration branch. It is not an alternative integration destination; inspect its two commits only if needed.
- Comparing integration with PR #5 head `6af712f7833f5e60759c87f00f2bc798305210a6` reports PR head **102 commits ahead and 2 behind** integration, with a diverged status. This confirms PR #5 must not be merged blindly.
- The integration branch now contains `docs/UNIFIED_CODEBASE_RECONCILIATION_PLAN.md`; its addition is included in the 28-commit comparison.

### 10.2 Verified ZIP-to-current-integration parity

The Library contains an existing reconciliation checklist with exact snapshot comparisons against integration SHA `e0653deb65657c91a17d1f9355662d67f4b70231`. I independently rechecked the current integration file blob hashes against the ZIP's raw bytes. The following six files are still byte-identical in the current integration head:

| File | Git blob SHA |
|---|---|
| `server.ts` | `0e935945b0cb7a3e6009030884aa620cc5dba175` |
| `package.json` | `973603b055a65607106d2afac29b248d0b915b27` |
| `firebase.json` | `64ea2d94c5ae7ae149a6c897624b71b3f1d293d1` |
| `firestore.indexes.json` | `7ba42a1c5f715f2a11d07b6768939f30bf60064b` |
| `storage.rules` | `b2a628977784f6bc3189c9d4592e4e40d590e8f1` |
| `instantMatchWorker.ts` | `118f2cbd0ee3eb7986b9885dd5706b8897118875` |

The ZIP has 605 files. It contains `firebase-applet-config.json`; preserve it exactly. It does **not** contain `MASTER_BUILD_PLAN.md` or `AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md`; preserve those GitHub documents. The ZIP contains `DEVELOPMENT.md`, but it differs from the integration version and must be reconciled additively, not replaced wholesale.

### 10.3 Firestore invitation rule finding

The current integration `firestore.rules` is 77,835 bytes / 1,658 lines. The ZIP copy is 76,053 bytes / 1,607 lines. Both contain `email_verified`, so the difference is not simply that one has verification and the other does not.

The ZIP invitation block uses broad inline email matching for get/list/update. The integration block introduces dedicated verified-recipient helper functions for recipient read, list and acceptance paths, with explicit `email_verified == true` checks. This is a meaningful security-policy difference. Preserve the AI Studio PL-01–PL-15 protections and reconcile the stricter invitation policy with all legitimate invitation acceptance flows and emulator expectations. Do not select either file solely by recency or size.

### 10.4 PR #5 reconciliation warning

PR #5's changed-file list includes substantial changes to `server.ts`, `instantMatchWorker.ts`, `package.json`, `src/server/pricingCatalog.ts`, `src/server/domainEvents.ts`, and new mediation/refund modules and tests. At the current integration head, the following PR #5 paths were confirmed absent (GitHub contents API returned 404):

- `src/server/mediationStake.ts`
- `src/server/refundReconciliation.ts`
- `tests/unit/refundReconciliation.test.ts`
- `tests/unit/mediationStakeTransactions.test.ts`
- `tests/unit/mediationStakeFirestoreEmulator.test.ts`
- `tests/unit/stripeWebhookRetryClaim.test.ts`

The PR #5 diff against integration includes 24 changed paths (see live compare endpoint). The PR's earlier Library checklist describes it as an open draft, unmerged, based on integration and a candidate consolidated replacement for PR #2. Re-fetch the actual PR metadata before any merge decision. **Do not merge PR #2 and PR #5 together without proving they are not overlapping alternatives.**

The earlier checklist also identifies unresolved design/test coverage for concurrent mediation-stake intent requests, retry after ambiguous Stripe timeout, and duplicate success webhook handling. A green CI run does not settle these risks.

### 10.5 Immediate next actions (updated)

1. Retrieve current PR #5 metadata (state, draft, base/head refs and SHAs) and confirm whether PR #2 remains open/merged/closed.
2. Inspect the full PR #5 diff against the current integration branch, prioritising the changed `server.ts`, `package.json`, `pricingCatalog.ts`, `domainEvents.ts`, `mediationStake.ts`, `refundReconciliation.ts` and associated tests.
3. Compare the ZIP and integration `DEVELOPMENT.md` additively. Preserve AI Studio Tasks 31–34 and PL-01–PL-15 history while retaining GitHub PR/reconciliation entries.
4. Reconcile `firestore.rules` using a rule-by-rule policy matrix and emulator tests. Specifically test verified/unverified invite reads, lists, acceptance, inviter actions, admin actions and missing-document query semantics.
5. Confirm `firebase-applet-config.json` in the ZIP is retained exactly in the eventual unified codebase.
6. Produce and review the complete path manifest before any code edits.

### 10.6 Scope boundary

This reconciliation is for **AnyTrader only**. Keep taxi/AnyRoller work unchanged and deferred as recorded in `MASTER_BUILD_PLAN.md`. Do not deploy Firebase rules or alter production configuration as part of this repository reconciliation.


## 11. Progress update — PR #5 source review (9 November 2026)

### Current refs rechecked
- `main`: `4b7963c831acbb2ea6f3084f9f4d069fb772792a`
- Integration now: `945691fc5669c4f77e5d7434c0ae87726a1baf3c` (plan update; re-fetch before next operation)
- Integration comparison to main: **29 ahead / 0 behind** (this includes this plan's commits).
- PR #5 candidate commit inspected: `6af712f7833f5e60759c87f00f2bc798305210a6`.
- PR #5 candidate vs integration: **102 ahead / 3 behind; diverged**. Do not merge as-is.

### PR #5 code inventory inspected
Fetched the exact candidate files and reviewed their opening implementation/test structure:
- `src/server/mediationStake.ts` — transaction-reserved stable attempt, participant checks, disputed-job requirement, already-paid guard, retry ownership. Candidate blob `607bd695438569139c65df22933306dac3f5766d`.
- `src/server/refundReconciliation.ts` — durable refund-operation model and reservation/confirmed-refund ledger functions. Candidate blob `fbf3e7da9322a91048d7f85af5544a582112c5a1`.
- `tests/unit/mediationStakeTransactions.test.ts` — serialized transaction mock and Stripe idempotency scenarios. Candidate blob `c32d2a90de5986bde8594ba3d38296f1a52d4702`.
- `tests/unit/mediationStakeFirestoreEmulator.test.ts` — real Firestore emulator test suite for stable reservation and payment state. Candidate blob `157901f3104c661b3d1aae55b0571856a1cd9464`.
- `tests/unit/refundReconciliation.test.ts` — memory transaction mock and refund reservation/replay tests. Candidate blob `bac406ecba8184df667ea3d937053c72292db538`.
- `tests/unit/stripeWebhookRetryClaim.test.ts` — source assertion for webhook in-flight retry behaviour. Candidate blob `cd12cb6a38e349862f6121a89f91e6b13cb10bae`.
- `src/server/domainEvents.ts` — domain event dispatcher and idempotency/audit layer. Candidate blob `8ebe6d995b13d2d24a8f53d644fc3c8b014daeea`.
- `src/server/pricingCatalog.ts` — server-authoritative pricing catalogue/resolver. Candidate blob `981ad1c008b3511282711b432f77e808304d29a8`.
- PR #5 also changes `server.ts` (candidate blob `3b55a200418e3014d35dc1098902daafda75514b`, 286,883 bytes) and `instantMatchWorker.ts` (candidate blob `9d2db7317471c8c115d68895c9f4ce717860e4be`, 18,007 bytes); these are large overlapping integration files and require focused diff review, not wholesale copy.

### PR #5 changed paths
The current compare endpoint returned 24 paths, including `.github/workflows/ci.yml`, `MASTER_BUILD_PLAN.md`, `instantMatchWorker.ts`, `package.json`, `server.ts`, `src/server/domainEvents.ts`, new `mediationStake.ts` and `refundReconciliation.ts`, `src/server/pricingCatalog.ts`, and the corresponding idempotency, webhook, refund, mediation and financial audit tests. Three commits behind integration means the candidate has not incorporated our most recent documentation commits; that is not itself a reason to merge or rebase.

### Initial review conclusions (not final approval)
- Mediation stake reservation appears designed to create/reuse a stable attempt ID under a Firestore transaction and restrict retries to the initiating participant. Need inspect the full functions and caller route, payment-intent metadata, transaction race semantics and emulator coverage before accepting.
- Refund reconciliation separates durable operation reservation from Stripe call and confirmed ledger reversal. Need inspect full state transitions, immutable idempotency-key binding, handling of ambiguous Stripe timeout, partial refunds, currency/amount validation, replay behaviour, and caller/webhook integration.
- The webhook retry test is source-text based. Treat it as a regression guard, not a substitute for behavioural/integration tests.
- Domain events/pricing/server changes overlap heavily with integration and AI Studio. Merge by focused diff and tests, never by copying the entire PR versions of `server.ts` or `instantMatchWorker.ts`.

### Next exact work
1. Obtain full PR #5 diff in manageable per-file chunks, especially full `mediationStake.ts`, `refundReconciliation.ts`, and their route/caller wiring.
2. Inspect integration's corresponding `server.ts`, `instantMatchWorker.ts`, `domainEvents.ts`, `pricingCatalog.ts` and tests; establish whether any equivalent logic already exists under different names.
3. Check package scripts and lockfile changes in PR #5; do not accept dependency churn without necessity.
4. Draft a per-path decision matrix: accept PR candidate / retain integration / combine manually / reject / test gap.
5. Only after the matrix is reviewed, apply the necessary PR #5 financial changes to the existing integration branch and test.

No application code has been changed in this audit.


## 12. Progress update — deeper financial module audit (9 November 2026)

### Live branch and PR state
- Rechecked main SHA: `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Integration branch is now **30 commits ahead / 0 behind main** (the additional commit is this plan update); main remains unchanged.
- PR #5 is still **open and draft**, titled “Fix mediation stake payment idempotency and webhook verification”; its mergeability is false and its head is diverged from integration.
- PR #2 is also open and draft (“fix(payments): protect server-authoritative membership entitlements”). Treat these as separate candidates; do not merge either blindly.
- PR #5 candidate is now measured **102 ahead / 4 behind integration**, diverged. Its merge base is `e513c48e65df0fa43dbaf75317fe5a55ead0251e`. Integration is the safe working line; main untouched.

### Mediation stake implementation — positive findings and remaining risk
Reviewed the full candidate `src/server/mediationStake.ts`:
- Reservation transaction checks job existence, disputed state, caller participation, paid/pending arbitration guard and initiator ownership on retries.
- Attempt ID is persisted before Stripe I/O; Stripe create uses stable key `mediation-stake:<jobId>:<attemptId>`; retry retrieves an attached PaymentIntent or repeats Stripe create with that stable key.
- Attach/confirm/failure operations check attempt and PaymentIntent binding; confirmation is idempotent; delayed failure does not downgrade a succeeded stake.
- Candidate tests include concurrent reservation, timeout-after-Stripe-create retry, participant rejection, success webhook replay and failure-after-success ordering; an emulator suite exercises real Firestore transactions.

**Important unresolved correctness edge:** reservation writes `dispute.status: "awaiting_payment"` while the top-level job stays `status: "disputed"`; confirmation restores the top-level disputed status. Confirm the app's dispute UI/rules consume the nested status consistently. Also inspect webhook signature/metadata and route wiring before accepting this module; helper-level tests alone do not prove the complete Stripe path.

### Refund reconciliation implementation — positive findings and remaining risk
Reviewed full candidate `src/server/refundReconciliation.ts`:
- `reserveRefundOperation` validates positive safe integer minor units, normalizes currency and binds operation ID to PaymentIntent/amount/currency/idempotency key.
- `recordConfirmedRefund` uses Stripe refund ID as its durable dedup key, checks original completed ledger entry/payment/currency, and transactionally maintains a per-payment refunded aggregate to constrain cumulative partial refunds.
- It creates a refund record and immutable outflow ledger entry, leaves original ledger amount intact, and marks a matching reserved operation succeeded.

**Important unresolved correctness edges:**
1. Replayed refund ID validation currently checks PaymentIntent, amount and reversal entry, but does not compare charge ID, currency or operation ID against the stored refund record.
2. The aggregate is keyed by PaymentIntent hash but bound to a single original ledger entry; if one PaymentIntent legitimately has multiple refundable ledger entries, the design may incorrectly conflate them. Confirm payment/ledger cardinality.
3. Confirm the original ledger `amount` is indeed stored in pence (the tests assume this); confirm Stripe charge/refund amount and ledger currency conventions end-to-end.
4. A reserved operation can remain pending after Stripe succeeds but the webhook/confirmation is delayed; verify the route retries Stripe using the exact operation key and that ambiguous outcomes are reconciled safely.
5. The module itself intentionally does no Stripe I/O; no complete route/webhook orchestration has yet been verified.

### Test evidence and limits
- Reviewed transaction unit tests and Firestore emulator test setup, plus refund unit test cases. Tests are promising but use custom in-memory/serialized transaction mocks; these are not equivalent to running the project suite.
- GitHub Actions workflow runs queried for the candidate SHA returned an empty list. This is **not proof of a passing CI run**.
- No tests have been run in this remote audit session; do not mark PR #5 validated.

### Next exact work
1. Retrieve the PR #5 per-file patches for `server.ts`, `instantMatchWorker.ts`, `domainEvents.ts`, `pricingCatalog.ts`, `package.json`, CI and all related financial tests.
2. Map every mediation/refund helper to its production route, Stripe webhook event and client caller; inspect metadata and authorization boundaries.
3. Resolve the five refund concerns and mediation nested/top-level status concern with code evidence and tests.
4. Review PR #2 separately for overlap with PR #5 and integration's membership entitlement logic.
5. Build a path-level accept/combine/retain/reject/test-gap matrix before changing application code.

**Safety status:** no application code changed; main, PRs, AI Studio workspace and production Firebase remain untouched.


## 13. Progress update — production wiring and PR overlap (9 November 2026)

### PR #2 / PR #5 overlap clarified
Live changed-file lists:
- PR #2: `server.ts`, `src/server/pricingCatalog.ts`, `tests/unit/stripeConnectFinancialAudit.test.ts`, `tests/unit/task25ScaleBackfillResilience.test.ts` (4 files).
- PR #5: 24 files; overlaps PR #2 on all four paths above.
- Both PRs remain open drafts. They are overlapping alternatives, not independent changes to stack. PR #5's wider server/webhook work subsumes the same *areas* but does not establish that all PR #2 intent is correctly retained. Compare each exact patch and test before selecting a single consolidated implementation.

### Mediation payment route/webhook trace (PR #5)
- `POST /api/disputes/create-stake-intent` requires authentication and payment rate limiting; it now returns 503 when Stripe is unavailable (removed mock-success fulfillment).
- It calls `createMediationStakePaymentIntent`, using a Firestore-generated candidate attempt ID and returns the Stripe client secret/PaymentIntent ID.
- Legacy `checkout.session.completed` mediation-stake fulfillment is explicitly ignored; stake is fulfilled only by verified PaymentIntent webhook.
- `payment_intent.succeeded` validates mediation metadata (`jobId`, `paymentAttemptId`, `userId`), GBP and exactly 2,500 pence, then calls transactional confirmation with reservation/intent binding.
- `payment_intent.payment_failed` similarly validates metadata/amount and records failure without downgrading success.
- Webhook claim logic now returns 503 for a live processing claim, acknowledges only completed/rejected events, and reclaims stale processing after five minutes. Missing Stripe config or DB also returns retryable 503 rather than false 2xx.
- Positive: eliminates mock-paid mediation and the old Checkout Session trust path; explicit binding and webhook signature verification are part of the route flow.

**Mediation follow-up risks:** webhook checks metadata presence and amount/currency but does not itself check Stripe PaymentIntent status beyond event type (normally event semantics provide it); review dispute nested status and participant identity fields with the UI/rules. Confirm webhook finalization/catch always clears or marks claims appropriately when side effects throw.

### Refund production wiring trace (PR #5)
- Instant Match timeout/exhaustion routes now call `refundExpiredInstantMatch`; stable operation ID `instant_match_<matchDocId>` and reservation key `refund:<operationId>` make repeated worker calls idempotent at Stripe.
- Before refund, it requires one matching completed `PLATFORM_COMMISSION` ledger entry with transaction ID, exact amount and GBP; otherwise creates a `refund_review` record and does not refund. Missing Stripe throws so retry/recovery can proceed.
- Worker recovery scans expired matches and retries refund operation. Stripe create is followed by transactional `submitted` state unless webhook already marked succeeded.
- `charge.refunded` webhook iterates individual Stripe refund objects, maps to one completed original `ESCROW_DEPOSIT` (preferred) or `PLATFORM_COMMISSION`, validates PI/currency, and invokes `recordConfirmedRefund`; mismatches/ambiguity are written to manual review. It flags Stripe refund-list pagination for manual follow-up.
- Strong improvement over the integration branch's direct best-effort Stripe refund calls: durable operation reservation, stable Stripe key, ledger reconciliation and review queue.

**Refund blockers still to resolve before adoption:**
1. Worker selects only `PLATFORM_COMMISSION` and requires its amount equal the refund amount. Confirm Instant Match's ledger entry represents the full customer-paid charge (including correct fee/amount); otherwise this will route all valid refunds to review or refund the wrong component.
2. Stripe `charge.refunded` webhook's embedded `charge.refunds.data` may be a partial list; pagination is correctly flagged but remaining refund objects need a durable recovery job/operational procedure.
3. On ambiguous Stripe create exception, worker marks operation `failed`; retry does reuse key, but confirm state/status UI and monitoring distinguish failed from uncertain/submitted. Avoid terminal interpretations of `failed`.
4. The webhook's primary original selection is `ESCROW_DEPOSIT` else `PLATFORM_COMMISSION`; for a PaymentIntent with multiple completed ledger entries, only a single matching entry is accepted, which is safer than arbitrary selection but needs ledger cardinality/amount evidence.
5. Refund replay still should bind charge ID, currency and operation ID, not only PI/amount/original entry. Consider enforcing original refund amount <= original ledger amount and verify the platform fee/net payout reversal accounting policy.

### PR #2 entitlement review status
PR #2 changes only the shared webhook configuration failure response and pricing catalogue authorization/resolution plus two tests. Its pricing patch overlaps PR #5's pricing patch (including job authorization and explicit membership-selection guards). Do not merge PR #2 separately into integration; carry forward any independently useful tests/intent after exact comparison.

### Current disposition (interim path matrix)
| Path / area | Interim decision | Reason / next gate |
|---|---|---|
| `src/server/mediationStake.ts` | Candidate promising; adopt only after tests + UI/rules check | Strong reservation and webhook binding |
| `src/server/refundReconciliation.ts` | Candidate promising; revise/verify before adopt | Replay binding and accounting gaps |
| `server.ts` | Manually combine focused hunks | Huge overlap; includes webhook, mediation and checkout fulfillment changes |
| `instantMatchWorker.ts` | Manually combine refund hunk(s) | Preserve integration matching/listener logic; prove original ledger semantics |
| `src/server/pricingCatalog.ts` | Compare PR #2 and #5 then combine once | Same overlapping authorization/payment selection changes |
| `src/server/domainEvents.ts` | Candidate changes only after call-site/idempotency review | Deterministic correlated event IDs and transaction dedupe |
| `package.json` / CI | Review script exclusions and dependency delta | PR #5 changes test exclusions; do not weaken test coverage unnoticed |
| financial tests | Add selectively and run locally/CI | Mock tests do not replace emulator/route behavior |

### Next work
1. Inspect the Instant Match checkout creation/ledger entry source in both integration and PR #5; establish charge amount, ledger amount, commission and refund semantics.
2. Review all PR #5 `server.ts` changes beyond mediation/refunds: async checkout fulfillment, ad-wallet transaction, webhook claim finalization, payment-intent authorization, payout/Connect changes. Build a categorized hunk map.
3. Compare PR #2's exact financial audit test changes with PR #5's same file; keep one consolidated suite.
4. Inspect `domainEvents.ts` call sites and idempotency assumptions; ensure correlation IDs are unique per business event, not reused for different event types/aggregates.
5. Review PR #5 package scripts and CI exclusions against integration; preserve emulator test coverage and document prerequisites.
6. After these gates, prepare a reviewed path-level reconciliation matrix and a controlled code/test sequence on integration. Main stays untouched.

**Safety status:** only this reconciliation document changed in this stage; application source remains unchanged; no tests run; main and production Firebase untouched.


## 14. Instant Match ledger/refund and domain-event audit (2026-11-09)

### Checkout -> match -> original ledger

PR #5 makes the Instant Match aggregate deterministic (instant_matches/{CheckoutSessionId}), validates the authoritative payment_intents record (user, payment mode, amount, GBP, boost/instant_match metadata and job), and atomically creates/validates the match, original payment ledger row, and job link. The ledger row explicitly has transactionId = Stripe PaymentIntent ID, amount = session.amount_total in integer pence, type = PLATFORM_COMMISSION, status = completed, currency = gbp, platformFee = amount, netPayout = 0, source = instant_match. This establishes that the candidate's PLATFORM_COMMISSION amount is the full customer Instant Match charge, not fee-only, and can serve as the original refund amount for this flow (subject to existing ledger consumers treating this special product consistently).

Integration/main currently use a random match document ID and create no matching original Instant Match ledger row in this webhook path. This is a material accounting/recovery improvement, not a safe isolated copy of one hunk.

### Refund worker

PR #5 replaces direct, untracked Stripe refund calls in both timeout paths with refundExpiredInstantMatch, deterministic operation instant_match_<matchId>, stable Stripe idempotency key, preflight against exactly one completed matching full-charge ledger entry, and a 30-second recovery scan for expired matches whose refund has not succeeded. Invalid/missing payment or ambiguous ledger evidence goes to refund_review, not a blind refund. Integration's direct refund call has no persisted operation/recovery and catches Stripe errors without durable review.

Remaining validation: inspect rest of worker helper and refund module transaction/replay semantics; verify reconciliation on multiple partial refunds and charge.refunded pagination; ensure operation states never falsely mark success before Stripe confirmation; confirm overlapping worker instances (Stripe key is external safety net, reservation/lease state also needs review).

### Domain events

PR #5 derives correlated event IDs from SHA-256(event type + aggregate + correlation ID), transactionally persists correlated events once, and skips in-process handlers for an already-persisted correlated event. Correlated persistence failures propagate (retryable); uncorrelated legacy events retain best-effort behavior. Integration uses random event IDs and non-transactional set, allowing duplicate audit rows on webhook retry. Before adoption, check callers do not reuse correlation IDs for distinct legitimate events. Also note a durable event is written before handlers; handler errors are swallowed, so a failed handler will not automatically rerun on duplicate event delivery.

### PR #2 overlap decision

PR #2 server patch is a strict subset of PR #5 Stripe webhook retryability/idempotency changes. Its financial audit test adds boost job-owner checks and safeguards server-authoritative membership metadata/price IDs. PR #5's financial audit test retains catalog/Connect assertions but omits those PR #2 assertions. Thus PR #2's pricing safeguards/tests are NOT automatically covered by PR #5: port/reconcile them into the combined candidate and add negative tests for checkout type/price-ID precedence. Do not merge PR #2 after PR #5 without patch-level conflict review.

### Acceptance blockers

1. Finish refund module replay/partial refund and worker helper review.
2. Confirm Stripe webhook finalization records processed_stripe_events as completed/rejected on every branch and releases/retries claims on thrown errors; otherwise 503 can leave a processing lease until stale reclaim.
3. Port PR #2 membership/boost authorization cases into combined financial audit suite.
4. Reconcile Firestore rules and CI/package scripts; run targeted tests and full CI on integration candidate before main synchronization.


## 15. Refund reconciliation edge cases and webhook lifecycle (2026-11-09)

### Confirmed-refund replay identity gap

In PR #5 refundReconciliation.ts, refund_records/{StripeRefundId} replay currently compares only PaymentIntent ID, amount, and reversal original entry. It does not compare the incoming charge ID, currency, or operation ID against the stored refund record. A replay with the same refund ID but conflicting charge/currency/operation metadata could be accepted as a replay. Tighten this identity check to compare all immutable Stripe refund fields (charge ID, normalized currency, operation ID where persisted) and add conflict tests.

The aggregate payment_refund_totals is keyed by hash(PaymentIntent) and binds to one original ledger entry. This deliberately fails closed if a PaymentIntent has more than one refundable original entry, but that constraint should be documented/tested. Per-refund transactions correctly use individual refund amount (not cumulative Charge.amount_refunded), and enforce cumulative amount <= original amount. Existing total corruption is rejected. Operation matching binds PI, exact requested amount, currency, and Stripe refund ID; operation state is changed to succeeded only in the confirmed webhook path.

### Worker state observations

The timeout/no-trader paths share one stable refund operation. Worker sets operation failed on caught Stripe errors but retains its deterministic idempotency key; next retry can safely resubmit. Successful Stripe API response is only submitted/pending (unless webhook concurrently marked succeeded), not final confirmed. Recovery scans expired matches and skips succeeded. This is the intended asynchronous confirmation model. However, the reservation does not itself claim a worker lease; simultaneous recovery workers can both call Stripe, relying on the same Stripe idempotency key. Test this concurrency explicitly or add a short operation lease if needed.

### Webhook processing claim

PR #5 improves missing Stripe/DB and active-processing responses to retryable 503, stale processing lease reclamation, and final duplicate acknowledgement for completed/rejected events. The patch includes completed/rejected/failed status writes in multiple paths, but acceptance still requires checking the full handler's terminal catch/finally path: every thrown side effect must leave a recoverable processing claim (or explicitly mark retryable), never an acknowledged completed event. The five-minute stale lease is recovery, not immediate release; document expected Stripe retry cadence and test worker crash after claim.

### Decision

PR #5's refund and webhook foundations are stronger than integration's current direct-refund behavior, but remain **candidate-only** until replay identity hardening, concurrent worker/recovery tests, webhook claim lifecycle coverage, PR #2 pricing/ownership safeguards, and the full rule/CI validation are completed. No production/main changes made.


## 16. Firestore invitation rules: main vs integration (2026-11-09)

### Exact path difference

The first meaningful security delta is match /invitations/{invitationId}. Integration replaces main's broad invitation get/list and update conditions with named recipient predicates and a constrained acceptance transition.

**Integration:**
- get: admin, verified email recipient (case-normalized), or inviter; does not grant arbitrary missing-document reads.
- list: admin, exact verified-email recipient predicate (query-compatible), or inviter.
- create: registered caller who is inviter, or admin.
- update: verified recipient may only transition pending -> accepted, with acceptedAt == request.time and affected keys limited to status/acceptedAt; inviter or admin retains update path.
- delete: registered inviter or admin.

**Main:**
- get/list condition includes `resource == null` and a broader email expression, and also allows inviter; this is materially less constrained and has query-proof concerns.
- update allows any registered verified-email matching recipient update (not only pending->accepted and not field-limited), as well as inviter/admin. This can permit recipient mutation of invitation fields beyond acceptance.

The integration invitation update rule is a clear least-privilege hardening and should be retained in candidate. Do not copy main's broad update. Verify intended inviter update/delete workflow separately; inviter currently has unrestricted update under both branches (business/admin server should be authoritative for sensitive invitation fields if that is intentional).

### Other rules delta

A line-aware comparison found 74 changed/added/removed lines overall (integration 1,658 lines; main 1,608). Most differences are concentrated in this invitation block, but do not conclude all other paths are identical from a truncated diff. Next perform a complete normalized diff grouped by match path and map each changed path to existing Firebase emulator tests. The ZIP invitation block should be included as a third comparison; it was previously observed to use broader inline recipient matching than integration's helper/acceptance predicates.

### Candidate tests required

- verified exact-email recipient can get invitation;
- unverified/mismatched recipient denied;
- recipient can accept only pending invitation and only status/acceptedAt fields;
- recipient cannot edit inviter, email, role/permissions, expiry, or arbitrary metadata;
- inviter and admin can perform their intended lifecycle actions;
- recipient list query uses exact email equality and succeeds only when constrained;
- missing document get behavior is intentionally denied to non-admin/non-inviter;
- regression tests for invitation deletion and expired/revoked invitations.

Rules acceptance remains pending emulator execution; this analysis is not a test result.


## 17. Complete Firestore rules normalized comparison (2026-11-09)

A full text normalization check was performed on the current GitHub `main` and `integration/pr-consolidation-20261109` versions of `firestore.rules`: the complete invitation match block was replaced with a sentinel, and the remaining files were compared byte-for-byte.

**Result: the rules files are identical outside `match /invitations/{invitationId}`.** This confirms the earlier path-level assessment: the invitation block is the sole rules delta between these two GitHub refs, not merely the largest visible difference. The integration file is 1,658 lines and main is 1,608 lines because its invitation block contains additional helper predicates and acceptance constraints.

### Consolidated candidate decision

- Retain integration's invitation block as the candidate rules version; it is materially narrower than main for recipient reads and updates.
- No other Firestore rules changes need to be reconciled between GitHub main and integration at this point.
- ZIP/AI Studio rules parity remains unverified; the ZIP is a separate snapshot and cannot be inferred from this GitHub comparison.
- Existing emulator security tests still need mapping to invitation cases and actual execution against the candidate. A textual comparison is not a test result.
- Before any main synchronization, confirm rules deployment/index/config parity separately; repository rules alone do not prove deployed Firebase state.

### Next rules task

Inspect `tests/unit/firebaseEmulatorSecurityRules.test.ts` and the ZIP's `firestore.rules`/security test files, then add any missing invitation acceptance, field-restriction, query, and missing-document regression cases on integration. Run the Firebase emulator suite only when the available environment supports it and record the actual result.


## 18. Invitation emulator test coverage mapped (2026-11-09)

Reviewed the integration branch's existing test `94. PL-08` in `tests/unit/firebaseEmulatorSecurityRules.test.ts` (lines 2648–2788). The test already covers:
- unverified recipient get/list/accept denied;
- verified recipient direct get and exact-email constrained list query;
- case-insensitive get for a mixed-case stored email;
- missing invitation get denied and unrelated recipient denied;
- inviter read/cancel and admin read/update;
- recipient pending→accepted with server timestamp;
- recipient edits to email, inviter, or extra notes denied.

This is substantially aligned with the integration invitation rule and means these cases should not be duplicated blindly. The test currently does **not visibly assert** recipient acceptance of an already accepted/revoked/expired invitation, recipient deletion denial, or inviter creation/deletion behavior. Add only the missing lifecycle cases if the product contract confirms the expected semantics. The existing inviter update is intentionally broad in the rule and test; treat that as a separate authorization design question rather than silently narrowing it during reconciliation.

**Validation status:** source/test review only; Firebase emulator execution has not been performed in this continuation. The normalized GitHub rules comparison and test mapping are now documented; ZIP rules comparison and actual emulator run remain outstanding.


## 19. ZIP backup rules and invitation test comparison (2026-11-09)

The backup ZIP was materialized and inspected locally (705 archive entries; root `firestore.rules` and `tests/unit/firebaseEmulatorSecurityRules.test.ts` present).

### ZIP rules finding

The ZIP invitation block is the older permissive form:
- `get/list` accepts a token email without requiring `email_verified == true`, and includes `resource == null` access;
- recipient update is not constrained to pending→accepted or to a field allowlist;
- inviter/admin management paths remain.

This confirms integration's invitation hardening is not present in the ZIP snapshot. The ZIP must not overwrite the integration rules file wholesale.

### ZIP test suite

The ZIP security test file is present (103,911 characters); integration's version has 2,835 lines and the invitation test 94 (PL-08). A complete ZIP-to-integration test-file diff has not yet been produced, so do not claim that all other security tests are equivalent. The ZIP is a snapshot rather than a Git revision; comparisons must be file/content based.

### Reconciliation disposition

- **Keep integration `firestore.rules`**; do not restore ZIP's permissive invitation block.
- Preserve the ZIP as evidence of AI Studio-era state and continue reconciling its non-rules source files by targeted path/content diffs.
- The rules review is now sufficient to move to package/CI inventory, while emulator execution remains a separate validation gate.


## 20. Integration package scripts and CI release gate inventory (2026-11-09)

Reviewed integration `package.json`, `.github/workflows/ci.yml`, and `DEVELOPMENT.md`.

### CI workflow sequence

The integration CI gate is configured to:
1. install via `npm ci --legacy-peer-deps` (Node 22, Java 21);
2. run `npm run test:security-rules` (Firestore/Storage emulator-backed rules and concurrency suites);
3. run `npm test` (Vitest suite with emulator-only suites excluded);
4. run `npm run lint` (`tsc --noEmit`);
5. run production `npm run build`;
6. run `npm run audit:release`.

Push triggers include main/master/integration branches; PR triggers include main/master/integration. This is a sensible release gate, but its actual pass/fail must be read from the relevant Actions run, not inferred from workflow configuration.

### Package script observations

- The ordinary `test` script intentionally excludes emulator-dependent tests; CI separately invokes `test:security-rules`.
- `test:security-rules` includes the comprehensive security suite and many task-specific emulator suites, with `--no-file-parallelism`.
- `test:emulator-concurrency` is a narrower concurrency gate.
- The script lists many test paths explicitly. New emulator test files can silently remain outside the gate unless the script is updated; validate the list against the test directory during CI review.
- `recover` is a developer convenience that checks out three UI files; it is not a reconciliation/sync mechanism and must not be run as part of this branch merge.
- No package or workflow edits were made in this pass.

### Documentation reconciliation warning

Integration `DEVELOPMENT.md` contains newer operational fixes and CI claims (including invitation/security remediation) than the ZIP snapshot. Preserve these integration entries; merge ZIP-only AI Studio task/PL records additively rather than replacing the guide with the backup copy. Documentation claims of test counts should be cross-checked against Actions logs before being promoted as current validation.

### Current gate status

This was a source/configuration review only. No npm install, emulator, Vitest, TypeScript, build, or release audit was executed in this session. Continue next by comparing ZIP `package.json`, workflow and development guide, then reconcile PR #2/#5 source and tests.


## 21. PR #5 refund/domain-event and PR #2 pricing patch review (2026-11-09)

Reviewed individual changed-file patches (source review only; no code port or tests executed).

### Refund reconciliation module (PR #5)

- PR #5 introduces `src/server/refundReconciliation.ts`; this module is absent from integration at this path, so this is a new capability, not a direct replacement.
- It reserves `refund_operations/{operationId}` before Stripe I/O, binds payment intent/amount/currency/idempotency key, and records confirmed refunds under Stripe refund ID plus immutable `payment_ledger` outflow entries.
- It maintains a transactionally updated `payment_refund_totals` aggregate to bound cumulative refunds and can mark a reserved operation succeeded on confirmation.
- **Replay integrity gap to fix before adoption:** when `refund_records/{refundId}` already exists, its replay comparison must bind all immutable identity fields, especially Stripe charge ID, currency, original ledger entry, and operation ID (where supplied). Refund ID alone is not sufficient proof that a repeated webhook is identical. Add mismatch tests for each field.
- **Operation lifecycle concern:** worker errors mark a reservation failed even when Stripe's response may be ambiguous. The stable idempotency key is retained (good), but recovery must retry/reconcile the same operation rather than mint a new operation or assume failure means no refund.
- Review Firestore transaction read-before-write ordering and ensure the operation/refund/aggregate writes remain atomic in production adapters.

### PR #5 Instant Match worker / webhook coupling

- Worker adds durable refund reservation and a common refund path for timeout and no-more-traders expiration. Port only together with webhook reconciliation and its tests; isolated worker changes would create unmatched states.
- Worker protects a webhook-confirmed `succeeded` operation from being downgraded to `submitted`; preserve this race protection.
- Confirm webhook refund object amount is the individual refund amount, not cumulative `charge.amount_refunded`; account for charge refund pagination (`has_more`) and send incomplete cases to durable review/recovery.
- Validate unique completed original ledger entry by payment intent, expected currency and refundable type before writing a reversal. Existing consumers must understand `REFUND` outflows and avoid double-counting original plus reversal.
- Add/confirm tests for duplicate refund webhook, two partial refunds, over-refund race, ambiguous Stripe timeout/retry, mismatched charge/currency/original, and `has_more` pagination.

### PR #5 domain event idempotency

- Correlated event IDs become deterministic from event type + aggregate + correlation ID; transactionally stored once, and correlated persistence errors propagate.
- **Critical delivery caveat:** the patch returns early when a correlated event already exists, preventing handler re-execution. If the first handler failed after event persistence, retries can permanently skip the handler. Do not adopt this as end-to-end exactly-once delivery. Prefer an outbox/handler status (pending/processing/completed with retry/lease) or prove handlers are transactionally coupled and idempotent. Event persistence and downstream effects need explicit recovery semantics.

### PR #2 pricing/membership safeguards

- Explicit `priceId` membership selection takes precedence over conflicting client tier metadata; legacy metadata tier selection is removed from landlord/driver-gold branch selection.
- Membership Stripe metadata is generated server-side only (tierName/tier/subscriptionType/userId); caller metadata is no longer spread into entitlement metadata. Preserve this security boundary and add assertions for spoofed `tier`, `subscriptionType`, and `userId`.
- Video Pro resolution is constrained so explicit membership selection does not get overridden by metadata flags.
- PR #2 also changes Stripe webhook unavailable dependencies from 2xx acknowledgement to retryable 503. This is important to avoid silently dropping payment fulfillment; reconcile with PR #5's webhook retry/claim logic rather than cherry-picking the hunk.
- PR #2 adds task-queue singleton reset in Task 25 emulator `beforeEach`; verify `clear()` and `setFirestoreDb()` are valid and do not mask production state behavior.

### Port status and acceptance gate

No PR #2/#5 financial implementation has been ported to integration in this review. Before adoption, produce a file-level merge matrix and then implement focused changes with regression tests. Minimum acceptance: replay identity mismatch tests; concurrent cumulative refund limit; refund event replay and pagination/review; Instant Match refund retry/recovery; authoritative membership metadata spoof tests; task-queue emulator isolation; domain-event handler failure recovery; and full CI/Actions validation. Main remains unchanged until those gates pass.


## 22. PR #2 checkout authorization / pricing patch deep review (2026-11-09)

Read the complete PR #2 pricingCatalog patch. This is more than metadata cleanup: it introduces a shared `loadAuthorizedCheckoutJob` guard.

### New checkout authorization behavior

- Boost checkout loads the job from Firestore and requires the authenticated UID to match the canonical owner field (with legacy owner-field fallbacks); job must be in an allowed active/bidding state.
- Mediation stake checkout requires authenticated job owner or assigned trader, job status exactly `disputed`, and stake not already paid.
- The guard requires a valid jobId and available Firestore DB and fails closed for missing job.
- PR #2 applies this guard to boost and mediation checkout. **Do not port only the price-ID precedence changes while omitting this ownership/state validation.**

### Pricing precedence/security

- PR #2 uses an explicit membership selection marker to stop conflicting metadata (milestone funding, wallet top-up, boosts, add-ons, Video Pro) from hijacking a membership checkout.
- Explicit catalog price IDs route the intended product; membership tier resolution prioritizes priceId, then tierName, then metadata fallback.
- Removes client metadata spread from Stripe membership metadata. Entitlement fields are canonical server output.
- The helper's legacy owner/assigned-trader field fallbacks need validation against actual AnyTrader job schema and tests; avoid adding arbitrary aliases without confirming data model.
- Boost mock price IDs are accepted by resolver; verify production configuration cannot treat mock IDs as real payable products.

### Required integration tests before port acceptance

1. Non-owner cannot buy a boost for another user's job; owner can for allowed job status.
2. Boost rejected for missing job, missing jobId, DB unavailable, and terminal/ineligible job status.
3. Mediation stake restricted to participants and disputed jobs; duplicate paid stake rejected.
4. Conflicting client metadata cannot redirect a membership price into boost, wallet top-up, milestone, or add-on flow.
5. Membership metadata spoofing (`tier`, `subscriptionType`, `userId`) is ignored and canonical metadata is emitted.
6. Explicit price ID beats conflicting metadata; legacy tier metadata remains only where no explicit selection is supplied.
7. Stripe webhook unavailable dependencies return retryable 503 and do not mark events complete.

**Status:** reviewed but not yet ported. This security helper and its tests are now a required part of the PR #2 integration, not an optional enhancement.


## 23. Live branch topology and PR integration matrix (2026-11-09)

A fresh GitHub compare was run for `main...integration/pr-consolidation-20261109`.

### Branch topology (authoritative at this check)

- Main SHA: `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Integration is **41 commits ahead, 0 behind** main; merge base equals main.
- Integration therefore contains all current main history plus 41 integration-only commits. It is not diverged behind main.
- GitHub reports only seven paths changed relative to main: `.github/workflows/ci.yml`, `DEVELOPMENT.md`, `MASTER_BUILD_PLAN.md`, this reconciliation plan, `firestore.rules`, `src/server/reviewAuthorization.ts`, and `tests/unit/firebaseEmulatorSecurityRules.test.ts`.
- This is important: the 41-commit integration lead is not evidence that PR #2/#5 source code has been integrated. Most of the lead is integration history/documentation and the named rule/review changes.

### Exact PR changed-file inventories

**PR #2 (4 paths):**
- `server.ts`
- `src/server/pricingCatalog.ts`
- `tests/unit/stripeConnectFinancialAudit.test.ts`
- `tests/unit/task25ScaleBackfillResilience.test.ts`

**PR #5 (24 paths):**
- `.github/workflows/ci.yml`, `MASTER_BUILD_PLAN.md`, `package.json`
- `server.ts`, `instantMatchWorker.ts`
- `src/server/domainEvents.ts`, `src/server/mediationStake.ts`, `src/server/pricingCatalog.ts`, `src/server/refundReconciliation.ts`
- tests: `domainEventIdempotency`, `jobParticipantAuthorization`, `mediationStakeFirestoreEmulator`, `mediationStakeLegacyCheckout`, `mediationStakeTransactions`, `refundReconciliation`, `stripeAdWalletTopupIdempotency`, `stripeCheckoutAsyncPayment`, `stripeConnectFinancialAudit`, `stripeInstantMatchIdempotency`, `stripeMilestoneFundingIdempotency`, `stripeMilestonePaymentAmount`, `stripeWebhookRetryClaim`, `task25ScaleBackfillResilience`.

### Critical reconciliation matrix

| Path | PR scope | Integration-vs-main status | Next action |
|---|---|---|---|
| `server.ts` | PR2 + PR5 | No net diff reported vs main | Compare PR2 and PR5 hunks against integration's main-derived file; compose compatible webhook + checkout changes |
| `src/server/pricingCatalog.ts` | PR2 + PR5 | No net diff vs main | Merge both PR changes by behavior; avoid choosing either whole file |
| `instantMatchWorker.ts` | PR5 | No net diff vs main | Port durable refund reservation/recovery with webhook |
| `src/server/refundReconciliation.ts` | PR5 new | Not in integration's main diff | Add only with tests and worker/webhook integration |
| `src/server/domainEvents.ts` | PR5 | No net diff vs main | Resolve persisted-event/handler retry semantics before adoption |
| `src/server/mediationStake.ts` | PR5 new/changed | Not in integration's main diff | Port transaction and authorization behavior with emulator coverage |
| `package.json` | PR5 | No net diff vs main | Reconcile scripts/dependencies and ensure every new test is in CI |
| `.github/workflows/ci.yml` | PR5 + integration | Net diff exists | Merge workflow requirements, inspect current PR checks; do not replace integration workflow wholesale |
| Financial / mediation tests | PR2 + PR5 | No net diff vs main | Port as a coordinated test set; avoid duplicate test names and ensure npm gate includes them |

**Interpretation:** integration has not yet incorporated the PR #2/#5 functional code changes listed above. Previous sections 21–22 are design review findings, not implementation completion. No source code was changed in this step.

### Safe implementation sequence

1. Treat PR #2 and PR #5 as source candidates, not merge-ready branches. Fetch exact full PR patches for overlapping `server.ts` and `pricingCatalog.ts`.
2. Build a behavior-level merge for pricing/checkout authorization first (PR2 guard + PR5 pricing/webhook behavior); port tests with it.
3. Port mediation stake module and its tests as a separate unit.
4. Port refund reconciliation module + Instant Match worker + webhook event handling together; harden replay identity and handler recovery before acceptance.
5. Merge package scripts/CI last, then run complete tests, typecheck, build, release audit and inspect Actions status.
6. Only after all checks pass should a reviewed integration candidate be considered for main. AI Studio sync must remain paused until main is intentionally updated and the safe Pull/Push sequence is agreed.

No production/main or AI Studio action was performed during this comparison.


## 24. Overlapping PR hunk review: pricing resolver and Stripe webhook (2026-11-09)

Compared exact changed-file patches for both PRs on their overlapping files.

### Confirmed overlap

- PR #2 and PR #5 carry the same `src/server/pricingCatalog.ts` patch. Do not apply it twice. It should be treated as one shared candidate patch.
- PR #2's `server.ts` change (Stripe unavailable / DB unavailable => HTTP 503) is also present in PR #5's larger `server.ts` patch. PR #5 extends this with claim leases, async payment success, refund and mediation flows. Compose the superset once; do not cherry-pick both copies.
- This explains why the implementation plan should be behavior-based rather than a sequence of blind PR merges.

### Additional pricing resolver risks to test before port

1. `hasExplicitMembershipSelection` treats any non-empty client `body.tierName` as explicit membership selection, not only a canonical catalog tier. A forged/unknown tierName can suppress metadata-based boost/top-up/add-on routing and fall through to the default membership resolver. Validate tierName against an allowlist and reject unknown explicit values; do not silently default an invalid selection to Pro.
2. The boost branch accepts `price_mock_boost` and `price_mock_instant_match` identifiers in the same resolver used for real checkout. Confirm those are test-only and cannot produce a live Stripe Checkout Session in production. Prefer environment-gated mock IDs or test injection.
3. The owner and assigned-trader aliases in `loadAuthorizedCheckoutJob` are permissive fallbacks. Establish the canonical job schema and define deterministic precedence; conflicting owner fields must fail closed rather than selecting the first truthy value.
4. Mediation stake authorization checks `mediationStakePaid` and `dispute.mediationStakePaid` before payment, but two concurrent checkout attempts may both pass this read. The downstream reserved payment attempt must transactionally enforce a single active/unpaid stake. Verify PR #5's mediation reservation transaction covers this race and rejects duplicate PaymentIntents.
5. A job owner and assigned trader can both be authorized to pay the same stake. Confirm product semantics: whether either participant may pay once, or whether each party owes a separate stake. The current paid flag implies one per job; test that exact rule.

### Webhook composition review

PR #5's webhook patch:
- keeps PR #2's retryable 503 behavior when Stripe or Firestore is unavailable;
- returns 503 for an actively claimed event and reclaims stale claims after five minutes;
- acknowledges only completed/rejected duplicates as final;
- accepts `checkout.session.async_payment_succeeded` in addition to `checkout.session.completed`;
- uses a checkout intent record for authoritative amount/user/mode checks in sensitive fulfillment;
- makes ad-wallet top-up idempotent by Checkout Session ID with a Firestore transaction;
- explicitly refuses legacy Checkout Session mediation-stake fulfillment, requiring the verified PaymentIntent path.

Before adoption, inspect the complete webhook terminal paths: every exception after claim must leave a retryable/reclaimable state, and no handler may acknowledge success after partial fulfillment. Verify rejected events are truly terminal and cannot later become payable/fulfillable. Add crash-after-claim, crash-after-side-effect, and concurrent duplicate delivery tests.

### Implementation status correction

The exact PR patches were inspected, but no code was ported. Integration remains 41 commits ahead and zero behind main, with its seven-path net diff as recorded in Section 23. The financial/checkout code candidate is still pending.


## 25. PR #5 mediation-stake reservation and emulator-gate review (2026-11-09)

Reviewed PR #5's new `src/server/mediationStake.ts` and its unit + real Firestore emulator test patches.

### Positive design to preserve

- Reservation is performed in a Firestore transaction against the job document.
- It requires `status === disputed`, derives participants through the shared `getJobParticipantIds` helper, and rejects nonparticipants.
- It rejects already-paid/pending-arbitration states.
- It reserves a stable `stakePaymentAttemptId` and records the initiating participant before Stripe PaymentIntent creation.
- A retry reuses the same attempt and existing PaymentIntent ID; only the original initiator may retry.
- Separate functions attach the PaymentIntent, confirm payment and record failure, allowing the webhook to verify the reserved attempt instead of trusting a legacy Checkout Session.
- The emulator test explicitly races two reservations and expects one stable attempt ID, and checks that the other participant cannot reuse the first participant's reservation.

### Risks / acceptance checks

- The transaction updates the nested `dispute` object by replacing it with a spread of the previously read object. Confirm this does not erase concurrent fields written by other flows; use dotted updates or a transactionally merged shape where safe.
- Confirm all transaction reads occur before writes in every function in the module, including confirmation and failure paths.
- Ensure failure after Stripe creates a PaymentIntent but before its ID is attached can recover by the same deterministic idempotency key and does not create a second active attempt.
- Validate amount and currency from the server catalog in the webhook against the stored attempt; do not trust metadata amount, dispute reason or client-supplied photos as payment authority.
- Confirm a single stake per job is intended, since either owner or assigned trader may initiate but the reservation locks the other participant out.
- The memory-backed transaction test serializes calls and is useful for logic, but the real Firestore emulator race test is the authoritative concurrency regression.

### CI script integration finding

PR #5 updates `package.json` to:
- exclude `mediationStakeFirestoreEmulator.test.ts` from ordinary `npm test`;
- include it in `test:emulator`, `test:security-rules`, and `test:emulator-concurrency`.

Integration's current package scripts do not yet include this new test path. When porting PR #5, carry the exclusion and all three emulator-gate inclusions together. Otherwise the emulator test may be skipped by default and never run in CI.

**Status:** module and test patches reviewed; not ported or executed. Keep the module + webhook + pricing guard + emulator test + package script updates as one mediation-stake delivery unit.


## 26. Refund ledger lifecycle: exact source review and blocking defects (2026-11-09)

Reviewed the complete added `src/server/refundReconciliation.ts` patch from PR #5. This is a source review, not an implementation or test run.

### Confirmed strengths

- A durable operation is reserved transactionally before Stripe I/O.
- Stable idempotency key is derived from operation ID.
- Refund documents are keyed by Stripe refund ID, independent of webhook event ID.
- Refund total is transactionally bounded against the original payment amount.
- Only completed original ledger entries of allowed types can be reversed.
- The individual Stripe refund amount is used, not cumulative `Charge.amount_refunded`.
- The reversal entry is immutable in intent and linked by `reversalOfEntryId`.
- Operation success is recorded in the same transaction as refund ledger/totals writes.

### Blocking defect R1 — replay identity is incomplete

When `refund_records/{refundId}` already exists, the replay branch compares only PaymentIntent ID, amount and original ledger entry ID. It does **not** compare:
- stored `stripeChargeId` against incoming `chargeId`;
- stored currency against incoming normalized currency;
- stored operation identity against incoming operationId (including missing-vs-present mismatch).

A duplicate refund ID with conflicting charge/currency/operation can therefore be accepted as a replay. Fix by persisting an explicit immutable refund identity and comparing every immutable Stripe field on replay. Add one mismatch test per field.

### Blocking defect R2 — operation state/identity is under-validated

For a new refund record, the operation check validates PaymentIntent, amount, currency and optional Stripe refund ID, but not `operation.operationId`, its deterministic idempotency key, or its lifecycle status. It can mark a failed/requires_review operation succeeded without a deliberate reconciliation transition. Validate operation document identity, idempotency key, and permitted prior statuses; make ambiguous/failed recovery explicit and prevent one operation being bound to multiple refund IDs.

### Blocking defect R3 — missing aggregate on replay is not repaired

On an existing refund record, if `payment_refund_totals` is absent, the code reports cumulative refunded amount as just this refund amount. It does not rebuild/verify the aggregate from immutable refund records. This can understate cumulative refunds and make downstream reporting inconsistent. Decide whether a missing aggregate is a hard integrity failure or reconstruct it transactionally from an authoritative source; do not silently return a partial total.

### Additional checks before adoption

- Validate Stripe charge ID is actually associated with the supplied PaymentIntent (using trusted webhook object relationship or a persisted original charge binding); the current function only stores the incoming charge ID.
- Verify the original ledger entry's amount/currency units and allowed types against all real payment flows. In particular, refunding a `PLATFORM_COMMISSION` entry may have different payer/payee and payout reversal semantics than refunding `ESCROW_DEPOSIT`.
- Ensure two different original ledger entries for one PaymentIntent fail closed consistently; the aggregate binds one original entry, but original-entry discovery must be unambiguous in the webhook caller.
- Add tests for two concurrent partial refunds, exact full refund, over-refund race, duplicate webhook with missing aggregate, charge/currency/operation mismatch replay, and failed-operation recovery.
- Confirm the refund worker never interprets an API response as final settlement; only a verified Stripe refund webhook should write the confirmed reversal.

### Current decision

The refund module is a useful candidate foundation but **not safe to port unchanged**. Fix R1–R3 and add tests before wiring it into the Instant Match worker/webhook. Do not merge PR #5 wholesale; its current PR metadata describes mediation-stake hardening, while the refund code is a distinct financial scope that still requires independent review. Main and AI Studio remain untouched.


## 27. Refund unit-test coverage audit (2026-11-09)

Reviewed PR #5's complete new `tests/unit/refundReconciliation.test.ts` patch (183 lines).

### Existing tests cover

- stable reservation replay and operation-ID reuse with conflicting PaymentIntent;
- one refund ledger entry and replay by Stripe refund ID;
- reserved operation marked succeeded after confirmation;
- cumulative partial refund bound in a sequential scenario;
- rejection of taxi ride/direct payout ledger types;
- invalid non-integer minor-unit amount.

### Missing tests corresponding to Section 26 blockers

1. Same refund ID replay with different `chargeId` must conflict.
2. Same refund ID replay with different currency must conflict.
3. Same refund ID replay with different/missing operation ID must conflict.
4. Same operation ID bound to a second refund ID must conflict.
5. A `failed` or `requires_review` operation must not silently become succeeded unless explicit recovery rules allow it.
6. Missing aggregate on duplicate replay must fail closed or reconstruct a verified total.
7. Concurrent partial refunds must be tested using Firestore emulator (the memory DB's runTransaction is not concurrent/atomic).
8. Confirm full refund boundary, duplicate event IDs with distinct Stripe refund IDs, and charge-to-PaymentIntent relationship validation.

### Scope isolation

The refund test deliberately rejects `RIDE_PAYMENT` and `DIRECT_PAYOUT` entries. PR #5's own planning notes explicitly defer taxi/AnyRoller refund and webhook changes to a separate authorised workstream. Preserve that boundary: do not bring taxi payment, payout, driver-metrics, or ride-ledger behavior into the AnyTrader unified candidate.

### Decision

Current refund tests are a useful sequential unit baseline, but they do not cover the critical replay identity and concurrency defects. Add the missing tests before implementation acceptance; do not mark refund reconciliation complete based on this suite.


## 28. Webhook-to-ledger and Instant Match refund path comparison (2026-11-09)

Compared integration's current `charge.refunded` handler and `instantMatchWorker.ts` with PR #5's replacement patches and the full proposed refund module.

### Current integration behavior — material gap

- Integration's `charge.refunded` handler only writes a summary document to `refund_events/ref_{event.id}` using cumulative `charge.amount_refunded`. It does not inspect individual Stripe refund objects, bind the refund to an original ledger entry, create a `REFUND` ledger outflow, or update a cumulative refund aggregate.
- Integration's Instant Match worker has **two independent timeout paths** (snapshot callback and 10-second interval). Both can expire the same attempt/match and both directly call `stripe.refunds.create` with no explicit amount, no deterministic idempotency key, no durable reservation, and no refund status/recovery workflow.
- The worker marks the match expired before the Stripe refund call. If Stripe is unavailable or the call fails ambiguously, the match remains expired and the current integration code has no periodic refund recovery.
- The no-available-traders branch in `initiateNextAttempt` expires the match but does not issue a refund at all.
- These are existing integration defects, not merely hypothetical PR concerns. PR #5's durable worker path is a substantial required improvement, but must be corrected before adoption.

### PR #5 webhook-to-ledger behavior

- Handles each individual `charge.refunded` refund object and uses `refund.amount`, not cumulative `charge.amount_refunded`.
- Resolves PaymentIntent ID from string or expanded object, checks refund PaymentIntent and currency against charge, then requires exactly one completed original ledger candidate.
- Prefers `ESCROW_DEPOSIT`; if none, falls back to `PLATFORM_COMMISSION`. This allows Instant Match's commission entry to be selected, but must be validated against actual payment flows and the intended refund source.
- Calls `recordConfirmedRefund` using Stripe refund ID, charge ID, PaymentIntent, original ledger entry and optional `refundOperationId` metadata.
- Sends missing/multiple originals and identity conflicts to `refund_review`; throws unexpected failures so the outer webhook can retry.
- Flags `charge.refunds.has_more` for manual pagination review.

### Blocking webhook risks

1. **Incomplete refund list:** the handler only processes `charge.refunds.data` from the event payload. If `has_more` is true it creates a review record but still marks the event `reconciled`; it does not retrieve remaining refunds from Stripe or provide an automated continuation cursor. Event retries will then be treated as completed by the processed-event claim. The remaining items require a durable, executable reconciliation job before event finalization, or the event must remain non-final/retryable.
2. **Charge binding:** the handler derives paymentIntentId from the charge and checks each refund's PI, but the module does not compare chargeId on duplicate refund replay and does not independently verify the charge belongs to that PI. Validate via trusted Stripe relationship / retrieved charge and persist the immutable binding.
3. **Original ledger selection:** if there are any completed escrow entries, commission entries are ignored. If there are no escrow entries, a single commission entry is accepted. This fallback must be explicit per payment type, not a generic preference rule. Multiple payment ledger entries for one PI must not be resolved by incidental query ordering.
4. **Event completion vs review:** the handler treats several refund conflicts as manual review and continues, then marks the entire event reconciled. This is acceptable only if every refund needing review is durably queued and a monitored workflow owns it; otherwise it is a silent terminal gap.
5. **Refund status:** confirm the individual refund object's status is `succeeded` before creating a completed immutable ledger outflow. Pending/failed/canceled refunds must not be booked as completed.
6. **Webhook finalization:** ensure the outer event handler marks the processed Stripe event completed only after all refunds have either been reconciled or durably queued for a recoverable review workflow. A throw after some refunds is safe only because refund IDs make prior completed records replayable; incomplete aggregate/replay logic must be fixed first.

### PR #5 Instant Match worker behavior and remaining race

- Replaces direct refunds in both timeout paths with `refundExpiredInstantMatch`, a deterministic operation ID `instant_match_{matchId}`, and Stripe idempotency key from the reservation.
- Adds a 30-second recovery loop for expired matches whose `refundStatus` is not succeeded.
- Checks for exactly one completed `PLATFORM_COMMISSION` ledger entry matching PaymentIntent, amount and currency before refunding.
- Adds a shared refund path to the no-available-traders branch, fixing the current no-refund gap.
- The stable operation/key makes simultaneous calls converge at Stripe, but both workers can still call the same reservation and Stripe request; idempotency is the backstop, not a Firestore claim/lease. Add an operation claim/lease or prove the Stripe idempotency window and recovery policy are sufficient.
- The worker records operation status `failed` after any caught Stripe error, including ambiguous network outcomes. It preserves the key, which is good, but a distinct `unknown/reconciling` state is safer; recovery should query Stripe by known refund ID / metadata or retry same key, never generate a new key.
- The worker sets match `refundStatus` to Stripe's immediate response status, while the authoritative ledger is only created by webhook. Ensure recovery treats `pending`, `requires_action`, and other non-succeeded Stripe states correctly and never equates API submission with confirmed ledger settlement.
- Validate `chargeAmountPence` is the exact captured amount for this payment and is immutable server-derived data; do not trust a mutable match field as refund authority. Also validate original ledger payer/payee/type and the intended Instant Match payment product.

### Port decision / required implementation package

Do not port the PR #5 refund handler or worker unchanged. Implement as one package:
1. Harden `recordConfirmedRefund` (Section 26 R1–R3, status checks, operation binding, charge identity).
2. Add complete individual-refund pagination/recovery and terminal event semantics.
3. Add explicit per-payment-type original-ledger resolver.
4. Add Stripe refund status validation.
5. Replace both Instant Match timeout refund branches and no-trader expiration with one durable reservation/claim/recovery path; validate captured amount from immutable payment source.
6. Add emulator tests for concurrent worker invocations, crash after Stripe submission, pending-to-succeeded webhook, refund list pagination, no-trader expiry, and exact-one ledger reversal.
7. Keep taxi/AnyRoller and direct payout refund behavior out of scope.

**Status:** integration source and PR patches reviewed; no source code changed and no tests executed in this step.


## 29. Instant Match original payment creation is a hard prerequisite for refunds (2026-11-09)

Traced the current integration Checkout Session fulfillment and PR #5's replacement hunk for `meta.type === 'boost' && meta.tier === 'instant_match'`.

### Current integration defect

Current integration creates an `instant_matches` document with:
- random Firestore document ID;
- `jobId`, `customerId`, `chargeAmountPence`;
- status and attempt metadata.

It does **not** persist `stripePaymentIntentId` or `currency` on the match. It also does not create a corresponding original `payment_ledger` `PLATFORM_COMMISSION` entry for this Instant Match Checkout Session.

Therefore PR #5's `refundExpiredInstantMatch` cannot work correctly if the worker is ported alone: it requires PaymentIntent ID, currency and exactly one completed `PLATFORM_COMMISSION` ledger entry matching the payment amount. Missing fields cause a `refund_review` item and no refund; missing ledger entry also causes review and no refund.

### PR #5 source correction reviewed

The PR #5 `server.ts` patch addresses this prerequisite as one atomic fulfillment path:
- validates the Checkout Session PaymentIntent, paid status, amount/currency and authoritative stored checkout-intent metadata for Instant Match;
- uses the Checkout Session ID as the stable `instant_matches` document ID (webhook retry identity);
- stores `stripePaymentIntentId`, exact `chargeAmountPence`, and `currency: "gbp"`;
- creates the original completed `PLATFORM_COMMISSION` ledger entry with a deterministic ID and Stripe PaymentIntent transaction ID;
- transactionally links the job to the match and validates existing match/ledger records on replay.

This must be ported with the worker and refund module. It is not optional bookkeeping: it creates the original immutable payment record that authorizes a later refund. The stable Checkout Session key also prevents duplicate match creation on webhook retries.

### Additional acceptance checks for this path

1. Verify the server-created checkout intent binds user, job, product/tier, exact amount and currency; reject absent or mismatched intent records rather than using `session.amount_total || 299` or client metadata.
2. Confirm the ledger entry amount and `PLATFORM_COMMISSION` type reflect the actual gross customer charge and are consistent with the refund amount; clarify whether this is a gross Instant Match service fee or commission semantics.
3. Ensure transaction replay validates all immutable ledger fields (PaymentIntent, amount, currency, payer, payee, type, status) and fails closed on any mismatch.
4. Ensure job-to-match linkage conflicts are retryable or durably reviewed; do not silently return a success response that leaves a paid checkout unfulfilled.
5. Add tests for duplicate Checkout Session delivery, conflicting existing match, conflicting existing ledger, missing/invalid checkout intent, unpaid session, missing PaymentIntent, and exact amount/currency mismatch.
6. Confirm mock checkout path remains test-only and cannot create production financial records.

**Decision:** PR #5's Instant Match webhook fulfillment + original ledger creation, refund worker, refund module and charge-refunded webhook form one inseparable delivery unit. Do not cherry-pick the worker or webhook refund handler without this original payment creation path.

**Status:** source review only; no code port or tests executed.


## 30. Payment-ledger contract review for Instant Match refunds

Reviewed the integration-branch `src/server/paymentLedger.ts`, `src/server/pricingCatalog.ts`, and PR #5's exact `server.ts` / `instantMatchWorker.ts` patches.

### Confirmed ledger semantics

- `LedgerEntry.amount` is in minor units (pence/cents), with `currency` normalized to lowercase. The allowed ledger types include `PLATFORM_COMMISSION`; completed entries are the financial source of truth.
- The pricing catalog explicitly describes Instant Match as a one-off platform dispatch fee (£2.99, `price_instant_match`, `mode: payment`). The catalog's platform-money rule distinguishes platform fees from client money held for escrow/ride flows.
- PR #5 creates one deterministic original ledger document per Checkout Session: `ledg_instant_match_<sessionId>`, transactionId=PaymentIntent ID, payerId=customer, payeeId=platform, amount=verified Checkout Session amount, platformFee=amount, netPayout=0, currency=gbp, type=PLATFORM_COMMISSION, status=completed. This is semantically consistent with a platform-only Instant Match fee, provided the server-side checkout-intent record really is authoritative and the checkout is configured as a platform charge (not a Connect client-money flow).
- PR #5's worker then requires exactly one completed `PLATFORM_COMMISSION` entry for that PaymentIntent with the exact amount and currency before requesting a refund. This closes the prerequisite gap previously found in the integration branch, where the match record lacked PI/currency and there was no original refundable ledger entry.

### Findings / required fixes before porting

1. **Checkout intent lifecycle ordering (blocking):** the webhook patch marks the `payment_intents/<intentId>` record completed and writes `paymentIntentId` before validating Instant Match's expected amount/currency/type/job binding. A later validation failure can leave the checkout intent marked completed despite no match/ledger fulfillment. Validate the complete intent/session binding first, then finalize it in the same transaction as match + ledger creation, or record a terminal rejected/review state explicitly.
2. **Missing job existence/ownership binding (blocking):** the Instant Match transaction reads the job but does not require `jobSnap.exists`, nor verify the job belongs to the checkout customer. The server-created intent's job binding helps, but fulfilment should still revalidate canonical job existence and owner/customer identity before linking the match.
3. **Ledger replay comparison incomplete:** an existing original ledger record is compared on transactionId, amount, payerId, type, currency, but not payeeId, platformFee, netPayout, idempotencyKey, source, or checkoutSessionId. Compare all immutable identity/economic fields; conflicts must fail closed.
4. **Match replay comparison incomplete:** existing match comparison omits currency, chargeTier, feeWaived and stable session/aggregate identity fields. Validate the full immutable record.
5. **Job link transaction invariant:** transaction reads the job snapshot and checks its current instantMatchId, but if the job document is missing it still proceeds to set it with merge. Require the job to exist and verify ownership. Decide explicitly whether an already-linked different match means a refund is automatically initiated or only manual review; current patch writes review but does not automatically refund this just-captured fee.
6. **PaymentLedgerEngine idempotency helper is not sufficient for this webhook write:** its generic executor performs external work outside the claim transaction and releases the lock on any thrown error. The new Instant Match fulfilment's Firestore transaction is a stronger local atomic unit; preserve that design and ensure the Stripe event claim does not become completed before all effects are committed.
7. **Currency comparison:** the checkout session currency is checked as GBP and the ledger writes `gbp`; ensure the checkout-intent record itself also stores and validates currency, not just mode/amount/metadata. Otherwise the trusted intent binding is incomplete.
8. **Refund path still needs prior R1–R3 corrections:** worker reservation/Stripe request and webhook ledger reversal must share one immutable operation identity; do not mark operation failed for ambiguous Stripe outcomes in a way that loses the submitted/unknown distinction; replay must compare all refund identity fields; missing aggregate state must rebuild or fail closed. A Stripe refund response alone is not ledger confirmation.
9. **Fee accounting:** PR #5 models the full Instant Match fee as both `amount` and `platformFee`, with zero net payout. This matches the stated platform-fee model. Confirm no separate fee/commission ledger is also created for the same PaymentIntent, and preserve exactly one original entry so the worker's exact-one check remains valid.

### Integration decision

Treat Checkout Session validation + transactional match creation + original PLATFORM_COMMISSION ledger creation + refund operation reservation/worker + verified refund webhook as one inseparable feature slice. Do not port the worker or webhook in isolation. No source code was changed and no tests were run in this review step.


## 31. Checkout-intent authority and pricing patch cross-check

Reviewed the complete PR #5 `src/server/pricingCatalog.ts` patch against the Instant Match webhook fulfilment contract.

- The pricing resolver validates boost job ownership and active job status through `loadAuthorizedCheckoutJob`; Instant Match resolves to the fixed server catalog item `price_instant_match` (£2.99, GBP, one-off payment). This is the correct source for the price, not client amount fields.
- The checkout-intent resolver patch itself does not add a new intent schema or explicitly demonstrate that `payment_intents/<intentId>` persists an immutable currency and a normalized integer `amount` in pence. The webhook assumes `checkoutIntentRecord.userId`, `mode`, `amount`, and `metadata` are present and authoritative. Before merge, trace the existing checkout-intent writer and assert these exact fields are persisted server-side for Instant Match.
- The patch accepts `price_mock_boost` and `price_mock_instant_match` as explicit boost IDs in the same branch as production IDs. This must be gated to a non-production/test environment; a production request must not obtain a real checkout for a mock price ID.
- `hasExplicitMembershipSelection` treats any nonempty `body.tierName` as explicit, even an unknown/forged tier string. That can divert legitimate metadata-driven flows away from their specialized handlers and then fall through to the default Pro catalog item. Validate explicit tier names against an allowlist and reject unknown values rather than silently defaulting.
- The resolver selects the fixed Instant Match catalog amount, but the downstream Checkout Session creator must use that resolved line item and persist the resulting amount/mode/currency in the checkout-intent record. The webhook must compare both the Stripe Session and PaymentIntent against that record; session validation alone is not enough to prove the intent was created for the expected product.
- Boost job authorization is performed before checkout, but it is not a substitute for fulfilment-time revalidation. The webhook must confirm the job still exists and its canonical owner still matches the recorded checkout user before linking an Instant Match.

### Next evidence required

Trace the integration branch's checkout-intent creation route and its `payment_intents` document write, including the exact Stripe Checkout Session creation parameters. Verify server-only price selection, amount in minor units, currency, mode, user, job, tier, and intent ID are persisted and replay-bound. Then update the porting dependency matrix. No code changes or tests were performed.


## 32. Checkout-intent writer trace — verified integration implementation

Traced `POST /api/create-checkout-session` in integration's actual `server.ts` and compared it with the PR #5 webhook assumptions. This closes the evidence gap from Section 31.

### Current writer fields (verified)

The route resolves pricing server-side with `resolveAuthoritativeLineItem(req.body, authUid, db)`, then creates a pre-checkout record at `payment_intents/{intentId}` containing:

- `intentId`
- `userId` (derived from authenticated Firebase UID)
- `createdAt`
- `metadata` (from authoritative resolver)
- `mode`
- `amount` (authoritative amount in pence, or zero)
- `status: "pending"`

It does **not** persist `currency`, resolved price/catalog ID, Checkout Session ID, or an explicit product/type field outside metadata. Stripe Checkout Session metadata contains only `intentId`, and the session is created from the authoritative resolver's line item.

### Confirmed blockers

1. **Currency absent from intent:** PR #5 webhook needs an authoritative currency comparison. Current intent cannot prove GBP; adding a currency field at write time is required (from resolved server catalog, normalized lowercase).
2. **Product/price binding is weak:** amount + arbitrary metadata are insufficient to prove which catalog item was purchased. Persist canonical `priceId/productKey` from the server resolver and validate it at fulfilment.
3. **Intent created before Stripe call, with no session binding:** Stripe session ID is not written back to the intent. A webhook should bind one intent to exactly one Checkout Session and reject a second unrelated session attempting to consume it.
4. **No request-level idempotency:** `intentId` is generated from timestamp + Math.random. Repeated client requests create separate intents and separate Checkout Sessions. Introduce a server-validated idempotency key scoped to authenticated user + checkout payload, and persist the request hash to prevent key reuse with changed product/amount.
5. **Potential orphaned intents:** the pending record is created before Stripe client initialization/session creation. If Stripe creation fails, the intent remains pending indefinitely. Add explicit failed/retryable state and cleanup/expiry policy; retries must reuse the same logical intent where appropriate.
6. **Intent completion happens too early in current webhook:** integration's webhook marks the intent `completed` and stores PaymentIntent ID immediately after lookup, before product-specific validation and fulfilment. This must move into the successful atomic fulfilment transaction or use explicit `processing`, `completed`, `review_required`, and retryable failure states.
7. **Missing database fail-closed behavior:** route currently conditionally writes intent only when `db` exists, but continues toward Stripe session creation. A paid checkout must not be created if the authoritative intent cannot be persisted. Return retryable 503 before Stripe call when DB is unavailable.
8. **Mock fulfillment parity:** mock Instant Match creates a random match with hardcoded 299 pence and no PaymentIntent/currency/original ledger record. Keep mock path explicitly non-production, but ensure tests do not mistake mock fulfillment for real financial settlement and never let it write production ledger state.

### Required intent schema for safe unified flow

At minimum, a persisted intent should bind:
`intentId`, `userId`, `productKey`, `priceId`, `amount` (integer minor units), `currency` (lowercase), `mode`, canonical metadata, request idempotency key/hash, `status`, `createdAt`, expiry, and eventually exactly one `checkoutSessionId` and `paymentIntentId`.

For Instant Match specifically it must additionally bind `jobId` and the canonical customer/owner relationship. The webhook must compare the paid Stripe Session's ID, client reference, mode, amount_total, currency, metadata intentId, PaymentIntent ID and payment status against that persisted record before any entitlement/match/ledger side effect.

### Decision

Section 31's question is answered: the current checkout-intent writer does **not** yet persist all fields required by PR #5's stronger fulfilment contract. Porting PR #5 webhook code without first upgrading this writer would make its authority checks incomplete or cause valid events to be sent to review. Implement the intent schema and lifecycle first, with route + webhook tests, then port Instant Match fulfilment/refund as a single slice. No source code was changed and no tests were run.


## 33. Checkout-intent regression coverage audit

Enumerated integration's current `tests/unit` directory and inspected the closest financial/payment test suites: `stripeConnectFinancialAudit.test.ts`, `task6PaymentAuthority.test.ts`, and `task35FStripeRedirectIntegrity.test.ts`.

### Coverage found

- `stripeConnectFinancialAudit.test.ts` verifies server-side catalog amounts, GBP currency, platform-owned versus client-money routing, and destination-charge behavior at the pricing resolver layer.
- `task6PaymentAuthority.test.ts` exercises payment-ledger authority and webhook/transfer behavior through a test-local handler, but does not cover the current `/api/create-checkout-session` intent writer.
- `task35FStripeRedirectIntegrity.test.ts` covers redirect URL security, not checkout intent persistence or Stripe session binding.
- No dedicated integration unit test currently covers the `payment_intents` document schema, checkout request idempotency, Checkout Session-to-intent binding, intent expiry/failure, or webhook completion transition.

### Required new test suite

Create focused tests for the actual checkout route and its intent repository/service (prefer extracting a small testable service rather than importing the entire Express server):

1. Authenticated UID is the only user identity persisted; body userId is ignored.
2. Persisted intent contains canonical productKey/priceId, integer minor-unit amount, lowercase currency, mode, userId, jobId where relevant, metadata, status and expiry.
3. Missing Firestore fails closed before creating a Stripe Checkout Session.
4. Same user + same idempotency key + same canonical payload returns/reuses the same intent; same key + changed payload returns conflict.
5. Two concurrent identical requests cannot create two intents or two Stripe sessions.
6. Stripe session creation failure leaves a recoverable failed/retryable intent; retry reuses the same logical intent and cannot orphan multiple pending intents.
7. On successful session creation, one intent binds to exactly one Checkout Session; a second session cannot consume it.
8. Webhook rejects wrong client_reference_id, mode, amount_total, currency, metadata intentId, PaymentIntent ID, product/price, or expired/terminal intent.
9. Webhook does not set intent completed before product validation and atomic fulfilment.
10. Duplicate event and duplicate session delivery are idempotent; same intent with a different session is a conflict/manual-review event.
11. Mock checkout never creates production settlement ledger entries or a production-looking completed intent.
12. For Instant Match, job exists and belongs to the authenticated checkout customer at both checkout and fulfilment time.

### Gate status

Current pricing resolver tests are useful but insufficient. No route-level checkout-intent tests are present in the inspected integration test set. Add this suite before porting PR #5's stronger webhook fulfilment contract. No code changes or tests were run in this audit.


## 34. Checkout route and webhook control-flow verification

Re-opened the exact integration route and webhook blocks to confirm the proposed intent changes against real control flow.

### Additional confirmed control-flow defects

- The route writes the pre-checkout intent only inside `if (db)`; when Firestore is absent it continues to Stripe Checkout creation. This is a paid-session-without-authoritative-intent failure mode. Change to fail closed with retryable 503 before Stripe initialization/session creation.
- The route creates the intent before `getStripe()`. If Stripe is unconfigured in a permitted mock environment or Stripe session creation throws, the pre-created record can remain `pending`; introduce explicit state transitions and a bounded expiry/retry strategy.
- The Stripe Checkout Session is created without a Stripe idempotency option. A client retry after a timeout can create another session for the same logical purchase.
- On webhook, when `session.metadata.intentId` is present but the intent document is missing, integration only logs an error and continues using `session.metadata` as fallback. This means a missing authoritative intent is not a hard stop; the event may still trigger downstream fulfillment based on session metadata.
- When an intent exists, it is marked `completed` immediately after lookup, before validating the session's amount/currency/mode/product and before product-specific side effects. A later failure can leave a completed intent with no completed fulfillment.
- The webhook derives `userId` from `session.client_reference_id` rather than first binding it to the stored intent's `userId`. The client reference must match the authenticated user persisted in the intent; it must not independently authorize fulfillment.
- The current handler's processed-event claim is separate from product fulfillment. A failure after some side effects must be recoverable; the intent and each fulfillment record need independent idempotency, with event claim state returning to retryable/reclaimable rather than permanently completed after partial effects.

### Safe state machine recommendation

Use an explicit persisted lifecycle:
`created -> session_creating -> session_created -> processing -> completed`.
Recoverable errors transition to `retryable_failed`; ambiguous Stripe outcomes transition to `unknown_reconciling`; permanent binding/authorization mismatches transition to `review_required` or `rejected`. Never transition directly to completed until all verified fulfilment writes have committed. Expired unconsumed intents must be terminal and unusable.

### Sequenced implementation boundary

Do not refactor the whole Express webhook in one change. First extract a small checkout-intent repository/service with pure validation and transaction methods; test it independently. Then update the route to require Firestore, persist the canonical intent, create Stripe Session with stable idempotency, and bind the Session ID. Finally change webhook claim/fulfilment to validate the full binding and complete the intent only with successful idempotent fulfillment. Keep existing subscription, add-on, escrow and ride flows covered; Instant Match should be enabled only after its own match + ledger transaction is proven.

**Status:** control-flow review only. No source code changed; no tests run.


## 35. First checkout-intent hardening implementation (2026-11-09)

Implemented a deliberately narrow first fix in integration's `server.ts` (no main/AI Studio changes):

1. **Fail closed without Firestore:** `POST /api/create-checkout-session` now returns HTTP 503 before Stripe session creation if the authoritative database is unavailable.
2. **Persist richer intent contract:** intent records now store normalized currency derived from the server-resolved line item (fallback GBP), authoritative amount, mode, authenticated user, canonical resolver metadata, expiry (30 minutes), and initial `session_creating` status.
3. **Prevent accidental intent overwrite:** uses Firestore `create()` rather than `set()` for a new random intent ID.
4. **Stripe request idempotency per intent:** Checkout Session creation now supplies `checkout_session_<intentId>` as Stripe's idempotency key.
5. **Bind returned session:** after Stripe returns a session, the intent is updated with `checkoutSessionId`, `sessionCreatedAt` and `session_created`.
6. **Persist Stripe failure state:** if session creation throws, the intent is marked `retryable_failed` before the error is rethrown.
7. **Separate development mock outcome:** mock fulfillment marks the intent `mock_completed` with `mock: true`, rather than leaving it in `session_creating` or presenting it as a real Stripe settlement.

### Explicit limitations — not yet solved

- The intent ID is still generated randomly per HTTP request. This protects a retry using the same intent ID at the Stripe API boundary, but does **not** provide client-request idempotency across separate HTTP requests. A server-validated idempotency key + canonical request hash is still required.
- Currency fallback to GBP is only a transitional compatibility default. The pricing resolver should expose canonical `priceId/productKey/currency` explicitly; do not use fallback as the long-term authority.
- No `checkoutSessionId` binding transaction protects against two sessions consuming one intent yet; the webhook still needs strict intent/session/user/mode/amount/currency/product validation.
- Webhook still needs to reject missing intent records and must not mark an intent completed before all fulfilment effects commit.
- Existing mock fulfillment is still a separate legacy path and requires an explicit policy/test boundary; `mock_completed` is not a Stripe payment and must never create production ledger settlement.
- `retryable_failed` records need a safe retry endpoint/process that reuses the same intent and Stripe idempotency key; the current route creates a new intent on a new request.
- No focused route/service regression tests have been added yet. No lint, unit, emulator or build tests were run after this patch.

### Change commits

- `5c3f55d9aaa17668e5219d92685da36f663029af` — fail closed, enrich intent, Stripe idempotency per intent, session binding and failure state.
- `951b79757cb7fddad2f12136386806379d4c173c` — explicit development mock intent state.

**Status:** partial implementation committed to `integration/pr-consolidation-20261109`; do not call checkout-intent lifecycle complete or port Instant Match refund code yet.


## 36. Request-level checkout idempotency implementation (2026-11-09)

Implemented the next checkout hardening increment on integration.

### Server changes

- Requires an `Idempotency-Key` request header (16–128 safe ASCII characters).
- Derives a deterministic Firestore intent ID from authenticated UID + client key using SHA-256; raw client key is not stored.
- Computes a canonical request hash from authenticated user, server-resolved metadata, mode, authoritative amount, currency, resolved Stripe price/product and quantity.
- Uses a Firestore transaction to reserve the intent exactly once.
- Reusing a key with a different canonical purchase returns HTTP 409.
- Reusing a key with a completed Stripe Session retrieves that existing session and returns its URL rather than creating another.
- Concurrent/repeated requests while the same intent is being created return HTTP 409 instead of starting a second session.
- The Stripe idempotency key remains derived from the stable intent ID.

### Client changes

Added `Idempotency-Key: crypto.randomUUID()` to all located calls to `/api/create-checkout-session` in:
`BillingManager.tsx` (5 calls), `Profile.tsx`, `Portfolio.tsx`, `EmergencyJobWizard.tsx`, `TradesDashboard.tsx`, `JobDetails.tsx` (3 calls), `PostJobWizard.tsx`, `TradesBannerAdStudio.tsx`, `TraderVideoVerificationCard.tsx`, and `GothamHousingPortal.tsx`.

A follow-up static inspection confirmed 16 located checkout call sites across these 10 files and all 16 now include the header.

### Important remaining limitations

- The client currently generates a fresh UUID when each call is constructed. It does not yet persist/reuse the same key across a user retry after an ambiguous network failure. For true retry semantics, retain the key for the logical checkout attempt (e.g. in component state/session storage) until the server returns a session or the attempt is explicitly abandoned.
- A same-key request whose intent is still `session_creating` or `retryable_failed` currently returns 409 unless an existing Session ID is already bound. Add a safe lease/claim and same-intent retry transition; do not simply reset state without handling a Stripe request that may have succeeded but whose response was lost.
- Current session creation writes `session_created` after Stripe returns. A crash between Stripe success and Firestore update is recoverable only by repeating the same Stripe idempotency key while Stripe retains it; add explicit reconciliation and document the retry window.
- The canonical request hash includes server-resolved fields but needs a dedicated tested canonicalization helper. Confirm nested metadata ordering is stable and include every economic/authorization field (e.g. Connect destination/application fee, customer, job binding and subscription settings).
- Existing endpoint client calls are now required to supply the header. Any unlisted/external API client must be updated; monitor 400 responses during rollout.
- `crypto.randomUUID()` requires supported secure browser contexts. Confirm supported client/browser baseline or provide a cryptographically secure fallback.
- The Firestore intent schema still lacks an explicit canonical `productKey/priceId` persisted separately from metadata; the hash uses resolved line-item fields where available.
- No route/service tests, lint, build, emulator or Stripe integration tests have been run after these changes.

### Commits

- `976b1c49bbddc58a3d014f4ed238653b4bde9ef1` — deterministic request-key intent reservation and canonical request hash.
- Client call-site commits add the header across 10 components; subsequent header syntax corrections were committed separately. Latest relevant client fix: `801641e56a6fb2921ffbc1a70ba72dd8d28dcf84`.

**Status:** request-key reservation and call-site header plumbing committed, but retry/recovery semantics and tests remain incomplete. This is not yet safe to call fully idempotent. Main and AI Studio remain untouched.


## 37. Stripe webhook authoritative-intent gate (2026-11-09)

Implemented a first webhook safety gate in `server.ts` for `checkout.session.completed`.

### Changes

- Rejects checkout fulfillment if Firestore, `session.metadata.intentId`, or `client_reference_id` is missing.
- Rejects fulfillment when the referenced `payment_intents/{intentId}` document does not exist. The previous fallback to session metadata is removed.
- Validates the Stripe session against the stored intent before product fulfillment:
  - authenticated user / `client_reference_id`
  - exact Checkout Session ID
  - Checkout mode
  - integer amount in minor units
  - session amount total
  - normalized currency
  - PaymentIntent ID if one has already been recorded
  - allowed intent lifecycle status (`session_created` or recoverable `processing`)
- Binding mismatches move the intent to `review_required` and stop fulfillment.
- Moves the intent to `processing` before product side effects.
- Removes the previous premature `completed` write at intent lookup.
- Marks the intent `completed` only after the webhook's product fulfillment branch finishes successfully; then marks the Stripe event completed.

### Important compatibility and correctness gate

This is a conservative enforcement change and requires immediate test coverage before deployment. Verify all checkout product modes (one-time payment, subscription, setup if ever routed through this webhook), zero-cost/test products, and Connect destination charges against the actual resolver's amount/currency semantics. In particular, confirm `session.amount_total` is always populated and equal to `intent.amount` for every supported paid checkout mode. If not, define mode-specific amount validation from authoritative Stripe fields; do not weaken the user/session/product binding.

The webhook still has broader architectural risks: fulfillment side effects are not one Firestore transaction, some downstream writes may not be idempotent, and the event claim may become stale after partial effects. A retry after partial fulfillment can repeat non-idempotent effects. This patch does not solve those issues and must not be represented as full webhook exactly-once processing.

### Verification status

- Source update committed to integration: `00a34114ef72eb2e1f6609dce34b81fa4c6e7971`.
- Documentation update follows this commit.
- No TypeScript, lint, unit, emulator, Stripe test-mode or build tests have been executed in this environment. Do not deploy or merge until those checks pass, especially the per-product amount/mode matrix.



## 38. Idempotent webhook side effects: ad-wallet credit and Instant Match creation (2026-11-09)

Continued the webhook audit and found two concrete retry hazards in the existing product fulfillment branches:

- Ad-wallet top-up used an unconditional Firestore increment. If an event failed after this write but before the event was marked complete, a retry could credit the wallet again.
- Instant Match used an auto-generated document ID. A retry after partial fulfillment could create a second match for the same paid Checkout Session.

### Implemented in `server.ts`

**Ad-wallet top-up**
- Uses deterministic fulfillment marker `stripe_fulfillments/ad_wallet_<eventId>`.
- Applies wallet increment and creates the marker in one Firestore transaction.
- Replayed webhook events see the marker and do not increment the wallet again.

**Instant Match**
- Uses deterministic match ID `im_<checkoutSessionId>`.
- Reads the match, job and deterministic fulfillment marker in one transaction.
- Requires the target job to exist.
- If the job has a `homeownerId`, verifies it matches the authenticated intent user.
- Creates the match, links it to the job, and writes `stripe_fulfillments/instant_match_<sessionId>` atomically.
- Retries for the same session cannot create a second match.

### Commit

- `4f55568b710f52b6a5df68c54f11c8224b05aeca` — make wallet and Instant Match webhook fulfillment idempotent.

### Remaining webhook retry hazards

This is not complete exactly-once fulfillment. Other branches still need the same treatment, especially:
- milestone quote update + escrow ledger + domain event + notification;
- ride completion + ledger + driver metrics;
- subscription/add-on user updates;
- boost job update + public card update;
- mediation stake state transition;
- fee settlement balance reduction.

These require per-product idempotency markers and atomicity for Firestore-only writes; external Stripe transfers remain a separate outbox/reconciliation concern.

### Verification

Static inspection only. No test, lint, build, Firestore emulator or Stripe test-mode run was performed. Add webhook regression tests that simulate a failure after each side effect and then replay the same event before deploying.


## 39. Milestone-funding webhook retry safety (2026-11-09)

Implemented a focused improvement to the `milestone_funding` Stripe webhook branch.

### Changes

- Rejects a payment fulfillment event if the referenced milestone does not exist on the referenced quote.
- Uses a deterministic fulfillment marker keyed by Checkout Session ID.
- Transactionally reads the latest quote and marker, validates the current milestone state, updates the milestone to funded, and creates the marker together.
- If a milestone is already funded by a different PaymentIntent, stops and requires manual reconciliation rather than silently overwriting its payment binding.
- Replayed events for the same Checkout Session do not repeat the quote state transition.
- Replaces auto-ID notification creation with a deterministic notification document keyed by Checkout Session ID, preventing duplicate trader notifications.
- Existing ledger recording and domain-event dispatch remain in the flow and must retain their own idempotency guarantees.

### Commit

- `4382d0bdf38307d31938ace25fba2b77d8921c54` — make milestone funding webhook state and notifications idempotent.

### Limitations / verification required

- The fulfillment marker, quote update and deterministic notification are separate operations: notification creation occurs after the transaction. If notification creation fails, replay currently attempts it again, which is desirable; the duplicate is suppressed by deterministic document ID.
- The ledger and domain event are still separate side effects. Confirm `PaymentLedgerEngine.recordEscrowFunding` deduplicates by its supplied idempotency key and confirm `domainEvents.dispatch` persists/deduplicates the supplied `webhook_<eventId>` key.
- Validate the actual pricing resolver amount for milestone funding. Current guard rejects underpayment when expected milestone value is known, but does not reject overpayment and may not account for any separately-authorized platform fee. Do not change this until the checkout contract is confirmed.
- Confirm quote ownership/trader binding is consistent with the authoritative payment intent metadata and quote record; current outer webhook gate binds the intent user to Stripe `client_reference_id`, while this branch uses quote `tradespersonId`.
- No tests, TypeScript, lint, build, Firestore emulator or Stripe test-mode verification have been run.

**Status:** implementation committed on integration only; do not deploy or merge until the payment amount contract and ledger/domain-event replay semantics are tested.


## 40. Taxi-trip webhook atomicity and replay protection (2026-11-09)

Audited the `taxi_trip` checkout fulfillment path and replaced its sequence of independent writes with one Firestore transaction.

### Previously identified risks

- Ride completion was updated independently from ledger creation.
- The ride update could repeat on webhook retry.
- Ledger used event ID and `set`, allowing separate Stripe event IDs for the same Checkout Session to create duplicate ride ledger entries.
- Driver daily earnings and trip count used increments outside a transaction and could be applied more than once.
- Ride transition failures were logged as warnings and processing continued.

### Implemented

- Requires a ride ID, driver ID, positive integer amount in minor units, and PaymentIntent ID.
- Uses Checkout Session-derived deterministic IDs for the ledger entry and fulfillment marker.
- Transactionally reads ride, ledger, marker and driver metrics before writing.
- Requires the ride to exist.
- Checks assigned driver and passenger binding when those fields are present.
- Rejects a ride already bound to a different PaymentIntent.
- Enforces the ride state transition rather than swallowing transition errors.
- Atomically updates ride completion/payment state, creates the ledger entry, updates driver daily metrics and creates the fulfillment marker.
- Computes driver net earnings from the same 12% fee calculation used in the ledger.
- Duplicate webhook deliveries or separate Stripe events for the same Checkout Session observe the marker and do not repeat metrics or ledger effects.
- An orphan ledger entry without a marker is treated as a manual-reconciliation condition rather than silently overwritten.

### Commit

- `8d643f56bd89fc8ca42a5c424afb7de5b08ecba8` — make taxi trip webhook fulfillment atomic and idempotent.

### Important unresolved questions

- Confirm the actual ride schema always uses `assignedDriverId` and `passengerId`; if not, map the authoritative field names before rollout.
- Confirm the ride Checkout Session uses the same currency and amount contract as the payment intent; the outer intent gate checks session amount/currency against the stored intent.
- Confirm Stripe Connect transfer creation is actually configured for this Checkout Session. The current `payoutTransferred: true` field is still set on session completion and must not be interpreted as proof that an external transfer settled unless `transfer_data`/transfer reconciliation confirms it.
- Confirm whether `checkout.session.completed` is sufficient for all enabled payment methods; asynchronous methods may require `checkout.session.async_payment_succeeded` handling before marking ride paid.
- This transaction is limited to Firestore state. It cannot atomically commit Stripe's external transfer.
- No TypeScript, lint, build, unit, emulator or Stripe test-mode tests were run.

**Status:** committed on integration only; verify Connect payout and asynchronous payment semantics before deployment.


## 41. Mediation stake and platform-fee settlement replay protection (2026-11-09)

### Mediation stake

- Replaced unconditional job update with a Firestore transaction.
- Requires the referenced job to exist.
- Uses a deterministic `stripe_fulfillments/mediation_stake_<sessionId>` marker.
- Rejects a stake already bound to a different Checkout Session.
- Atomically updates dispute state and creates the fulfillment marker.
- Stores the amount from the actual Stripe session in minor-unit-derived GBP value instead of hardcoding £25.00.

### Driver platform-fee settlement

- Replaced independent read/update with a Firestore transaction.
- Uses deterministic `stripe_fulfillments/fee_settlement_<sessionId>` marker.
- Atomically reduces pending fees and creates the marker.
- Duplicate webhook delivery cannot reduce the pending balance twice.
- Fails if the driver record is missing.

### Commit

- `fb6b30a97514d4546fe0549b942889550fdf395d` — make mediation stake and fee settlement fulfillment idempotent.

### Important remaining checks

- Confirm the mediation-stake Checkout Session resolver guarantees the intended fixed stake amount and currency; this handler records the Stripe amount but does not itself compare it to a separately stored expected amount.
- Fee settlement currently clamps pending fees to zero. Confirm the checkout amount cannot exceed the driver's pending fee balance; otherwise this could hide overpayment or stale-checkout conditions. The next hardening step should persist the expected settlement amount at checkout creation and compare it to the Stripe session before applying.
- Neither transaction creates an external transfer; this only updates Firestore dispute/fee state.
- Boost fulfillment remains non-atomic: job and public-card updates occur before the Instant Match-specific transaction. It still needs a deterministic general boost marker and an atomic job update, followed by retryable public-card projection.
- No tests, TypeScript, lint, build, emulator or Stripe test-mode run performed.

**Status:** committed to integration only; not production verified.


## 42. Boost and Instant Match webhook atomicity (2026-11-09)

Reworked the paid `boost` webhook branch.

### Changes

- Requires the target job to exist.
- Checks the job's `homeownerId` against the authenticated checkout user when that field is present.
- Creates a deterministic `boost_<sessionId>` fulfillment marker.
- Applies boost state and marker atomically in a Firestore transaction.
- For Instant Match tier, creates the match with stable ID `im_<sessionId>`, links it to the job, and writes its own deterministic fulfillment marker in the same transaction.
- Uses the actual Stripe session amount in minor units for the Instant Match record rather than the previous hardcoded £2.99 fallback.
- Public job card is treated as a retryable projection written after the authoritative transaction. A failed projection causes webhook retry; the deterministic markers prevent repeating the underlying boost/match state changes.

### Commit

- `3a43ead8d2c8e1797c23353a86d1c8da423ee9d9` — make boost webhook fulfillment transactional and replay safe.

### Remaining checks

- Confirm the canonical job ownership field is `homeownerId` for all boost-eligible job types.
- Verify the checkout resolver's expected price for each boost tier and compare the Stripe session amount to the authoritative intent/product amount (the outer intent gate currently compares against the stored intent).
- Confirm retry behaviour when public-card projection fails and when a second Stripe event references the same Checkout Session.
- Subscription, video-pro and exclusive-leads entitlement writes remain non-transactional and lack deterministic product fulfillment markers; audit these next.
- Mock checkout branch still has separate mock fulfilment logic and must be checked for deterministic IDs and parity; it is not Stripe webhook processing.
- No TypeScript, lint, build, emulator or Stripe test-mode tests run.

**Status:** committed to integration only; not production verified.


## 43. Subscription checkout entitlement idempotency (2026-11-09)

Reworked the three subscription entitlement branches in `checkout.session.completed`.

### Video Pro
- Uses deterministic marker `video_pro_<sessionId>`.
- Transactionally checks user and marker before granting entitlement.
- Requires the user record to exist.
- Refuses to overwrite a different existing Video Pro subscription ID.

### Exclusive Leads
- Uses deterministic marker `exclusive_leads_<sessionId>`.
- Transactionally grants the add-on and records the marker.
- Requires the user record to exist.
- Refuses to overwrite a different existing Exclusive Leads subscription ID.

### Standard membership tier
- Requires an actual Stripe Subscription ID for subscription-mode checkout.
- Uses deterministic marker `membership_<sessionId>`.
- Transactionally updates membership tier and marker.
- Refuses to overwrite a different currently active membership subscription.
- Preserves existing tier classification logic.

### Commit
- `89ed43c586223b650b0014d172067d64a41f61b1` — make subscription checkout entitlements idempotent.

### Important limitations / next checks
- This protects Checkout Session fulfilment retries, not the lifecycle webhook events (`customer.subscription.updated`, `deleted`, invoice payment success/failure). Those handlers need event/subscription ordering safeguards and must not let stale events overwrite newer state.
- Video Pro / Exclusive Leads metadata can currently route before the general `session.mode === 'subscription'` branch. Confirm these products are actually configured as Stripe subscriptions; if they are payment-mode one-offs, storing `session.id` as a subscription ID is a schema/semantic defect and must be corrected with product configuration evidence.
- A second legitimate subscription for the same user is deliberately rejected when an existing subscription is active; product rules for upgrades, replacements and parallel add-ons must be confirmed.
- Marker and user write are atomic, but downstream side effects are not included.
- No TypeScript, lint, build, unit, emulator or Stripe test-mode tests were run.

**Status:** committed on integration only; not production verified.


## 44. Stripe subscription lifecycle audit — handlers absent (2026-11-09)

### Scope inspected

Re-fetched the current integration server.ts and inspected the /api/webhook route, subscription event references, Checkout Session entitlement fulfilment, and authenticated cancel/reactivate routes.

### Verified findings

1. The webhook's only implemented business-event branch is checkout.session.completed. There are no handlers for customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, or invoice.payment_failed. Stripe-side renewal, cancellation-at-period-end completion, payment failure/recovery, and subscription status changes are therefore not reconciled back into Firestore by these lifecycle events.

2. The user schema is not a single-subscription model. Checkout writes standard membership fields subscriptionId/subscriptionStatus; Video Pro fields videoProSubscriptionId/hasVerifiedVideoProSubscription/videoVerificationStatus; and Exclusive Leads fields exclusiveSubscriptionId/hasExclusiveAddon/isExclusiveActive. Cancellation routes also refer to separate Gotham SaaS and Driver Gold subscription IDs and period fields. A generic handler that updates only subscriptionId would be incomplete and unsafe.

3. Video Pro and Exclusive Leads checkout branches execute before the general session.mode === subscription branch and currently use session.id as a fallback when session.subscription is not a string. The code does not establish that these Checkout products always use subscription mode. Do not infer a Stripe Subscription ID from a Checkout Session ID; verify product configuration and correct the schema/branch before lifecycle handling.

4. The cancellation route calls Stripe subscriptions.update with cancel_at_period_end=true; reactivation clears that flag. Neither route replaces lifecycle webhooks: cancellation can occur in Stripe's dashboard or another workflow, and period-end deletion still needs reconciliation.

5. The cancellation route can synthesize a period-end timestamp approximately 30 days in the future when no stored period-end value exists. That fallback is not authoritative Stripe billing data. The Stripe current_period_end is used when the API call succeeds, but the mock/no-Stripe path retains the estimate. Review this before relying on the displayed date for entitlement expiry.

6. The webhook has a global processed_stripe_events/<eventId> processing claim, but product-level lifecycle handling must also be subscription-bound and idempotent. Event-ID deduplication alone does not protect against distinct, out-of-order Stripe events for the same subscription or an old subscription's deletion arriving after a replacement is linked.

### Safe implementation requirements before adding handlers

- Resolve the correct user and product slot using trusted server-side bindings. Prefer the stored Stripe subscription ID and/or a verified customer-to-user association; do not trust arbitrary event metadata alone.
- Verify incoming subscription/customer IDs match the exact currently linked product subscription before changing entitlement fields. A delayed event for an old subscription must never revoke or overwrite a newer subscription.
- Persist event ordering/version information per subscription (for example Stripe event creation time together with the subscription ID) and reject stale updates. Do not compare timestamps across unrelated subscriptions as if they were one lifecycle.
- Treat Stripe's subscription object as the source of truth for status, cancellation flag and current-period end. Do not manufacture billing dates.
- Define product-specific policy for active, trialing, past_due, unpaid, incomplete, paused and canceled before translating statuses into entitlement booleans. A failed invoice should not automatically revoke paid-through access without an agreed grace-period policy.
- Extract and validate invoice subscription references using the Stripe SDK/API version in this project; do not assume an invoice object shape without checking the pinned Stripe types.
- Make each lifecycle event's user-state mutation and deterministic event marker atomic in Firestore. Keep notifications, email, ledger and other external effects independently idempotent/retryable.
- Add tests for duplicate delivery, distinct event IDs with the same resulting state, out-of-order update/delete, old-subscription deletion after replacement, invoice for the wrong customer/subscription, cancellation-at-period-end then reactivation, failed-payment grace period, and each product entitlement slot (plus Gotham/Driver Gold if those remain active products).

### Decision

No lifecycle handler was added in this pass. The current code does not provide a complete mapping from every Stripe subscription product to its authoritative Firestore entitlement fields and cancellation/grace-period policy. Implementing a generic handler without that mapping could revoke or grant the wrong entitlement. First establish the product-to-subscription schema and status policy, then implement narrowly scoped handlers and tests.

### Verification and branch state

- Static source inspection only; no TypeScript, lint, build, unit, emulator or Stripe test-mode tests were run.
- Current comparison at the time of this update: integration is 87 commits ahead and 0 behind main; base SHA 4b7963c831acbb2ea6f3084f9f4d069fb772792a.
- No merge to main, AI Studio Pull/Push, production Firebase change or deployment was performed.

**Status:** lifecycle gap confirmed and documented; implementation intentionally gated on product mapping and entitlement policy.



## 45. Subscription product checkout-to-entitlement mapping (2026-11-09)

### Sources re-fetched from integration

- `src/components/TraderVideoVerificationCard.tsx`
- `src/components/BillingManager.tsx`
- `src/components/TradesDashboard.tsx`
- `src/components/anytrader/GothamHousingPortal.tsx`
- `server.ts`

### Confirmed product checkout modes and metadata requested by clients

All inspected recurring products explicitly request `mode: "subscription"` and provide recurring monthly `price_data`:

| Product | Checkout caller | Client metadata | Intended Firestore entitlement |
|---|---|---|---|
| Standard membership | BillingManager plan selector | `tierName`, `userId` | `subscriptionId`, `subscriptionStatus`, `tier`, `isPro` |
| Landlord Pro | BillingManager | `tier: landlord`, `tierName`, `subscriptionType: landlord` | Standard membership slot plus `isLandlord` |
| Video Pro | TraderVideoVerificationCard and BillingManager | `isVideoPro`, `type: video_pro_subscription` | `videoProSubscriptionId`, Video Pro flags/status |
| Exclusive Leads | BillingManager and TradesDashboard | `isExclusiveAddon`, `type: exclusive_leads` (TradesDashboard sends only `isExclusiveAddon`) | `exclusiveSubscriptionId`, exclusive add-on flags |
| Gold Driver | BillingManager | `subscriptionType: driver_gold`, `type: driver_gold` | `driverGoldSubscriptionId`/driver subscription fields and Gold driver entitlements |
| Gotham SaaS | GothamHousingPortal | `subscriptionType: gotham_saas`, `type: gotham_saas`, doors, tier and billing cycle | `gothamSubscriptionId`, Gotham subscriber/plan fields |

### Important implementation gaps identified

1. **Client metadata is not sent directly to Stripe.** The checkout route intentionally sends only `metadata: { intentId }` to Stripe and later reads product metadata from the authoritative Firestore payment-intent record. Therefore, the next audit must inspect the server-side intent creation/resolver and prove that it copies/normalizes the relevant product metadata into `payment_intents/<intentId>.metadata`. The frontend request payload alone is not proof that webhook metadata survives.

2. **Video Pro and Exclusive Leads do use subscription mode in the inspected UI callers.** This resolves the earlier uncertainty for these two currently inspected flows. Their webhook fallback to `session.id` is still incorrect defensive behavior: when `session.mode === "subscription"`, absence of a valid `session.subscription` should fail fulfilment and be retried/reconciled, not persist a Checkout Session ID in a field named `*SubscriptionId`.

3. **Gold Driver and Gotham do not have explicit fulfilment branches in the inspected checkout webhook block.** The general membership branch currently classifies `tierName` text and writes standard membership fields. It does not visibly set the dedicated Gold Driver entitlements (`isGoldDriver`, `driverTier`, commission/filter/dispatch fields) or Gotham entitlements (`isGothamSubscriber`, `gothamSubscriptionId`, doors/tier/billing-cycle fields). This conflicts with the product UI and historic product documentation and is a likely entitlement regression requiring a dedicated handler or explicit server-side product mapping.

4. **Exclusive Leads has an additional direct-activation bypass in TradesDashboard.** If checkout returns no URL or throws, the component directly updates the user document to activate the add-on. This bypasses Stripe confirmation and server-side fulfilment. It must be removed or replaced with a clearly isolated non-production mock flow; do not grant paid production entitlements from a client-side fallback.

5. The inspected Video Pro, Exclusive Leads, Gold Driver and Gotham callers send a random `Idempotency-Key` per attempt. Server-side checkout idempotency is separately keyed by the authoritative intent ID. Confirm the intent creation layer reuses an intent for safe retries and does not create multiple billable subscriptions after network ambiguity.

### Next implementation sequence

1. Trace the authoritative checkout-intent resolver and document exactly how it derives `mode`, `lineItem`, `metadata`, amount and currency from each product request. Confirm client-supplied prices/metadata are not trusted.
2. Add strict validation that all subscription-mode sessions contain a Stripe Subscription ID; remove Checkout Session ID fallbacks for Video Pro and Exclusive Leads.
3. Add dedicated, idempotent transactional fulfilment for Gold Driver and Gotham, using their authoritative metadata and their own subscription ID slots. Do not let these products fall through to generic membership tier classification.
4. Remove the TradesDashboard direct Firestore entitlement fallback for Exclusive Leads in production.
5. Add product-by-product tests proving checkout metadata -> intent record -> Stripe session -> webhook -> correct entitlement mapping.
6. Only then implement lifecycle webhooks against the same explicit product mapping, including old-subscription protection and product-specific cancellation/grace rules.

### Verification

- Integration files were fetched directly from branch `integration/pr-consolidation-20261109`; no source code was changed in this checkpoint.
- Static inspection only; no tests/build/lint or Stripe test-mode verification.
- Main and AI Studio remain untouched.

**Status:** product checkout modes mapped for the inspected UI callers; server-side intent resolver and Gold Driver/Gotham webhook fulfilment are the next high-priority gaps.


## 46. Subscription ID validation and Exclusive Leads client-side entitlement bypass removal (2026-11-09)

### Changes made on integration

1. Video Pro and Exclusive Leads webhook fulfilment now require subscription mode and a non-empty string Stripe Subscription ID. They no longer substitute a Checkout Session ID into fields named subscription ID. Missing subscription data throws so the webhook can be retried/reconciled rather than corrupting subscription identity.
2. Removed the Exclusive Leads client-side Firestore entitlement writes from checkout failure/missing redirect handling, exception fallback, and success-return URL handling. The client now reports checkout failure without granting paid access. The success URL flag only controls UI messaging; it is not proof of payment. The verified Stripe webhook remains the entitlement authority.

### Authoritative intent resolver trace

- The webhook reads payment_intents/<intentId> using the intent ID in Stripe Checkout Session metadata and verifies user binding, Checkout Session ID, mode, amount, currency, optional PaymentIntent ID, and allowed intent status before using intent.metadata for product routing.
- The Checkout Session is created with only metadata containing intentId and uses deterministic Stripe idempotency key checkout_session_<intentId>.
- The full intent-creation/product-resolution section still requires targeted inspection to establish precisely how each client's metadata and pricing catalog result are persisted. No conclusion is made here that every product metadata path is correct.
- Stripe customer lookup/creation currently catches errors and continues without a customer ID; this is not changed because compatibility with customer-less flows needs product-specific verification.

### Verification and limitations

- Static source edits only. No TypeScript, lint, build, unit, emulator, browser, or Stripe test-mode tests were run.
- Gold Driver and Gotham still require dedicated server-side entitlement mapping; no generic membership fallthrough was changed.
- Subscription lifecycle webhooks remain unimplemented pending product-specific status/grace-period policy.
- No merge to main, AI Studio sync, production Firebase change, or deployment was performed.

**Status:** committed on integration only; do not deploy until automated tests and payment-flow verification pass.


## 47. Dedicated Gold Driver and Gotham SaaS checkout fulfilment (2026-11-09)

### Changes on integration

Added product-specific subscription fulfilment branches before generic membership classification in the Stripe checkout webhook.

**Gold Driver**
- Routes using authoritative intent metadata `type=driver_gold` or `subscriptionType=driver_gold`.
- Requires subscription-mode Checkout and a real Stripe Subscription ID.
- Transactionally writes a deterministic `driver_gold_<sessionId>` fulfilment marker and the dedicated user fields: `isGoldDriver`, `driverTier=gold`, `driverSubscriptionId`, `driverSubscriptionStatus=active`, `commissionRate=0.10`, and `driverSubscribedAt`.
- Rejects replacing a different linked Gold Driver subscription.

**Gotham SaaS**
- Routes using authoritative intent metadata `type=gotham_saas` or `subscriptionType=gotham_saas`.
- Requires subscription-mode Checkout and a real Stripe Subscription ID.
- Transactionally writes a deterministic `gotham_saas_<sessionId>` marker and dedicated user fields: `isGothamSubscriber`, `gothamSubscriptionId`, `gothamSubscriptionStatus=active`, `gothamDoorsCount`, `gothamTierName`, `gothamBillingCycle`, and `gothamSubscribedAt`.
- Door count is bounded to 1..100000; billing cycle is normalised to monthly/annual.
- Rejects replacing a different linked Gotham subscription.

### Mapping caveat

The server pricing resolver already recalculates Gotham pricing and returns authoritative Gotham metadata. The Gold Driver resolver returns canonical `tier=driver_gold` and `subscriptionType=driver_gold`; the generic webhook previously classified its display name containing "Gold" as the ordinary Premium trader tier. This dedicated branch prevents that incorrect classification.

### Verification and remaining work

- Static source edit only. No TypeScript, lint, build, unit, emulator, or Stripe test-mode run.
- Confirm downstream driver dispatch/commission logic consumes `commissionRate` and `driverTier`; this write mirrors the existing Gold Driver UI/schema cues but must be verified against all consumers.
- Confirm Gotham UI/authorization reads the exact `gothamDoorsCount`, `gothamTierName`, and `gothamBillingCycle` field names across the full codebase.
- Lifecycle events, cancellation status synchronisation, and grace-period policy remain unimplemented.
- No merge to main, AI Studio sync, production Firebase change, or deployment.

**Status:** dedicated checkout fulfilment committed to integration; automated verification required before deployment.


## 48. Complete product entitlement fields for Gold Driver and Gotham (2026-11-09)

Follow-up comparison against the existing changelog and product schema revealed additional legacy entitlement fields required by downstream features.

- Gold Driver fulfilment now also grants `destinationFilters: 4`, `advanceBookingDays: 14`, and `priorityDispatch: 50`, matching the documented Gold Driver benefits. It resets `driverCancelAtPeriodEnd` on a new subscription.
- Gotham fulfilment now also sets `subscriptionType: gotham_saas`, `tier: gotham`, `tierId` from the authoritative tier name, and `gothamCancelAtPeriodEnd: false`, in addition to its dedicated subscription/licensing fields.

These fields were found in the repository's historic product documentation/schema references; their consumers still need a full code search and runtime verification.

**Verification:** static diff only. No tests/build/lint or Stripe test mode. No main/AI Studio/deployment changes.


## 49. Correct Stripe cancellation period-end persistence (2026-11-09)

The cancellation endpoint already separated Gotham and Gold Driver subscription IDs and initially wrote product-specific period-end fields. However, after Stripe returned the authoritative subscription object, the shared branch updated only generic `currentPeriodEnd` for both products, leaving `gothamCurrentPeriodEnd` / `driverCurrentPeriodEnd` at their previous or estimated values.

Fixed the Stripe-success path so Gotham and Gold Driver now persist Stripe's returned `current_period_end` into both their product-specific period-end field and the generic compatibility field. This prevents the UI/product-specific record from retaining a fabricated 30-day estimate after a successful Stripe cancellation update.

**Verification:** static source edit only; no tests/build/lint or Stripe test mode. The mock/no-Stripe fallback still uses the existing 30-day estimate and remains a known issue. No main/AI Studio/deployment changes.


## 50. Remove false-positive checkout success messaging (2026-11-09)

A review of the Gold Driver and Gotham SaaS checkout callers found that both displayed an "Active" success toast when the checkout API returned neither a redirect URL nor an explicit error. This did not directly grant Firestore entitlement, but it falsely told users a paid subscription was active even though Stripe Checkout had not started.

- Gold Driver now reports that checkout did not return a payment URL and explicitly says the subscription has not been activated.
- Gotham SaaS now does the same and no longer closes the licensing calculator on this non-success path.
- The only success path remains redirecting the user to the Stripe Checkout URL; entitlement activation remains server-webhook controlled.

### Verification
- Static source replacement only; no build, lint, unit, browser, emulator or Stripe test-mode verification.
- No changes to main, AI Studio, production Firebase or deployment.


## 51. Checkout resolver-to-fulfilment trace and lifecycle gap (2026-11-10)

### Confirmed by source inspection

- The server pricing resolver's membership catalog branch canonicalises Landlord Pro to `tier=landlord` / `subscriptionType=landlord`, and Gold Driver to `tier=driver_gold` / `subscriptionType=driver_gold`. It preserves the caller metadata after authoritative keys, so product routing values must remain validated server-side (the webhook consumes the persisted intent metadata, not the browser's Stripe metadata).
- The webhook's ordinary membership branch explicitly sets `isLandlord`, `subscriptionType=landlord`, and the generic membership fields when landlord metadata is present. Gold Driver and Gotham are routed to their dedicated branches before this generic tier classifier.
- Gotham pricing resolver builds authoritative subscription line-item amount and metadata (`type`, `subscriptionType`, door count, tier name, billing cycle, user binding); Gold Driver resolves the catalog price and canonical subscription metadata.
- The webhook currently handles checkout-session completion for activation. Source inspection found no handlers for `customer.subscription.updated`, `customer.subscription.deleted`, or `invoice.payment_failed` in this route. Therefore cancellation-at-period-end, actual expiry, payment delinquency, and reactivation do not yet have a demonstrated event-driven entitlement synchronisation path.

### Risk / next action

- Do not treat checkout activation as a complete subscription lifecycle. Design lifecycle handling only after confirming product policy (immediate cancellation vs period-end access, grace period, failed-payment recovery) and each product's actual consumer fields. Use Stripe subscription ID + product discriminator, event idempotency, and stale-event protection; avoid a generic event handler that accidentally downgrades unrelated product entitlements.
- Existing cancellation endpoint's product-specific period-end persistence is only a request-side update; it is not proof that entitlements are revoked or restored at the right time.
- Gold Driver and Gotham downstream consumer/field audits remain open. Landlord's generic membership mapping is source-confirmed, but still needs tests against its UI and entitlement consumers.

### Verification / promotion safety

- Inspection only; no code change to lifecycle behaviour and no automated tests or Stripe test-mode events run.
- Integration branch remains the sole working branch for reconciliation. No main merge, AI Studio Pull/Push, or deployment.


## 52. Gold Driver and Gotham entitlement consumer audit (2026-11-10)

### Gold Driver — entitlement mismatch found

A targeted read of `src/components/driver/DriverTerminal.tsx`, `DriverEarnings.tsx`, `DriverJobs.tsx`, and `DriverMenu.tsx` shows that driver commission is currently sourced from platform/global ride configuration (including `platform_config/global_tiers.providerModels.on_demand_transport.tiers.STANDARD`, remote config, and ride settings). The inspected driver runtime does not read `users.driverTier`, `users.isGoldDriver`, or a per-user `users.commissionRate` to select a Gold-specific commission. Driver UI displays the effective configured commission, not a Gold entitlement override.

Consequently, the Stripe fulfilment write of `commissionRate: 0.10` is not by itself evidence that Gold Drivers receive a 10% commission. The product catalogue says Gold Driver offers a reduced 10% commission, while the actual runtime consumer path appears global/tier-config based. This is an implementation gap to resolve deliberately (e.g. a trusted server-derived driver tier/config selection), not by trusting a client profile field. The destination-filter/advance-booking/priority fields also have not been demonstrated to be consumed by driver runtime.

### Gotham — license quantity not enforced in inspected portal

`GothamHousingPortal.tsx` uses `isGothamSubscriber` / `subscriptionType=gotham_saas` to identify subscription status and sends `calculatorDoors` in checkout metadata. Its current portal references `gothamDoorsCount` only in the checkout request; the inspected portal does not use the persisted user `gothamDoorsCount` to cap property/door creation or feature access. Persisting the purchased count is therefore not proof that licensed-door enforcement exists. Trace the actual property creation/API paths and enforce limits server-side against the verified subscription record before claiming metered licensing is complete.

### Decision and follow-up

- Do not advertise Gold's 10% fee as technically fulfilled until the fare/commission calculation selects the Gold rate for the authenticated driver and tests prove it.
- Do not claim Gotham door limits are enforced until all property/door write APIs are audited and a server-side limit is in place (if this is the intended commercial policy).
- No entitlement-consumer code was changed in this pass: safely implementing these requires tracing server dispatch/fare authority and property write endpoints, not adding client-side checks.

### Verification

- Static source inspection only; no build/tests/emulator/Stripe events.
- Integration-only documentation update; main, AI Studio, and deployment untouched.

## Section 53 — Gold Driver commission now applied in payout calculation (2026-11-10)

### Change
- Updated `src/server/driverPayoutOrchestration.ts`: server payout commission is now 10% only when the driver profile carries the Stripe-fulfilment entitlement tuple `isGoldDriver === true`, a non-empty `driverSubscriptionId`, and `driverSubscriptionStatus === "active"`. Otherwise the established platform commission remains 12%.
- The payout transfer metadata now records the applied commission rate and driver tier; the completed ride ledger fields persist `appliedCommissionRate` and `appliedDriverTier` for auditability.
- Driver share is calculated as (1 - effectiveCommissionRate) in integer pence; tips remain 100% driver-paid. Existing idempotency remains keyed by the final transfer amount, so a changed rate changes the deterministic transfer key.

### Security basis / caveat
- Firestore `users/{userId}` rules permit self-updates only to an allowlist that excludes `isGoldDriver`, `driverSubscriptionId`, and `driverSubscriptionStatus`; Stripe webhook/admin server writes remain authoritative. Gold entitlement requires all three markers rather than trusting the client-provided `commissionRate` value.
- This fixes the previously identified payout-engine mismatch, but does not yet prove the driver-facing fare preview UI displays the same 10% rate. UI parity and cancellation/status lifecycle synchronization remain follow-up items; if Stripe subscription status is stale, the payout entitlement can remain stale until lifecycle handling is implemented.

### Verification
- Source-level change committed to `integration/pr-consolidation-20261109`; no local TypeScript build, unit test, emulator, or Stripe transfer test was run in this environment.
- Main and AI Studio remain untouched; no merge/deployment performed.

## Section 54 — Gold payout regression coverage added (2026-11-10)

- Added tests 16–17 to `tests/unit/driverPayoutOrchestration.test.ts`: active Gold entitlement must transfer 90% of base fare plus 100% of tip, and write Gold/rate audit fields; stale/incomplete Gold markers must retain the 12% standard rate.
- These tests assert £50 fare + £5 tip → £50 driver transfer / £5 platform fee for active Gold, versus £44 driver share / £6 platform fee for standard (no tip).
- Test source committed; execution still pending because no local checkout/test runner has been established in this GitHub-only session.


## Section 55 — CI blocker: checkout/webhook route boundary regression (2026-11-10)

### Evidence
- Integration head `d5029ac25621da29395e45feb95b74e41796d204`, CI run [42782297725](https://github.com/Saanwar2002/AnyTrader/actions/runs/42782297725), failed at the Firestore emulator/security test stage.
- Job log reports esbuild parse error at `server.ts:2066`: `Expected "finally" but found "let"`.
- The failed import caused six suites to fail loading; the security/unit suites, TypeScript/lint, production build and final release audit were skipped.
- Source inspection confirms integration currently has no `app.post("/api/create-checkout-session"...)` declaration, while the original `main` source has a distinct checkout route after the webhook. Integration's webhook/checkout logic appears structurally interleaved: webhook starts at line 1662, checkout's `let customerId` appears at 2066 while the parser still expects a try continuation. This is a route-boundary/brace regression, not evidence that the Gold commission tests themselves failed.

### Required repair
- Restore a clean separation: webhook route must close its processing `try/catch` and handler before express JSON middleware/ordinary API routes; checkout session creation must be its own authenticated `/api/create-checkout-session` route.
- Preserve integration's newer Stripe webhook security, intent binding, idempotent fulfilments, and Gold/Gotham branches while restoring the original checkout route logic from main as a structural reference (do not blindly replace server.ts with main).
- Verify route registration and parse/typecheck first, then rerun emulator/security, unit/pen-test, lint/typecheck, production build, and release audit.
- Do not merge to main, pull/push AI Studio, or deploy until the full gate passes and reconciliation is approved.

### Verification / status
- CI failure confirmed from job summaries and raw logs; root cause localized to server.ts route/try boundary.
- No repair committed in this section; this is explicitly a blocking defect.


## Section 56 — Stripe webhook / checkout route boundary repair (2026-11-10)

### Changes committed on integration
- `316cdd5773c89ef8dce15e4b124877d84139a23b` — restored the standalone authenticated `POST /api/create-checkout-session` route using main's route implementation as a structural reference; restored the webhook's completion/error catch boundary.
- `c497b44e63a0bc59008eb609f364f9a47018389b` — removed the stray checkout mock-completion block from webhook processing (it referenced checkout-only values such as `finalSuccessUrl` and `intentRef`).
- Current route declarations verified by fetching integration `server.ts`: webhook at line 1662; checkout at line 2091; setup-session at line 2362. Webhook catch now records failed event state and returns HTTP 500 on processing errors.
- Main was not modified. No AI Studio sync or deployment performed.

### CI validation (pending at documentation time)
- Run #537 (`316cdd5`) and #538 (`c497b44`) were both observed in progress after push. Run #538: [CI & Security Rules Release Gate](https://github.com/Saanwar2002/AnyTrader/actions/runs/42785092767).
- Do not mark this repair verified until a run completes and emulator/security, unit/pen-test, TypeScript/lint, production build, and release audit results are inspected. If any subsequent stage fails, record and repair that blocker before advancing.


## Section 57 — Stripe route repair CI verification and lifecycle audit queue (2026-11-10)

### CI result
- Run #538 on commit `c497b44e63a0bc59008eb609f364f9a47018389b` completed **successfully**: [CI & Security Rules Release Gate](https://github.com/Saanwar2002/AnyTrader/actions/runs/42785092767).
- Job `security-and-build-gate` succeeded, including Firebase Security Rules + real Firestore emulator concurrency tests, unit/penetration suite, TypeScript/linter checks, production build, and final release audit. This supersedes the earlier intermediate run #537 failure (which tested commit `316cdd5` before the second boundary correction).
- Run #539 is a docs-only follow-up on `5582303` and also succeeded.
- CI success validates the checked commit, not the entire integration branch's readiness to merge; outstanding reconciliation/audit items remain.

### Next required reconciliation audits (not yet fixed)
1. Stripe subscription lifecycle: webhook currently explicitly fulfills `checkout.session.completed`, then marks other event types completed without processing them. Implement and test `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed` so cancellation/expiry/payment failure cannot leave stale entitlements for membership, Gotham SaaS, Gold Driver, Exclusive Leads, and Video Pro. Preserve cancel-at-period-end benefits until actual period end; do not revoke merely on `cancel_at_period_end=true`.
2. Gotham licence/door cap: verify server-side property CRUD enforces subscription door entitlement, not only checkout metadata/UI. Add regression tests for cap bypass and tier changes if missing.
3. Review Stripe lifecycle mapping and current entitlement field names against actual checkout fulfilment and existing cancellation/reactivation endpoints before coding; avoid guessing or blanket revocation.
4. Run focused tests plus full CI after changes. Integration branch only; no main merge, AI Studio Pull/Push, or deployment absent explicit approval.



## Section 58 — Gotham property entitlement enforcement: confirmed bypass and architecture decision (2026-11-10)

### Source evidence
- Re-inspected integration `server.ts`: Gotham Stripe checkout fulfilment stores `isGothamSubscriber`, `gothamSubscriptionId`, `gothamSubscriptionStatus`, `gothamDoorsCount`, tier, and billing-cycle fields (around lines 1855–1887). This is purchase persistence only.
- Inspected `firestore.rules` `/properties/{propertyId}` (around lines 736–784). Authenticated owners/users can directly `create` property documents if `ownerId` or `userId` equals their UID; this rule does not consult Gotham subscription status or door allowance. The client can therefore create multiple property records without a server-enforced licensed-door count, assuming it meets the ownership fields.
- Property create is not currently an authoritative server API in the inspected `server.ts` routes; property records are written directly through Firestore. A simple server route addition alone would not close the bypass while direct Firestore create remains allowed.

### Finding / required architecture
- **Confirmed:** Gotham door count is not enforced at the Firestore property-create boundary. Do not describe paid door licensing as enforced.
- To enforce a count safely, property creation must become a trusted server-mediated operation (or another design with an atomic authoritative quota). Server must authenticate UID, read current subscription/door allowance, count or reserve licensed slots under concurrency-safe transaction/locking, and create the property + quota reservation atomically. Direct client create must then be denied for ordinary users; trusted server/admin paths remain deliberate.
- Existing property migrations, transfers, deletions, admin creation, landlord roles, and legacy users need an explicit grandfathering/slot-release policy before changing rules. Avoid an unsafe rules-only approximation: Firestore rules cannot perform an arbitrary collection count, and client-only checks are bypassable.

### Next implementation sequence
1. Trace all property creation call sites, existing property schemas, and admin/import paths; determine whether one canonical server command can replace them.
2. Define quota accounting (count existing active properties vs explicit slot documents; how delete/transfer releases a slot; how tier/quantity changes and subscription expiry affect existing inventory).
3. Implement server-authoritative create + atomic quota reservation and migrate client call sites; deny direct owner create in rules after migration coverage.
4. Add emulator tests for under-limit, at-limit, concurrent creates, spoofed owner, non-subscriber, deletion/slot release, admin/legacy migration, and tier increase/decrease.
5. Independently implement/test Stripe lifecycle synchronization (Section 57); do not let subscription cancellation unexpectedly erase existing property records.

### Verification / promotion safety
- Inspection only; no quota enforcement code or rules changed in this section.
- Integration only. Main, AI Studio sync, production Firebase, and deployment untouched.



## Section 59 — Property write-path inventory and quota migration preparation (2026-11-10)

### Inspected call sites
- `src/components/PropertyManager.tsx` is a confirmed direct client creation path: `addDoc(collection(db, "properties"), ...)` in `handleAddProperty` (currently around lines 85–100). It writes ownerId, name, address, postcode, city, propertyType, active status, and ISO timestamps. The same component edits existing properties with `updateDoc` and deletes them with `deleteDoc`.
- `src/components/property/TransferOwnershipModal.tsx` updates existing property documents for transfer; it is not a create path.
- `src/components/property/ClaimPropertyPassportModal.tsx` queries and updates an existing property; it is not a create path.
- `src/components/PropertyPassportModal.tsx` updates existing property metadata and nested records; no root-property creation identified in the inspected matches.
- `src/components/property/MoveInLanding.tsx` reads private/public property records; no create path.
- `src/components/TenantReportPortal.tsx` creates tenant issue records, not property records.
- `src/components/anytrader/GothamHousingPortal.tsx` was inspected for root property creation patterns; no direct `addDoc/setDoc` to `properties` found in its content.
- Existing `tests/unit/propertySecurityRules.test.ts` verifies privacy/ownership protection but does not assert that ordinary client property creation is denied or enforce a Gotham quota. The Firestore rules currently permit owner/user direct create, confirming the bypass described in Section 58.

### Migration implications
- The primary property-add UI path to migrate first is `PropertyManager.handleAddProperty`; edit/delete should remain distinct operations and must not consume/release a slot incorrectly.
- Existing claim/transfer paths mutate existing property documents and need policy review: ownership transfer should move quota ownership/reservation atomically, not create a second property slot; passport claim must not silently create a quota slot.
- Deletion currently happens directly in the client. Once quota reservations are introduced, deletion must release the corresponding slot through a trusted atomic operation or be handled by a server-side deletion workflow; direct deletion cannot leave orphaned quota reservations.
- This is a focused call-site inventory of the principal property-management and adjacent property components, not proof that no other root-property creation exists anywhere in the repository. Before changing Firestore create rules, complete a repository-wide search for `addDoc(collection(db, "properties"))`, `setDoc(doc(db, "properties"`, Admin SDK writes, imports/seeds, and test fixtures.

### Decision / next implementation work
1. Add an explicit server-owned quota model (prefer deterministic slot documents or a per-owner counter updated transactionally) with documented migration/grandfathering for existing properties.
2. Define authoritative entitlement source and allowed admin/legacy exemptions. Stripe checkout metadata alone is not authoritative for ongoing entitlement; reconcile against verified subscription state and stored user entitlement fields.
3. Design one trusted create operation that authenticates the Firebase ID token, validates payload/ownership, checks active subscription and licensed door count, atomically reserves a slot and creates the property, and returns the new property ID.
4. Migrate `PropertyManager` create/delete flows and all other discovered write paths; preserve existing update/transfer semantics with explicit slot transfer rules.
5. Only after migration and emulator coverage, deny direct ordinary-user `create` on `/properties/{propertyId}`; preserve admin paths and existing reads/updates as intended.
6. Add concurrency, cap, downgrade, cancellation, transfer, delete/release, grandfathering, spoofing, and idempotent retry tests.

### Status
- Inspection/documentation only; no application code or Firestore rules changed.
- Integration branch only. Main, AI Studio sync, Firebase production, and deployment untouched.



### Follow-up repository-wide search correction (2026-11-10)
- A broader GitHub code search found two additional direct root-property create paths that were not in the initial focused component inventory:
  - `src/components/Portfolio.tsx` around lines 269–287: creates a root property with `ownerId`, address, property type, contact details, access instructions, and active status. It also deletes root properties directly around line 336.
  - `src/components/HomeHealthWidget.tsx` around lines 320–334: when no active property is selected, creates a root property with `ownerId`, `userId`, `homeownerId`, property/boiler/condition fields and active status.
- Therefore the migration must cover at least three UI create paths: PropertyManager, Portfolio, and HomeHealthWidget. Portfolio and PropertyManager duplicate much of the property creation UX and need a shared trusted API/service to avoid policy drift.
- GitHub code search indexes the default branch; fetched file contents above were explicitly read from integration. Treat the search as a discovery aid, not an exhaustive proof of integration contents. Continue searching integration tree/call sites and server/Admin SDK/import flows before tightening rules.


## Section 59 — Gotham quota migration: property-write call-site inventory (2026-11-10)

### Confirmed direct client create paths
The following integration-branch components create properties documents directly with Firestore addDoc(collection(db, "properties"), ...):
1. src/components/PropertyManager.tsx (around line 85): ownerId, name, address, postcode/city, propertyType, active status, timestamps.
2. src/components/Portfolio.tsx (around line 269): same core schema plus contactName, contactPhone, accessInstructions.
3. src/components/HomeHealthWidget.tsx (around line 325): creates Property Passport with ownerId, userId, homeownerId, property data, active status and createdAt; updates an existing property directly when editing.
- Search also surfaced TenantReportPortal.tsx and PostJobWizard.tsx, but excerpts did not establish that either creates a property. Do not include them in migration until actual write operations are inspected.
- No server-side property-create endpoint was found in the inspected server route inventory. Existing server property routes found so far are intelligence/rollup and predictive-maintenance operations, not canonical property creation.

### Migration implications
- The three confirmed client create paths must converge on one authenticated server command before Firestore direct-create is denied.
- Preserve their distinct payload fields; normalize into a shared validated property schema without dropping Property Passport fields, contacts, access instructions, or UK postcode/address structure.
- Editing existing properties is separate from creating new licensed slots. Existing update/delete/transfer rules and property owner/landlord/tenant access must not be unintentionally broken.
- The direct create rule currently permits ownerId/userId owner writes and admin writes; it does not enforce Gotham entitlement or door count.
- Property quota semantics remain undecided: source evidence does not yet establish whether every user's default allowance is zero, one, or a free baseline, nor whether gothamDoorsCount means purchased total or incremental capacity. Do not ship an assumed default or revoke/deny existing inventory until pricing/UX contract and existing customer data are reconciled.

### Implementation gate
1. Inspect authoritative Gotham plan catalogue, checkout request payload, fulfilment fields, subscription management UI, and all property delete/transfer/admin workflows.
2. Confirm entitlement semantics and define active/legacy grandfathering and over-quota behaviour.
3. Implement atomic reservation/creation with UID from verified bearer token (never request body), transactionally checking entitlement and quota; include idempotency so retries do not consume multiple slots.
4. Migrate all three confirmed create call sites and test each payload shape.
5. Only after migration, deny ordinary direct client property creation in Firestore rules; preserve explicit admin/trusted-server pathways.
6. Emulator coverage: unauthenticated, spoofed UID, non-subscriber/default plan, within limit, at limit, concurrent attempts, idempotent retry, delete/release, transfer, admin, legacy existing properties, tier upgrade/downgrade and Stripe expiry.
7. Run full CI; no main merge, AI Studio sync or deployment until promotion criteria are satisfied.

### Status
- Inventory and source inspection only. No property API, client migration, or Firestore rule changes committed in this section.


## Section 60 — Gotham entitlement semantics and cancellation lifecycle findings (2026-11-10)

### Pricing contract confirmed
- Gotham calculator in src/server/pricingCatalog.ts accepts a requested door quantity, clamps it to 1..100,000, and defaults a missing/zero value to 100. Pricing: 1–100 doors £4.50/door/month; 101–1,000 £3.50; 1,001+ £2.50; annual billing applies a 15% discount.
- GothamHousingPortal UI (src/components/anytrader/GothamHousingPortal.tsx) defaults calculatorDoors to 4,850 and submits gothamDoorsCount with subscriptionType gotham_saas to /api/create-checkout-session. This is a purchased portfolio capacity, not an incremental per-property allowance. The 100-door server fallback is a checkout compatibility default, not evidence of a free 100-door entitlement.
- Checkout fulfillment writes isGothamSubscriber=true, gothamSubscriptionId, gothamSubscriptionStatus=active, gothamDoorsCount, tier, billing cycle and gothamCancelAtPeriodEnd=false. It does not currently persist Gotham current_period_end in the inspected fulfilment branch.

### Lifecycle gap confirmed
- Stripe webhook route has explicit checkout.session.completed fulfillment. Other event types are currently marked as processed/completed without applying subscription state transitions (see Section 57). Thus subscription updates, deletion and failed invoices can leave Firestore entitlement markers stale.
- /api/cancel-subscription schedules Stripe cancel_at_period_end and records Gotham pending cancellation; /api/reactivate-subscription clears it. Benefits should remain through period end. However, when Stripe is unavailable, cancellation code fabricates a 30-day current period end and writes a mock cancellation success; this must not be used as production entitlement evidence. Mock fallback should be constrained to explicit test/development mode, not a general Stripe failure.
- The cancellation route does not revoke Gotham immediately, which is correct for scheduled cancellation. Actual period-end deletion/expiry still needs webhook-driven status synchronization and an authoritative period-end timestamp.

### Safe next implementation sequence
1. Extend Gotham checkout fulfilment to persist authoritative Stripe subscription status and current_period_end from a retrieved/expanded Stripe subscription (or the event's verified subscription object), not a guessed duration.
2. Implement idempotent handlers for customer.subscription.updated, customer.subscription.deleted and invoice.payment_failed; map by verified subscription ID to the correct product entitlement. For Gotham, preserve active access when cancel_at_period_end=true and current_period_end is in the future; revoke/disable new door reservations only when Stripe confirms terminal status/period end. Handle past_due/unpaid according to a deliberately approved grace policy.
3. Fix cancel/reactivate endpoint fallbacks: never fabricate a period end or report real cancellation success when Stripe API is unavailable; return a clear service error unless explicit test mode is active.
4. Implement the server-authoritative property-create reservation command and migrate the three direct-write call sites (Section 59). Existing properties are grandfathered pending explicit policy; do not delete or hide records on subscription lapse.
5. Add Stripe webhook tests for duplicate delivery, out-of-order events, cancellation scheduled, cancellation reversed, period-end deletion, failed invoice, recovery payment, and subscription replacement.

### Status
- Audit findings documented; no lifecycle handler, cancellation route or property-write code changed in this section.
- Integration only. No main merge, AI Studio sync, production data change or deployment.


## Section 61 — Reconciliation checkpoint: property quota implementation and subscription lifecycle gap (2026-11-10 10:30 UTC)

### Live repository state re-fetched

- Working branch: `integration/pr-consolidation-20261109`.
- Current integration head: `2027a0ae3433d33efc9d43d1b6226a00bab5b03a` (commit: `docs: update transfer authorization follow-up status`).
- Original `main`: `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Integration is **173 commits ahead / 0 behind** main. Main remains unchanged.
- The latest fully successful code CI identified in the repository is run `42796203967` on code commit `111aad93e15b948ba6393d0ee24df14bf68dafea`. The run's `security-and-build-gate` job completed successfully through emulator/security/concurrency tests, unit/penetration tests, lint/type-check, production build and release audit.
- The current branch is seven commits beyond that tested code commit. Those commits change `DEVELOPMENT.md`, `GOTHAM_PROPERTY_QUOTA_AUDIT.md`, `MASTER_BUILD_PLAN.md`, `src/server/authorization.ts`, and `tests/unit/propertySecurityRules.test.ts`. The latest follow-up CI attempt is documented as failing to obtain a runner (`runner_id: 0`, no steps). Therefore the current branch head is **not yet covered by a successful complete CI run**. Do not treat run 42796203967 as validation of the seven later commits.
- A workflow-run lookup for the current documentation head returns no PR-triggered run; this is not proof that all push-triggered workflows were checked. The exact latest successful run above was independently inspected and its single gate job concluded `success`.

### Gotham property quota — implementation now present; verification remains incomplete

The earlier Sections 58–60 and parts of `GOTHAM_PROPERTY_QUOTA_AUDIT.md` describe the pre-remediation state and must not be read as current implementation status.

Re-fetches from the current integration head confirm:
- `POST /api/properties` derives ownership from the verified Firebase identity, rejects protected/unknown payload fields, checks real Gotham subscriptions against Stripe, and enforces the purchased door allowance using a per-user Firestore transaction/counter with legacy-count backfill.
- `DELETE /api/properties/:id` performs owner/admin authorization and updates the same usage counter transactionally.
- Property transfer claim is server-mediated and moves the quota count between owners within a transaction.
- `firestore.rules` denies direct client create/delete on `/properties`; ownership changes are server-mediated.
- `PropertyManager.tsx`, `Portfolio.tsx`, and `HomeHealthWidget.tsx` use `propertyCommandService.ts` for creation; the two deletion call sites use the server command.
- Existing property edits remain separate. Existing inventory is not automatically deleted or hidden when a subscription lapses.

**Remaining property acceptance gates:** add/run API-level tests for forged/protected fields, ordinary non-Gotham users, active/inactive/expired subscriptions, period-end cancellation, allowance boundaries, legacy backfill, idempotency replay, and concurrent create/delete/transfer. Review whether client-generated idempotency keys remain stable across a user retry after an ambiguous network result; the current helper creates a fresh UUID for each invocation, so a repeated invocation is not necessarily the same logical request. Reconcile usage counters against actual property ownership records and transfer/delete race cases before release.

### Stripe subscription lifecycle — current source audit confirms the gap is broader than Gotham

The current `server.ts` webhook has a lifecycle block for `customer.subscription.updated`, `customer.subscription.deleted`, and invoice events, but its user lookup and mutation target only `gothamSubscriptionId`. It does not yet synchronize the other subscription products:
- membership (`subscriptionId` / `subscriptionStatus`);
- Gold Driver (`driverSubscriptionId` / `driverSubscriptionStatus`);
- Exclusive Leads (`exclusiveSubscriptionId`);
- Video Pro (`videoProSubscriptionId`).

As a result, cancellation, expiry, failed payment, recovery, or subscription replacement can leave non-Gotham entitlement fields stale. This blocks a claim that the complete Stripe subscription lifecycle is implemented.

The cancellation/reactivation routes also need a cross-product failure-path correction. Current source still fabricates a 30-day period end for some non-Gotham products and, when Stripe configuration is unavailable, updates local cancellation flags and returns a mock-success response. The special 503 guard currently applies to real Gotham subscription IDs, not consistently to every real subscription type. A production Stripe outage must not be represented as successful cancellation/reactivation or as an invented paid-through date. Restrict mock behavior to explicit non-production test mode with `ALLOW_MOCK_PAYMENTS=true`; otherwise return a retryable service error without mutating entitlement state.

For Gotham lifecycle events, the handler retrieves live subscription state for non-deletion events and preserves the separately purchased door quantity. However, the current entitlement calculation treats only `active` and `trialing` as entitled; `invoice.payment_failed` can therefore immediately disable the subscriber flag when Stripe reports `past_due`. Define and test an explicit grace policy before adopting that behavior. Scheduled cancellation must preserve benefits through the verified current period end; only terminal expiry/cancellation should stop new reservations. Do not delete existing property records on subscription lapse.

### Next execution sequence

1. Implement a single product-aware subscription resolver keyed by the correct stored subscription ID for each product. For non-deleted events, retrieve current Stripe state to resist stale/out-of-order event delivery; for deleted events, apply terminal state only when the subscription ID still matches. Use event ordering/idempotency guards per subscription and user.
2. Define product-specific entitlement mapping and an explicit `past_due` / `unpaid` grace policy. Preserve period-end access when `cancel_at_period_end` is true and the paid-through date is still in the future.
3. Remove fabricated period-end dates and false-success Stripe-unavailable fallbacks from cancel/reactivate for all product types. Keep mock paths strictly isolated to explicit non-production test configuration.
4. Add webhook and route regression coverage for duplicate delivery, out-of-order events, cancellation scheduled/reversed, period-end deletion, invoice failure/recovery, replacement subscriptions, Stripe outage, and each product's entitlement fields.
5. Add the property API concurrency/idempotency/quota tests above, including ambiguous client retry semantics and transfer/delete accounting.
6. Run the complete CI gate on the latest integration head after all code changes; inspect each stage and release-audit warning. If a runner cannot be provisioned, record that as unverified rather than treating it as a pass.
7. Keep PR #5 draft/unmerged until its refund replay identity, financial route wiring, webhook crash/claim tests, PR #2 membership/boost safeguards, and complete path-level reconciliation are resolved.

### Safeguards reaffirmed

No changes to `main`, PR merge, AI Studio Pull/Push, production Firebase, production secrets, deployment, or AnyRoller/taxi behavior. Continue only on the existing integration branch. No test or release gate may be weakened to manufacture a green result.


## Section 62 — Subscription cancellation/reactivation fail-closed hardening (2026-11-10)

### Implementation committed

- Commit: `2768ce7b48f6358b654c240847b4297b32ee6c4b`
- Scope: `server.ts` cancellation and reactivation endpoints only.
- Both endpoints now validate `subscriptionType` against the supported product set (`tier`, `exclusive_leads`, `video_pro`, `gotham_saas`, `driver_gold`).
- Both endpoints now reject missing linked Stripe subscription IDs with HTTP 409 instead of reporting a successful local-only change.
- Stripe-unavailable fallback is restricted to IDs explicitly prefixed `mock_`, outside production, with `ALLOW_MOCK_PAYMENTS=true`. Real Stripe subscriptions receive HTTP 503 and local entitlement/cancellation fields are not mutated.
- Real subscription updates are sent to Stripe before Firestore is updated; Stripe API failures therefore do not create a false local success.
- Cancellation no longer fabricates a 30-day paid-through date for Exclusive Leads, Video Pro, Gold Driver or membership. Existing stored period-end values are retained when available; absent values remain absent until Stripe returns its authoritative period end.
- Verified from the fetched branch source after commit: no `Date.now() + 30` fabricated dates remain in either endpoint; both routes contain the explicit mock gate and the generic outage response.
- Branch remains `integration/pr-consolidation-20261109`, 177 commits ahead / 0 behind `main`. No changes to `main`.

### Verification status

- GitHub workflow-run lookup for this commit returned no PR-triggered workflow runs. That endpoint filters to PR-triggered runs, so this is **not** evidence that a push workflow did not run; equally, no successful CI run for this commit has been established.
- No test execution was performed in this checkpoint. The implementation is source-verified but remains **unverified by CI**.
- Add route-level regression tests for: missing subscription ID (each product), unsupported product, Stripe configuration outage on a real ID (must return 503 and leave Firestore untouched), explicit non-production mock ID with mock flag enabled, mock ID with mock flag disabled, Stripe update rejection (no local mutation), and returned Stripe period end persistence.
- Review whether `driver_gold` should exclusively use `driverSubscriptionId` rather than the current legacy fallback to `subscriptionId`; preserve backwards compatibility only if the data migration and product ownership semantics are confirmed.

### Remaining subscription lifecycle work

The webhook synchronizer still looks up only `gothamSubscriptionId`. Membership, Gold Driver, Exclusive Leads and Video Pro have distinct subscription ID and entitlement fields and are not yet covered by the common lifecycle handler. Do not mark subscription lifecycle reconciliation complete until each product has an authoritative subscription-to-user mapping, event idempotency/out-of-order protection, explicit entitlement/grace policy, and regression coverage. In particular, the current code has no `exclusiveSubscriptionStatus` or `videoProSubscriptionStatus` field; use the product's established entitlement fields rather than inventing a new field contract without checking all consumers.

### Next action

Build and test the product-aware Stripe lifecycle synchronizer using the established fields:
- membership: `subscriptionId`, `subscriptionStatus`, `cancelAtPeriodEnd`, `currentPeriodEnd`;
- Gold Driver: `driverSubscriptionId`, `driverSubscriptionStatus`, `isGoldDriver`, `driverCancelAtPeriodEnd`, `driverCurrentPeriodEnd`;
- Exclusive Leads: `exclusiveSubscriptionId`, `hasExclusiveAddon`, `isExclusiveActive`, `exclusiveCancelAtPeriodEnd`, `exclusiveCurrentPeriodEnd`;
- Video Pro: `videoProSubscriptionId`, `hasVerifiedVideoProSubscription`, `videoVerificationStatus`, `videoProCancelAtPeriodEnd`, `videoProCurrentPeriodEnd`;
- Gotham: retain its dedicated subscription status, entitlement and purchased door allowance fields.

For every product, retrieve current Stripe state for non-deleted events, verify the stored subscription ID still matches before applying changes, and never let an old event for a replaced subscription revoke or restore a newer subscription. Define payment-failure grace semantics before changing entitlement flags. Keep all release safeguards from Section 61.


## Section 63 — Product-aware Stripe subscription lifecycle synchronisation (2026-11-10)

### Implementation committed

- Scope: replace the Gotham-only lifecycle lookup with a product-aware resolver for membership, Gold Driver, Exclusive Leads, Video Pro and Gotham SaaS.
- Each subscription is resolved using its existing product-specific stored ID field. Duplicate user links and cross-product reuse of the same Stripe subscription ID fail closed and require manual reconciliation.
- Non-deleted subscription and invoice events retrieve the current Stripe subscription; invoice events remain triggers only and cannot grant access independently. Deleted events are treated as terminal.
- Updates run in a Firestore transaction and re-check that the stored product subscription ID still matches, preventing events for replaced subscriptions from mutating a newer subscription.
- Event-created ordering markers are stored per product, so an older delivery cannot overwrite a newer lifecycle decision.
- Established entitlement fields are synchronised for active/trialing and terminal states. Period-end and cancel-at-period-end fields are product-specific; Gotham's purchased door count is never overwritten by Stripe's aggregate line quantity.
- `past_due`, `incomplete` and `paused` update subscription metadata only; entitlement is deliberately preserved pending an approved product-specific grace policy. No grace duration or paid-through rule is invented.

### Verification and limitations

- This change is source-reviewed only at commit time; no test suite or CI result is claimed in this checkpoint.
- Required regression tests: all five product mappings; duplicate and cross-product ID collision; replaced subscription ID; duplicate and out-of-order events; active/trialing restoration; terminal deletion; scheduled cancellation retaining entitlement; invoice failure/recovery; unknown/intermediate statuses preserving entitlement; period-end persistence; Gotham door-count preservation.
- Existing webhook event-level processing marker remains in place. The per-product event timestamp guards are additional state ordering, not a substitute for a tested end-to-end webhook idempotency suite.
- Follow-up consumer review found `videoVerificationStatus` also represents an independently verified video credential (matching, recommendation and verification UI consumers). The lifecycle handler therefore changes only `hasVerifiedVideoProSubscription` on subscription transitions and deliberately leaves `videoVerificationStatus` untouched, so subscription expiry cannot erase a separately verified video credential.
- CI must run against the resulting integration head and every relevant job must be inspected. Empty status arrays or empty PR-only workflow-run lookups are not passes.

### Next action

Add focused webhook tests using the existing Stripe webhook test harness, inspect entitlement consumers for Video Pro and membership, then run the complete CI gate. Continue to preserve all main/production/AI Studio safeguards from the prior sections.


### Section 64 — Extracted subscription lifecycle mapping and regression tests

- The production webhook now calls a pure mapping function in `src/server/subscriptionLifecycle.ts`.
- Focused tests cover all five products, active and terminal entitlement changes, non-terminal status preservation, deleted events, cancellation scheduling, period-end persistence, Video Pro credential separation, and Gotham door-count non-mutation.
- Event ordering markers and Firestore server timestamps remain owned by the webhook transaction.
- Tests are authored but have not been executed in this GitHub-only workflow. Full CI remains a required release gate.

- Additional explicit regression coverage confirms that `cancel_at_period_end=true` retains active entitlement for every product until Stripe reports a terminal state.


## Section 65 — CI runner failure investigation (2026-11-10)

- The branch workflow `.github/workflows/ci.yml` is configured for both `push` and `pull_request` events on `integration/**`; CI is therefore expected to run on integration branch pushes.
- Latest head at this checkpoint: `4251a8508dcfb44d9bea54f24d131061a70e9be3`.
- GitHub Actions run: `42804116338` (run 616), event `push`, conclusion `failure`.
- Its only job, `security-and-build-gate` (job `129788795251`), completed with failure but reports `runner_id=0`, no steps, and no runner name. The job-steps endpoint is empty and the job-log download returns BlobNotFound.
- This is a runner/provisioning failure before checkout or dependency installation. It is not a test failure and does not validate any source change.
- Combined commit status remains empty; this is not a pass. The prior historical green run remains tied to its older commit only.
- Next operational action: obtain a functioning GitHub Actions runner / inspect repository Actions runner availability, then rerun the workflow. Do not change tests, weaken gates, or label the branch validated to work around this infrastructure failure.

- Consumer/checkout-path review removed the generic `currentPeriodEnd` write from Gotham lifecycle updates. Gotham now writes only `gothamCurrentPeriodEnd`, avoiding accidental overwrites of membership or other product billing dates; a regression assertion protects this boundary.


### Legacy subscription-ID resolution follow-up

- The existing cancellation/reactivation routes explicitly support legacy Gold Driver and Gotham records stored in generic `subscriptionId` alongside `subscriptionType`.
- The webhook resolver now classifies those generic IDs using that established discriminator, while preferring a dedicated product-specific ID when both are present.
- It deduplicates matches for the same user and fails closed for multiple users or multiple dedicated product links.
- Regression tests cover legacy Gold Driver/Gotham fallback, membership default, dedicated-ID precedence, duplicate-user/product collisions and no-match behavior.

- Added stale-legacy-ID protection: when a legacy generic Gold Driver/Gotham ID remains on a user record but a different dedicated product ID is present, events for the old generic ID are ignored instead of revoking or restoring the newer subscription's entitlement.


## Section 66 — Lifecycle mapping hardening and legacy subscription resolution (2026-11-10)

### Additional code review findings and changes

- Removed the generic `currentPeriodEnd` write from Gotham lifecycle patches. Gotham now updates only `gothamCurrentPeriodEnd`; this avoids overwriting a separate membership billing date. A regression assertion covers the field boundary.
- Reviewed the existing cancellation/reactivation routes and found they explicitly support legacy Gold Driver and Gotham subscription IDs stored in generic `subscriptionId` with a product discriminator.
- The webhook resolver now uses `subscriptionType` to classify legacy `driver_gold` and `gotham_saas` generic IDs, defaults other generic IDs to membership, and prefers a dedicated product-specific ID when the same subscription ID is linked through both fields.
- The resolver deduplicates a same-user generic/dedicated match, rejects cross-user and multiple-dedicated-product collisions, and ignores a legacy generic ID when a different newer dedicated Gold Driver/Gotham ID has superseded it.
- Added pure resolver regression cases for legacy Gold Driver/Gotham, membership default, dedicated-ID precedence, cross-user/product collisions, no match, and superseded legacy IDs.
- Removed an extra closing `});` in the webhook handler's product lifecycle block that was introduced during the earlier extraction. Source was refetched after the fix and the transaction now closes once.

### Current branch and CI status

- Branch: `integration/pr-consolidation-20261109`.
- Latest observed branch head: `0766879fc13873fd73c960a840173c0a74866ff6`; comparison: 200 commits ahead / 0 behind `main`.
- Latest push workflow run observed: `42804864272` (run 628), failed. Recent consecutive runs 621–628 also failed.
- The prior run investigation established the common failure mode: runner ID 0, no runner name, no steps, and no downloadable job logs. The repeated failures are consistent with runner provisioning/billing being unavailable, not a code-level test result.
- No tests have been executed successfully on this head. The pure mapping and resolver tests are committed but remain unexecuted until GitHub Actions can provision a runner.
- `main` remains unchanged; no deployment or production mutation was performed.

### Next actions

1. Once Actions runner capacity is restored, rerun the complete `security-and-build-gate` and inspect every step/result.
2. Add/execute an end-to-end webhook test harness for the product resolver, duplicate event claim, replaced IDs, same-second event ordering, invoice-triggered refresh, and terminal deletion.
3. Continue the outstanding reconciliation sections for Gotham quota concurrency/idempotency, PR #2 membership/boost/refund/webhook safeguards, PR #5 reconciliation, and Stripe product lifecycle/grace policy.
4. Do not merge, deploy, sync AI Studio, or weaken release gates before all required tests and audits pass.

- Invoice subscription ID extraction now accepts both legacy string and expanded-object forms from `invoice.subscription` and the newer `parent.subscription_details.subscription` path. It no longer stringifies an expanded Stripe object to `[object Object]`. Five focused regression cases cover these forms and missing subscription data.

- Hardened the pure mapper so an explicit `customer.subscription.deleted` event always wins over any inconsistent payload status: it records `canceled` and revokes entitlement even if the payload unexpectedly says `active`. A focused regression test protects this invariant.


## Section 67 — Invoice reference and terminal-event hardening (2026-11-10)

- Normalized Stripe invoice subscription references through `extractInvoiceSubscriptionId`, accepting:
  - legacy `invoice.subscription` string IDs;
  - expanded `invoice.subscription` objects with an `id`;
  - current `invoice.parent.subscription_details.subscription` string or expanded-object forms.
- This avoids coercing an expanded Stripe object into the invalid identifier `[object Object]`. Missing subscription references safely produce an empty string and skip product synchronisation.
- Explicit subscription-deleted events now override any inconsistent payload status: the mapper records `canceled` and revokes the product entitlement even if the payload status were unexpectedly `active`.
- Added five invoice-reference tests and one explicit deleted-event precedence test. The lifecycle suite now contains 23 test cases/parameterized cases as authored; none have run successfully yet.
- Source refetch confirms the webhook uses the invoice normalizer, uses both pure lifecycle helpers, and has exactly one closing transaction callback in the lifecycle block.
- Latest branch head: `7733f1e0fbf909afe0712b3ac868c8abb0c0a9b3`; comparison: 209 ahead / 0 behind `main`.
- Latest push workflow run `42805244370` (run 637) failed with runner ID 0, blank runner name and no steps. This continues the Actions runner/billing provisioning failure; no source-level CI result is available.
- `main` remains untouched. No production changes, deployment, or AI Studio synchronisation.

### Next

- Continue auditing subscription lifecycle mapping and the remaining reconciliation items while Actions capacity is unavailable.
- Once GitHub billing/runner provisioning is restored, rerun and inspect the complete release gate; do not infer correctness from the authored tests or runner failures.


## Section 68 — Mock subscription ID fail-closed guard (2026-11-10)

- Reviewed both subscription cancellation and reactivation routes. Previously, a `mock_` subscription ID with mock mode disabled could fall through to a real Stripe API call if Stripe happened to be configured.
- Added shared helpers in `src/server/stripeSubscriptionGuards.ts` to identify mock IDs and permit them only when `NODE_ENV !== "production"` and `ALLOW_MOCK_PAYMENTS === "true"`.
- Both cancellation and reactivation now reject a mock ID with HTTP 409 before calling Stripe or mutating Firestore unless the explicit non-production opt-in is active.
- Added focused tests for mock ID recognition, explicit opt-in, production rejection, missing/false opt-in, and real Stripe IDs.
- Refetched `server.ts` after the second route edit: both routes use the shared guard (2 occurrences), there are no remaining inline `startsWith("mock_")` gates, and both reject invalid mock IDs before Stripe interaction.
- Tests remain authored but unexecuted because Actions runner provisioning is still failing. Do not treat the guard or the wider branch as CI-validated.


## Section 69 — Product-scoped cancellation and initial subscription sync (2026-11-10)

- Added `getSubscriptionIdForProduct` so cancellation/reactivation select the dedicated ID for each product. Legacy generic IDs are accepted for Gold Driver/Gotham only when the profile's `subscriptionType` explicitly matches; this prevents accidentally sending a membership ID to Stripe for a product cancellation.
- Gold Driver and Gotham cancellation now update only `driverCancelAtPeriodEnd` / `driverCurrentPeriodEnd` and `gothamCancelAtPeriodEnd` / `gothamCurrentPeriodEnd`. They no longer overwrite the generic membership cancellation flag or period end.
- Gold Driver and Gotham UI now read their product-specific cancellation flags. Gold Driver date display no longer falls back to the generic membership period end.
- Cancellation response payloads continue to return the product-specific period end for all supported products.
- Added product-ID selection tests for dedicated IDs, legacy discriminator fallback, and preventing a membership ID from being used for another product.
- Added `customer.subscription.created` to the webhook lifecycle event set (alongside updated/deleted and invoice paid/failed events) so a linked subscription can initialise product-specific status and period-end fields from Stripe's live state. Event selection is covered by focused positive/negative tests.
- Latest observed branch head: `bed8f668d0a717eec948782394f48ba9f828e4ee`; comparison: 224 ahead / 0 behind `main`.
- Latest push workflow run `42806129244` (run 652) failed with runner ID 0, blank runner name and no steps. CI remains blocked by runner provisioning/billing; none of the newly authored tests have run.
- `main` remains unchanged. No deployment, production data change, or AI Studio synchronisation.


## Section 70 — Development mock checkout isolation (2026-11-10)

- The Stripe-unconfigured development checkout fallback previously wrote Gold Driver and Gotham mock subscriptions into generic membership fields (`subscriptionId`, `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`). This could overwrite an existing membership subscription and made Gotham quota checks miss the mock subscription's dedicated ID.
- The fallback now writes only product-specific records: Gold Driver uses `driverSubscriptionId`, `driverSubscriptionStatus`, `driverCurrentPeriodEnd`, and `driverCancelAtPeriodEnd`; Gotham uses the corresponding `gotham*` fields including `gothamSubscriptionId`, which the property quota verifier requires.
- Combined with the prior cancellation changes, the mock fallback no longer clears or overwrites generic membership cancellation or period-end fields for these products.
- Added a regression case asserting a dedicated Gotham ID takes precedence when a different membership ID exists.
- Latest observed branch head at code review: `a7019e16352abba399ea2832fedcaa452a917894`; branch was 227 ahead / 0 behind `main` before this documentation update. No changes to `main`.
- CI remains blocked: the latest observed push run `42806318058` (run 654) failed. Previous runs continue to fail before steps with runner ID 0; no code test result is available.


## Section 71 — Property-create retry idempotency (2026-11-10)

- Reviewed `createPropertyViaCommand` against the server's `property_creation_requests` idempotency record.
- The client previously generated a fresh UUID for every invocation. A retry after a timeout or lost response therefore used a new key and could create a second property even if the first server transaction had committed.
- The client now keeps the pending key per authenticated user and serialized payload until a successful response, reusing it after network/HTTP failures. It clears the pending key after success so a later intentional create of the same property payload starts a new operation.
- Callers may supply a stable key explicitly; malformed supplied keys are rejected before the request.
- Added focused tests for network retry key reuse, new key after success, caller-supplied key, and malformed key rejection. These tests are authored but remain unexecuted pending GitHub Actions runner restoration.
- The server's transaction-level request record remains the authority; client-side key reuse is an additional retry guarantee, not a replacement for server idempotency.


## Section 72 — Property command idempotency implementation and review (2026-11-10)

- The property API's server transaction already atomically reads/writes the per-user `property_creation_requests` record alongside property creation and quota increments. It returns the existing property ID for duplicate keys.
- The client previously generated a new UUID on every invocation, defeating that server protection for retries after a network timeout or lost response.
- `createPropertyViaCommand` now retains a pending key for the authenticated user + serialized payload until success, reuses it after a failed/ambiguous request, and clears it after a successful response. It also accepts an optional caller-supplied key and validates it against the server's 12–100 character safe-key format.
- Added tests for network-failure retry reuse, new key after success, supplied key, and malformed supplied key.
- Source review confirms the server transaction still creates the property and idempotency record atomically, with the quota counter in the same transaction. No changes were made to weaken the server-side guard.
- Latest branch head before this documentation update: `d678281e7d2434cf8517361209e611b4be81ebdd`; comparison: 231 ahead / 0 behind `main`.
- Latest push runs remain failing before steps due runner ID 0 / no runner. The new property tests are authored but unexecuted.


## Section 73 — Gotham property quota decision extraction (2026-11-10)

- Extracted the purchased-door allowance decision into `src/server/gothamPropertyQuota.ts` and wired the production `POST /api/properties` transaction to use its result before writing the incremented usage count.
- The pure decision rejects negative, non-integer, or unsafe usage counters; rejects invalid/zero allowances for entitled Gotham accounts; blocks when current usage is already at the purchased allowance; and allows a non-Gotham owner with an existing historical usage counter to keep that counter accurate without enforcing a lapsed allowance.
- The transaction still owns the atomic Firestore read/check/write. The helper does not replace or weaken transaction serialization.
- Added focused boundary tests for below-limit, exact allowance, limit reached, invalid allowance, invalid usage, and historical counter maintenance.
- Source refetch confirms the route imports and calls the helper and writes `quotaDecision.nextUsage` in the same transaction as the property and idempotency record.
- Latest observed branch head: `950bdac143fd98cd3f52191e7a16f92845a473d2`; comparison: 235 ahead / 0 behind `main`.
- Latest push workflow run `42806902691` (run 663) failed before any steps (runner provisioning failure); tests remain unexecuted.


## Section 74 — Gotham quota decrement invariants (2026-11-10)

- Extracted the shared decrement guard into `decrementGothamPropertyUsage`.
- The property-delete transaction and ownership-transfer transaction now use the same tested decrement decision instead of duplicating counter validation and underflow checks.
- Invalid, negative, fractional counters are rejected; zero is rejected as an underflow/inconsistent counter; positive safe integers decrement exactly once.
- Added three focused decrement tests. The create, delete and transfer Firestore transactions still own the counter reads/writes and remain atomic.
- Refetched source confirms both delete and transfer paths call the helper.
- Latest branch head: `f1bbdcec72c515878b52fc8f96a3f94d86b2faef`; comparison: 239 ahead / 0 behind `main`.
- Latest push run `42807065937` (run 667) failed before test steps because the Actions runner is unavailable (runner ID 0). No test execution is claimed.


## Section 75 — Shared quota decision on ownership transfer

- The property-claim transfer transaction now calls the same `evaluateGothamPropertyQuota` decision as property creation when calculating the new owner's next usage count.
- This removes the transfer path's separate allowance/counter validation logic and ensures invalid usage, invalid allowance, exact-limit and limit-reached outcomes match property creation.
- The transfer transaction stores the helper's `nextUsage` directly, alongside ownership changes, previous-owner decrement, and the transfer-claim idempotency record.
- Existing previous-owner decrement remains guarded by `decrementGothamPropertyUsage`.
- Source refetch confirms the old independent `newCount >= allowance` branch is gone and the shared decision is used before ownership is committed.
- Latest branch head: `c096bdec76f2e1ac6dc2b219d966c61dc0f445d0`; comparison: 241 ahead / 0 behind `main`.
- Latest push run `42807188031` (run 669) failed before steps with the same runner provisioning failure. No tests are claimed to have executed.


## Section 76 — Stripe webhook claim/recovery decision coverage

- Extracted the event-claim decision into `src/server/stripeWebhookIdempotency.ts`; the production webhook still performs the claim in its Firestore transaction and now delegates the completed/recent-processing/stale-processing/failed decision to the pure helper.
- Existing behavior is preserved: completed events are not reclaimed; recent processing claims are not stolen; processing claims at least five minutes old can be recovered; failed/unknown records can retry; a processing record without a timestamp is treated as fresh.
- Added six focused tests for those states. The helper does not replace the Firestore transaction or claim record.
- Source refetch confirms the webhook invokes the helper inside the transaction before writing the processing claim.
- Latest branch head: `0eceba1ca377c3b097f1c47d8895d60b4f6c52c3`; comparison: 246 ahead / 0 behind `main`.
- Latest push run `42807383747` (run 674) failed before any steps with runner ID 0. No test result is available.


## Section 74 — Invoice entitlement after terminal membership events (2026-11-10)

- Cross-checked the Stripe lifecycle patch against `src/services/invoiceService.ts`. The invoice eligibility function also treated the stored tier label (`tierId` / `tier`) as sufficient Pro entitlement, even after a terminal membership webhook had set `subscriptionStatus` to `canceled`, `unpaid`, or `incomplete_expired` and cleared the invoice flags.
- Updated the invoice eligibility check so an explicitly Stripe-managed membership (`subscriptionType === "tier"`) cannot retain Pro invoice access solely from a stale tier label after a terminal status.
- Kept non-terminal states unchanged (including `past_due`, `incomplete`, and `paused`) pending the product grace policy, and kept independent Video Pro entitlement as a separate route to invoice eligibility.
- Added focused tests for all three terminal statuses, non-terminal preservation, independent Video Pro access, and legacy tier-only profiles.
- The new tests are authored but unexecuted because the current GitHub Actions runs fail before runner steps start.


## Section 75 — Firestore property-transfer metadata boundary (2026-11-10)

- The property owner update rule blocked direct ownership changes but left transfer workflow metadata writable by the owner. A client could set fields such as `transferStatus`, `transferCode`, or `pendingTransferToUid` without using the server's transfer-code generation and validation route.
- Tightened the owner-update protected-key list to include ownership identity, homeowner identity, transfer target/status/code/expiry/email/history/claim timestamps, previous-owner count, and verification state. Admin update permissions and ordinary owner-editable property fields remain unchanged.
- Added emulator security-rule regression coverage for attempts to forge each important transfer field and a positive assertion that an owner can still update a normal property name.
- The existing security workflow includes `firebaseEmulatorSecurityRules.test.ts`; this regression is part of that existing suite. It is still unexecuted because the GitHub Actions runner is not provisioning.


## Section 77 — Server-authoritative property transfer initiation and revocation (2026-11-10)

- Review of the Firestore transfer-metadata restriction found that `TransferOwnershipModal` still wrote transfer initiation and revocation fields directly with client-side `updateDoc`. The restriction correctly blocked this, but it also meant the user-facing transfer workflow would fail.
- Added authenticated server commands `POST /api/properties/:id/transfer` and `POST /api/properties/:id/transfer/revoke`. Both use Firestore transactions, require the canonical current owner, and fail closed for missing properties, non-owners, invalid validity windows, malformed buyer emails, and revocation without a pending transfer.
- Transfer codes are now generated server-side using cryptographic randomness; expiry is calculated server-side and limited to the existing 14/30/60-day choices. The server checks for an active code collision before committing the transfer metadata.
- Updated `TransferOwnershipModal` to use the authenticated command service rather than writing protected fields directly. The claim/verification flow remains on the existing public verification and authenticated claim endpoints.
- Extended the protected Firestore metadata set to include recipient name, initiation timestamp, and initiating UID, and added emulator assertions that owners cannot forge these values.
- Added service-level tests for authenticated initiation, server-side authorization error propagation, and revocation.
- Source refetch confirms the modal no longer imports Firestore `updateDoc`; transfer initiation/revocation now use the API command service. Tests remain unexecuted pending Actions runner restoration.
- Before the documentation update, the branch was 261 ahead / 0 behind `main`, at `51004ab7c264c1e66ee1cfe08a707e2b9e0d022a`. `main` remains unchanged.


## Section 78 — Reject ambiguous Stripe subscription product aliases (2026-11-10)

- During webhook lifecycle review, found that product resolution preferred a dedicated product ID whenever present, even if the same Stripe subscription ID was also linked to the generic membership field on the same user with a conflicting membership discriminator.
- This could silently classify a membership subscription event as Gold Driver/Gotham (or vice versa) if Firestore contained a cross-product duplicate ID. Resolution now fails closed when the generic field's legacy discriminator does not correspond to the dedicated product field.
- A matching legacy Gold Driver/Gotham alias plus its dedicated product field remains accepted; multiple dedicated product links and cross-user links remain rejected.
- Added regression tests for conflicting membership/dedicated mapping and valid matching legacy alias.
- Tests are authored but unexecuted while Actions runner provisioning remains unavailable.


## Section 79 — Profile billing commands and homeowner subscription lifecycle (2026-11-10)

- Found that the Profile paid-checkout request omitted the Firebase bearer token required by `requireAuth`; it now obtains an ID token and sends the Authorization header.
- Profile cancellation previously wrote `cancelAtPeriodEnd` / `homeownerCancelAtPeriodEnd` directly to Firestore, which the user rules correctly reject. It now calls the authenticated `/api/cancel-subscription` command and reports server errors.
- Profile free-tier selection also wrote protected entitlement fields directly. Added `POST /api/select-free-tier`: only the free Standard Homeowner or Free Explorer/PAYG selection is accepted for the corresponding account role, dynamic homeowner pricing must confirm £0, and an existing non-terminal paid subscription must be cancelled before downgrade. Entitlement writes happen server-side in a transaction.
- Added explicit landlord subscription lifecycle mapping. The existing checkout resolver identifies the paid homeowner plan as `subscriptionType: landlord`; webhook updates now write `homeownerSubscriptionStatus`, `homeownerCancelAtPeriodEnd`, and `homeownerCurrentPeriodEnd` instead of incorrectly changing trader membership fields. Product-ID selection, cancellation and reactivation now support the landlord discriminator.
- Added lifecycle and subscription-ID guard regression coverage for landlord mapping, terminal/grace states, and ID selection.
- Latest observed branch head before this documentation update: `12e876e3b5c1b0a79665c86b198166e4bdc4bacf`; comparison: 279 ahead / 0 behind `main`. No merge or production changes.
- Latest Actions runs continue to fail before any steps start because runner ID is 0 and no runner is assigned. All new tests remain unexecuted.


## Section 80 — Landlord checkout fulfillment uses homeowner-specific fields (2026-11-10)

- A second pass through `checkout.session.completed` found that paid Landlord checkout fulfillment still wrote generic trader membership fields (`subscriptionStatus`, `tierId`, `isPro`, `isProInvoiceSubscriber`) and omitted the homeowner period end/status fields.
- This was inconsistent with the Profile UI and the new landlord webhook/cancellation mapping. If `customer.subscription.created` arrived before the checkout completion event, it could not resolve the user yet; checkout completion therefore must initialise the homeowner subscription state itself.
- Added and tested `buildLandlordCheckoutFulfillmentPatch`. Live checkout completion retrieves the Stripe subscription's current state and commits `subscriptionId`, `subscriptionType: landlord`, `isLandlord`, `homeownerTierId`, `homeownerSubscriptionStatus`, `homeownerCancelAtPeriodEnd`, and `homeownerCurrentPeriodEnd` without setting trader Pro entitlements.
- Explicit development mock fulfillment now uses the same homeowner-specific mapping.
- Membership checkout conflict checks now consider the current product's own status fields, preventing an active Landlord or trader subscription from being silently replaced by a different membership checkout.
- Source refetch confirms the live and mock fulfillment paths call the helper. Regression tests cover the resulting field mapping. CI is still unexecuted due the Actions runner provisioning failure.
- Before this documentation update the branch was 284 ahead / 0 behind `main`, at `1932285359ad46e90158119212dd06a09fc15f19`. `main` remains untouched.


## Section 81 — Authenticate all Profile, billing and job checkout callers (2026-11-10)

- A repository-wide audit of `POST /api/create-checkout-session` found several additional active callers that omitted the Firebase bearer token required by the server's `requireAuth` middleware.
- Added authenticated ID-token headers to the landlord upgrade in `Portfolio.tsx`, Exclusive Leads checkout in `TradesDashboard.tsx`, milestone funding, mediation stake and emergency boost checkout in `JobDetails.tsx`, job-post boost checkout in `PostJobWizard.tsx`, and emergency boost checkout in `EmergencyJobWizard.tsx`.
- The Profile membership flow was already corrected in Section 79. BillingManager, TradesBannerAdStudio, TraderVideoVerificationCard and GothamHousingPortal already attach bearer tokens.
- All discovered checkout callers now provide an Authorization bearer header; the server continues deriving the user identity from the verified token, not the request body.
- Latest observed branch comparison before this documentation update: 290 ahead / 0 behind `main`, at `272ed836922dc39ff0d69505c307b0656ed6bc5a`. No production or main-branch changes.
- GitHub Actions still fails before steps start due runner provisioning (runner ID 0); tests remain unexecuted.


## Section 82 — Canonical homeowner tier identifier in landlord fulfillment (2026-11-10)

- Verified the Profile plan selector compares `homeownerTierId` to the configured tier key (for example, `landlord`), not to the marketing label used in some checkout entry points (for example, `Premium Landlord`).
- Normalised landlord checkout fulfillment to persist the canonical `homeownerTierId: landlord` regardless of which UI label initiated checkout. This keeps the selected plan highlighted consistently after checkout.
- Updated the pure fulfillment helper, its regression test and both live/mock checkout call sites.


## Section 83 — Complete Stripe checkout intent/session binding (2026-11-10)

- The webhook required `checkoutSessionId` and `currency` on the pre-checkout intent, but the checkout route had only created the intent with user, mode, amount and metadata. It never persisted the returned Stripe Checkout Session ID, currency, PaymentIntent ID or a `session_created` state. This made the strict webhook binding reject valid sessions.
- After Stripe creates a Checkout Session, the route now persists its exact session ID, currency, PaymentIntent ID (when present), and `session_created` status to the matching server-created intent before returning the redirect URL.
- Extracted the binding decision into `src/server/checkoutIntentIntegrity.ts`. Exact matches are accepted; mismatches are marked for review; a webhook arriving while the intent is still pending and has no session ID is treated as retryable rather than permanently marked as a mismatch.
- Added tests for exact matches, currency casing, expanded PaymentIntent objects, early webhook arrival, and mismatched user/session/mode/amount/currency/payment intent/status.
- Source refetch confirms both checkout-session persistence and webhook use of the shared binding helper. Tests remain unexecuted while GitHub Actions runner provisioning is unavailable.
- Before this documentation update the branch was 298 ahead / 0 behind `main`, at `458bc1a33ff54af7a77363498d7a22447da82a8c`. `main` remains unchanged.


## Section 84 — Firestore invitation and property-rule reconciliation (2026-11-10)

### Refs and scope checked

- Compared `firestore.rules` on `main` with the current `integration/pr-consolidation-20261109` ref using GitHub file contents and a line-level diff.
- Main rules blob: `1047baad36aa1ccceb0b4bc4e7e693fb0ec3a5f6` (1,608 lines).
- Integration rules blob: `0d1139b17382491e47d7f0151fd41187978abedb` (1,650 lines).
- The branch comparison currently reports integration **301 commits ahead / 0 behind** main. This is a live comparison at this review, replacing older historical counts in earlier sections.
- Integration security regression file: `tests/unit/firebaseEmulatorSecurityRules.test.ts`, blob `2ff5b2c066066ad3528a1e7d978c3651e6656024`.

### Invitation rule decision matrix

| Capability | main | integration | Review decision |
|---|---|---|---|
| Recipient direct get | Verified-email comparison, including case variants; missing-document reads are also allowed by a broad `resource == null` clause | Requires a real document and verified recipient email match (case-insensitive), or inviter/admin | Retain integration |
| Recipient list | Combined get/list expression; broad missing-resource clause | Separate list predicate requiring exact email equality for query provability, or inviter/admin | Retain integration; keep client query equality aligned |
| Recipient acceptance | Any update permitted to a verified matching recipient | Only verified matching recipient can transition pending → accepted, set `acceptedAt == request.time`, and change only `status` and `acceptedAt` | Retain integration |
| Inviter management | Inviter may update; create/delete limited by existing checks | Inviter retains read/list and management; admin retains full access | Retain integration pending full product-flow regression |
| Admin management | Admin access retained | Admin access retained | Preserve |
| Unrelated / unverified recipient | Main blocks unverified email but has broader missing-resource behavior | Unverified and unrelated recipient denied; missing direct get denied | Retain integration |

**Security conclusion:** the integration invitation block is materially safer than main. In particular, main permits a verified recipient to update arbitrary invitation fields, whereas integration restricts recipient updates to the intended pending-to-accepted transition and prevents changing email, inviter, permissions or other fields. The integration also removes the broad missing-document read allowance. Do not revert this block to the main version.

### Emulator coverage inspected

Test 94, “PL-08: Invitations - verified recipients can only accept their own pending invitation”, is present in the integration security suite. Source review confirms it covers:
- unverified recipient direct get, recipient list query and acceptance update denied;
- verified recipient direct get and exact-equality pending list query allowed;
- missing invitation direct get denied;
- unrelated verified recipient denied;
- inviter direct read and cancellation update allowed;
- admin direct read and management update allowed;
- intended pending → accepted update with server timestamp allowed;
- recipient attempts to alter email, inviter or extra fields denied.

The test is authored in the integration branch. This review did not execute the Firebase emulator suite; do not describe the rule change as runtime-validated solely from source inspection.

### Compatibility / test gaps retained for follow-up

1. The test reads a legacy invitation whose stored email has mixed case, but it does not test listing or accepting that same mixed-case record. The client onboarding query lowercases the user's email and uses exact equality; new BusinessTeamManagement invitations are also stored lowercased. Legacy mixed-case records may therefore be readable by direct get but not discoverable/acceptable through the normal list/accept path. Decide whether a one-time data normalization is needed; do not perform a live data migration as part of this repository audit.
2. The inviter positive test covers direct get and cancellation update but not the actual `where('invitedBy', '==', uid), where('status', '==', 'pending')` list query used by BusinessTeamManagement. Add a positive emulator list assertion before final security sign-off.
3. The admin positive test covers direct get and update but not admin collection listing. Add a positive admin list assertion if that is an intended UI/API use case.
4. The integration file defines `isVerifiedInvitationRecipientForAcceptance()`, but the acceptance rule currently repeats the predicate inline. This is redundant, not a reason to weaken the rule; either use the helper consistently or remove it in a reviewed cleanup.
5. The onboarding client reads invitations by lowercased email and then accepts by updating only `status` and `acceptedAt`. That matches the intended integration recipient rule for normalized new invitations. Preserve this flow and test the end-to-end query/update behavior.

### Other Firestore rule deltas in this comparison

- Property creation and deletion are now server-only (`allow create: if false`, `allow delete: if false`) so quota counters and transfer/accounting state are changed atomically by authenticated server commands.
- Owner updates now protect the complete ownership-transfer metadata set, including recipient/initiator metadata and transfer code/status/expiry/history/claim fields. The earlier client-side transfer path was moved to authenticated server commands (see Sections 75–77); do not restore direct client writes.
- These property restrictions are intended changes and must remain paired with the server command paths and their regression tests. A rules-only change without those callers would break legitimate user workflows.

### Decision and next work

- **Accept integration Firestore rules as the candidate baseline; do not copy main or ZIP rules over them.**
- Preserve the existing AI Studio PL-01–PL-15 protections and the integration's stricter invitation and property-transfer controls.
- Add the missing inviter/admin list assertions and mixed-case legacy-invitation behavior test to the emulator suite, then run the complete emulator/security gate when CI runner provisioning is available.
- Continue the broader full ZIP path/hash manifest and AI Studio/Firebase pre-change verification. No application code, Firebase live rules, production data, main branch, or AI Studio workspace was changed during this read-only review.


## Section 85 — Branch and overlapping PR recheck after security checkpoint (2026-11-10)

- Section 84 was committed to the existing integration branch as commit `fffb187900376a11945b1817a1371e1fedb5295c`; the file was refetched and the complete section was verified present.
- Recomparison after that commit reports integration **302 commits ahead / 0 behind** `main`. The earlier 301 count in Section 84 was the immediately pre-checkpoint comparison; this 302 count is the current post-commit observation.
- PR #5 remains open, draft and unmerged. Its source branch `fix/pr2-mediation-stake-idempotency` is now **102 commits ahead / 276 behind** integration (diverged; 24 changed paths). Do not merge, rebase or cherry-pick wholesale.
- PR #2 remains open, draft and unmerged. Its source branch `fix/anytrader-payment-metadata-authority` is **20 commits ahead / 302 behind** integration (diverged; 4 changed paths). Do not merge, rebase or cherry-pick wholesale.
- The two PRs overlap on `server.ts` and `src/server/pricingCatalog.ts` (and PR #5's larger payment/test surface); treat them as separate stale candidates and inspect exact patches against current integration before any selective recovery.
- `main` remains unchanged. No application-code, production Firebase, live data or AI Studio changes were made in this checkpoint.
- Next safe work remains: finish the full ZIP-to-integration differing-path manifest and AI Studio/Firebase pre-change verification; then address the small, explicit invitation emulator test gaps from Section 84. Do not start PR integration until the per-path decision matrix and tests are reviewed.


## Section 86 — AI Studio ZIP access and financial-source baseline comparison (2026-11-10)

- The Library contains two AnyTrader full-code ZIPs. The newest available is `anytrader (Full Code Backup)_112216(1).zip`, created **2026-11-09 01:33:29 UTC**, size **23,607,762 bytes**. The 2026-11-08 backup is older. The 2026-11-09 archive was materialized and inspected; ZIP integrity check passed (705 entries, no corrupt member). No re-upload is needed at this checkpoint.
- Snapshot provenance limitation: this is the newest ZIP available in Library, but its timestamp alone does not prove it is the current live AI Studio workspace. Treat it as the latest *available snapshot*, not as an independently verified live workspace export.
- Git blob comparison for selected financial files against integration:
  - `src/server/paymentLedger.ts`: ZIP blob `fc99e5652b9b2e7993f04bec5224d85ef8737b49` = integration blob; exact match.
  - `src/services/stripeIntegrationService.ts`: ZIP blob `2f1e869aa7a5e94d8a46f1101890defc6a70c64d` = integration blob; exact match.
  - `src/server/driverPayoutOrchestration.ts`: ZIP blob `903c950f480a16923d04ac900da061448245a8e7` differs from integration blob `6091e4a183caca9a30af16e12aae0472aecdf122`; this file requires focused diff review before any change.
- This is a targeted baseline comparison, **not** the complete 705-entry ZIP-to-integration manifest. No application code, live Firebase state, production financial data, main branch or AI Studio workspace was changed.
- Next: enumerate ZIP paths and compare the remaining payment/webhook/refund/escrow sources and tests against integration; review the payout orchestration difference; complete AI Studio/Firebase pre-change gate; then proceed to read-only reconciliation audit and approved remediation/test work.


## Section 87 — Expanded financial path comparison (2026-11-10)

The 2026-11-09 ZIP integrity check passed (705 archive entries). Git blob SHA comparison was expanded from the three baseline files to the following financial paths:

| Path | ZIP blob SHA | Integration blob SHA | Decision |
|---|---|---|---|
| `src/server/paymentLedger.ts` | `fc99e5652b9b2e7993f04bec5224d85ef8737b49` | `fc99e5652b9b2e7993f04bec5224d85ef8737b49` | Exact match |
| `src/services/stripeIntegrationService.ts` | `2f1e869aa7a5e94d8a46f1101890defc6a70c64d` | `2f1e869aa7a5e94d8a46f1101890defc6a70c64d` | Exact match |
| `src/server/paymentVerification.ts` | `097883adb5c3356820b32ca8ed6fdd5a94c24b00` | `097883adb5c3356820b32ca8ed6fdd5a94c24b00` | Exact match |
| `src/server/tripPaymentAuthorization.ts` | `979287a17a7537362fc9b59a8d7f2535f02f9292` | `979287a17a7537362fc9b59a8d7f2535f02f9292` | Exact match |
| `tests/unit/paymentLedger.test.ts` | `ba4067ddf0a7d42072c55ca65ddd7ae2d63817d6` | `ba4067ddf0a7d42072c55ca65ddd7ae2d63817d6` | Exact match |
| `tests/unit/escrowReleaseIntegrity.test.ts` | `25742240b3ecd973eea92aa5827754e3ccf8c778` | `25742240b3ecd973eea92aa5827754e3ccf8c778` | Exact match |
| `src/server/driverPayoutOrchestration.ts` | `903c950f480a16923d04ac900da061448245a8e7` | `6091e4a183caca9a30af16e12aae0472aecdf122` | Divergent; retain integration pending line-level review |
| `tests/unit/driverPayoutOrchestration.test.ts` | `a9cbaa10345a97f9e3df15f3a05a0dfa4cca8351` | `bacda2c0389429f8b9c3e13bbb10caadf350d449` | Divergent; compare coverage before any recovery |
| `server.ts` | `0e935945b0cb7a3e6009030884aa620cc5dba175` | `99512448b790c65a2cc1f64e26fa0d30a72cca7d` | Divergent; broad server file requires focused webhook/financial route diff |

**Interim decision:** ZIP and integration agree byte-for-byte on ledger engine, Stripe integration service, payment verification/authorization, and ledger/escrow integrity tests. Keep integration's payout orchestration and tests as baseline; do not copy ZIP versions. `server.ts` is also divergent (ZIP 271,222 bytes vs integration 317,000 bytes), so inspect only bounded webhook/refund/escrow route regions and preserve unrelated integration changes. No test suite was executed in this read-only pass; no CI run was associated with documentation commit `f5e99fe0e9e3bd346dc7b7a783d3c40f64008932`. No application or production state was changed.

Next: complete bounded diff review for payout orchestration, its tests, and Stripe webhook/refund/escrow handlers; finish the 705-entry path manifest; then verify AI Studio/Firebase pre-change gates and run targeted tests before any implementation patch.


## Section 88 — Focused server financial-path inspection (2026-11-10)

### Stripe webhook claim/finalization

- `server.ts` integration SHA `99512448b790c65a2cc1f64e26fa0d30a72cca7d` differs from ZIP SHA `0e935945b0cb7a3e6009030884aa620cc5dba175`. The integration webhook at `POST /api/webhook` verifies Stripe signatures and transactionally claims `processed_stripe_events/{event.id}` using `shouldClaimStripeWebhookEvent`; it writes `status: processing`, `claimedAt`, and a generated `workerId`. A duplicate/current processing event returns 200.
- Inspection found no event-specific worker/claim token carried into fulfillment or guarded finalization in the reviewed handler region. Checkout fulfillment writes and final processed/failed status paths therefore need a stale-worker fencing review (FIN-01); do not treat lease claim alone as a fence.
- The currently visible event branches are `checkout.session.completed` and `customer.subscription.deleted`; no `charge.refunded` event branch was found in integration `server.ts`. Refund reconciliation remains an explicit audit/remediation item and must locate the actual refund ingestion path before implementation.

### Escrow release rollback

- In the escrow release failure branch, the milestone is reverted to `funded`, `releaseStatus: failed`, and `lastTransferError` is stored; the branch also explicitly sets `releaseOperationId: null` (“Clear operation ID so it can be retried safely!”). The ledger row is marked failed afterward.
- This destroys stable operation identity when Stripe's outcome is ambiguous. Keep FIN-03 open: persist/reuse a stable release operation/idempotency key and reconcile the Stripe transfer before retry. Do not patch by simply removing the reset without analyzing the command's retry and ledger semantics.

### CI and safety status

- No PR-triggered workflow run was returned for documentation commit `f5e99fe0e9e3bd346dc7b7a783d3c40f64008932`; this docs-only commit is not evidence of a green application test suite. No local emulator/test execution was performed in this pass.
- Integration is now **305 commits ahead / 0 behind** main after the plan-only commits. Main remains untouched; no AI Studio, Firebase live rules, production records, or money movement was changed.

Next: inspect `PaymentLedgerEngine.executeIdempotentOperation` binding semantics and escrow transfer Stripe idempotency/reconciliation; identify refund source and all webhook finalization writes; line-review ZIP payout/test deltas; finish whole-archive path manifest. Tests and AI Studio/Firebase pre-change gate remain required before implementation.


## Section 89 — Idempotency binding audit (FIN-04) (2026-11-10)

Read-only inspection of `PaymentLedgerEngine.executeIdempotentOperation` confirms:

- The `payment_idempotency/{idempotencyKey}` record stores `operationName`, status, timestamps and serialized response, but **does not bind the key to a canonical owner/resource/payload fingerprint**.
- If a record is already `completed`, the method returns its stored response as a replay without validating that the new caller's operation name or inputs match the original request. `operationName` is logged/stored but not compared.
- Stale `in_progress` claims (older than five minutes) are replaced, and executor side effects run outside the claim transaction. Completion is an unconditional document update; this creates a second stale-worker/fencing concern if a prior executor is still alive after takeover.
- Failure deletes/releases the idempotency record, which can be unsafe after an ambiguous external side effect unless the operation itself is independently reconciled/idempotent.

**FIN-04 confirmed at source level; FIN-01 pattern also applies here.** Proposed safe remediation: persist a canonical binding (operation, tenant/owner, resource IDs, normalized payload hash), reject key reuse on any binding mismatch, and claim with a unique generation/token; finalize only transactionally if that generation remains current. Define recovery behavior for ambiguous side effects before changing the current delete-on-failure behavior. Add replay-same-input, key-different-resource, key-different-payload, operation mismatch, concurrent claimant, stale takeover/old worker completion, and ambiguous external outcome tests. No code/test changes made in this audit.


## Section 90 — Escrow Stripe transfer idempotency review (FIN-03) (2026-11-10)

- `PaymentLedgerEngine.executeStripeEscrowTransfer` derives Stripe's request key as `release:{jobId}:{quoteId}:{milestoneId-or-0}:{idempotencyKey}` and passes it to `stripe.transfers.create`. Stripe request-level idempotency is present and scoped to job/quote/milestone plus the caller-provided key.
- The method writes transfer ID/status to a ledger row queried by the caller's `idempotencyKey`, and returns the Stripe transfer ID/key. On errors it records transfer failure but does not independently query/reconcile a possibly-created Stripe transfer before retry.
- The release route inspected in Section 88 clears milestone `releaseOperationId` after failure. If a retry then creates a fresh caller key, Stripe's composed idempotency key changes, defeating the intended stable Stripe dedupe for an ambiguous prior request. This confirms FIN-03 is an **operation-identity continuity** problem rather than absence of a Stripe idempotency parameter.
- Remediation must preserve the exact operation key from the first release attempt across Firestore rollback/retry, reconcile by Stripe transfer metadata/idempotency outcome before a new transfer, and ensure ledger + milestone state converges. Keep destination-charge and mock-account paths unchanged and do not trigger live transfers during tests.

### Consolidated source-level status

- FIN-01 stale webhook worker fencing: confirmed risk in claim/finalization pattern; add generation-token ownership checks to every financial side effect and terminal status write.
- FIN-04 generic idempotency binding/fencing: confirmed missing binding and stale-completion guard; add canonical request binding + claim generation.
- FIN-03 escrow release identity: confirmed reset can rotate Stripe request key; persist stable operation identity and reconcile ambiguous outcomes.
- FIN-02 refunds: webhook event branch not located in `server.ts`; identify alternate refund ingestion/reconciliation path before assuming implementation location. Embedded refund pagination issue remains to validate against actual source.
- FIN-05 cross-operation reconciliation: remains read-only design; no automatic transfers/refunds or ledger repairs.

No source implementation changed. Next safe work is bounded diff review of ZIP-vs-integration server and payout files, then a read-only full archive manifest and required AI Studio/Firebase pre-change gate.


## Section 91 — ZIP refund webhook and financial-source divergence (2026-11-10)

A bounded source comparison of the latest Library ZIP against `integration/pr-consolidation-20261109` establishes:

- The ZIP's `server.ts` contains a `charge.refunded` webhook branch. It writes one `refund_events/ref_{event.id}` document with charge ID, PaymentIntent ID, aggregate `charge.amount_refunded`, currency and status. It does **not** enumerate `charge.refunds.data`, follow Stripe refund pagination (`has_more`), or persist individual refund IDs. Therefore it is not a complete refund-level ingestion/reconciliation record. The event branch is absent from the integration `server.ts` inspected at this checkpoint; the ZIP is not evidence that this code is currently authoritative or deployed.
- The ZIP and integration match exactly (Git blob SHA) for `src/server/paymentLedger.ts`, `src/services/stripeIntegrationService.ts`, `src/server/paymentVerification.ts`, `src/server/tripPaymentAuthorization.ts`, `tests/unit/paymentLedger.test.ts`, and `tests/unit/escrowReleaseIntegrity.test.ts`.
- The ZIP differs from integration in `src/server/driverPayoutOrchestration.ts`, its unit test, and `server.ts`. The payout source must be line-reviewed before treating either version as superior; integration's existing claim-token fencing is to be preserved. The server difference is substantial (ZIP 271,157 bytes vs integration 317,000 bytes) and must not be wholesale copied.
- Archive integrity check passed (705 entries; no corrupt ZIP members). This confirms readability only, not completeness or correspondence to the live AI Studio workspace.

**FIN-02 refined:** the archived webhook only records aggregate refunded amount and cannot establish refund-level completeness. The integration branch currently lacks this event branch in the inspected server entry point. Locate any alternate integration refund ingestion path and establish the intended source of truth before designing a paginated Stripe refunds fetch; avoid duplicate event ingestion and never call Stripe/live financial APIs in tests.

No application code or live financial data changed. Next: review the exact payout/server financial diffs, inventory archive paths against integration, then execute the AI Studio/Firebase pre-change gate before any remediation.


## Section 92 — Driver payout claim-token exception paths (FIN-01/FIN-03/FIN-05) (2026-11-10)

Read-through of integration `src/server/driverPayoutOrchestration.ts` confirms a positive invariant and two material exception-path gaps:

- **Preserved positive control:** claim is acquired transactionally on the fresh ride snapshot; the Stripe transfer uses deterministic `payout:ride:{rideId}:{driverId}:{transferAmountPence}`; successful finalization re-reads the ride and requires the exact `payoutClaimToken` before setting `payoutTransferred: true`.
- **Failure path is not fenced:** the outer transfer catch writes `payoutTransferred:false`, `payoutStatus:failed`, error and retry count with an unconditional `rideDoc.ref.update`. If this worker's lease expired and another worker acquired a newer token, the stale worker can overwrite the newer worker's state. Stripe idempotency limits duplicate transfer creation for identical request parameters, but does not make stale Firestore writes safe.
- **Dry-run leaves a processing lease:** after claim acquisition, `dryRun` increments simulated results and continues without releasing/resetting the claim. The ride remains `payoutStatus:processing` until lease expiry (five minutes), causing avoidable contention.
- **Stripe success followed by lost token:** finalization throws `LEASE_TOKEN_LOST`; catch then performs the same unfenced failed update. Transfer may already exist, so recovery must reconcile the deterministic Stripe idempotency outcome/transfer ID and avoid representing the payout as safely failed or retryable without that reconciliation.
- **ZIP comparison remains pending:** integration's token-fenced success path is verified in source; no ZIP source was copied. A line-level diff and test comparison are still required before selecting the canonical version.

Remediation/test design: fence *all* post-claim writes (success, failure, dry-run release) using transactional token ownership; never let a stale claimant mutate a newer lease. On ambiguous Stripe success, retain an explicit reconciliation-needed state and stable operation identity, then reconcile before retry. Add tests for stale worker catch after takeover, Stripe-success/finalize-token-loss, dry-run lease cleanup, and no stale status overwrite. No code change or Stripe operation was executed.


## Section 93 — First narrow payout remediation (2026-11-10)

Implemented on integration (not main):

- `src/server/driverPayoutOrchestration.ts`: payout failure/finalization catch now performs a Firestore transaction, checks that the fresh document still has this worker's exact `payoutClaimToken`, and only then writes failure state/retry counter. If claim ownership is gone, it leaves the successor's state untouched and reports an unverified/reconciliation-needed detail. A `LEASE_TOKEN_LOST` finalization error is recorded as `reconciliation_required`, rather than ordinary retryable `failed`.
- Dry-run now transactionally releases its own claim (sets `payoutStatus: pending`, deletes lock timestamp and token) before returning simulated success; a lost claim causes a fail-closed error instead of clearing another worker's lease.
- `tests/unit/driverPayoutOrchestration.test.ts`: added regression cases for dry-run lease release and stale-worker Stripe failure after a successor claim.

Commits: implementation `3661242ca93c5e165e12b2b5a6c3e982ee44b9b7`; tests `df82e492466055238b6902b14f15df7445ec198e`. Both files were fetched back after commit and the expected edits confirmed. GitHub workflow-run lookup returned no runs for these commits; tests have **not** been executed in this environment. Treat this as code committed, not CI-validated.

Remaining correctness work: ambiguous transfer recovery is still not fully solved. If Stripe created a transfer but the client lost the response, the deterministic idempotency key should be reconciled before retry; claim fencing prevents stale Firestore writes but cannot by itself prove external transfer outcome. Add explicit test for Stripe success followed by claim loss during finalization and ensure the recovery state is observable. Do not deploy or invoke live Stripe.


## Section 94 — Observable payout transfer ambiguity (2026-11-10)

Follow-on remediation for the Section 92/93 lease-loss ambiguity:

- The payout result's `PayoutDetail.status` now includes `reconciliation_required`. When Stripe's transfer call returned an ID but the post-transfer Firestore finalization detects `LEASE_TOKEN_LOST`, the catch does **not** write into the successor's ride state. Instead, the returned detail explicitly carries the Stripe `transferId`, amount/destination context, and a reconciliation-before-retry explanation. This avoids disguising a confirmed external transfer as an ordinary retryable failure and gives an operator a concrete transfer identity to investigate.
- Added unit regression case 20: Stripe returns `tr_ambiguous_456`, the lease is replaced during the call, and assertions verify `reconciliation_required`, transfer ID visibility, `payoutTransferred:false`, and preservation of successor `payoutClaimToken`/`processing` state (no stale `stripeTransferId` write).
- Updated files were fetched back from integration and confirmed to contain the new status and test.

Commits: source `4874f78ce86d41f90b89c7f8a2d9437e344d2248`; test `b1b1d920a625b835a76e9639d431b20dc642e6e5`. **Tests remain unexecuted** (no local test runtime or CI run established here). This is observability and fencing—not a full automated Stripe transfer recovery system. A reconciler must still inspect the identified transfer and reconcile ride/ledger state under a fresh authorized claim before any retry. No live Stripe or Firebase mutation was performed.


## Section 95 — Payment-ledger idempotency generation fencing (2026-11-10)

Remediated FIN-04 in `src/server/paymentLedger.ts`:

- A payment idempotency key is now bound to its `operationName`; reusing a completed or active key for another operation throws `ConflictError` instead of replaying an unrelated result.
- Each claim gets a random `claimToken` generation. Completion now transactionally re-reads the idempotency document and only writes the result if the same generation still owns it. A stale executor whose five-minute claim was taken over cannot mark the successor completed.
- Failure cleanup is likewise transactional and token-conditional; a stale failure cannot delete a successor's claim. A superseded executor gets a conflict requiring outcome reconciliation rather than a false success.
- Added tests for operation-name collisions and stale executor completion/cleanup after successor claim replacement.

Commits: implementation `a56a227e5f73a25056207b42dae4dae58b91bb81`; test updates `1294ddd636555a75a2b4d82720e1c6b595b39032` and `4d34e6166ef949ab52e719bc65126bd5dd21bb20`. Files fetched back next for verification. No live financial operations were run. Tests remain pending execution/CI.


## Section 96 — Stripe webhook claim-generation fencing (2026-11-10)

Added a random claim token to each successful `processed_stripe_events/{eventId}` acquisition. The webhook now transactionally verifies that token and `processing` status before marking an unpaid checkout skipped or marking the event completed. Failure handling only marks the event failed when the current document still belongs to the failing worker; it cannot overwrite/delete a successor claim. Completion/failure clear the token.

Commits: `7c8cdd50a94cc0822075b0be07bf850ecc519fad` (claim token implementation), `d557bd480f45cbfa5db5335732936e80dac1cfd7` (scope correction).

**Important boundary:** this fences event-record transitions, not every intermediate Firestore mutation in the webhook. Some fulfillment paths update intent/user documents before final event completion; a worker that loses its lease during those operations could still race on those records. This is not yet end-to-end webhook side-effect fencing. No Stripe/Firebase live operations were run; tests/CI remain unverified.


## Section 97 — Webhook fencing boundary review (2026-11-10)

Follow-up inspection of checkout fulfillment confirms that claim-token checks currently protect the event document's terminal transitions, but do **not** protect all side effects. In particular, the intent is read and updated outside a transaction tied to the event claim; subscription fulfillment transactions use per-session markers and user records but do not yet read/validate the event claim in the same transaction. The mismatch review write is also not claim-fenced.

Do not treat FIN-01 as closed. Before marking it complete, refactor checkout processing so each Firestore mutation that changes intent/user entitlement state validates the current event claim token in the same transaction (read claim + target docs before writes), and add emulator/unit coverage that simulates lease takeover between claim and fulfillment. Stripe API reads are non-mutating; external side effects require separate idempotency/reconciliation handling. This review intentionally makes no speculative broad rewrite of the large webhook handler.



## Section 98 — Checkout fulfillment claim fencing (2026-11-10)

Implemented a first pass of same-transaction webhook claim validation across the `checkout.session.completed` Firestore mutation paths. Ten checkout fulfillment transaction callbacks now read `processed_stripe_events/{eventId}` and require both `status === "processing"` and the exact worker `claimToken` before proceeding to target-document reads/writes. The two standalone payment-intent state transitions (binding mismatch review and processing start) were converted to transactions that read and validate the event claim alongside the intent document before updating it.

This closes the specific stale-worker window identified in Section 97 for the instrumented checkout transaction paths: a worker whose lease was replaced cannot begin a later guarded mutation, and Firestore transaction read conflicts provide retry-time validation if the claim changes concurrently. The existing per-session fulfillment markers remain in place for duplicate delivery protection.

**Verification and remaining boundary:** source was fetched back after commit and inspected: 13 event-claim reads appear in the checkout block (including the existing unpaid-event and intent transitions), no standalone `intentRef.update` remains there, and the guarded transaction callbacks contain explicit claim-loss errors. No test suite, emulator, TypeScript build, or CI run has been executed; do not claim test success. Added a pure ownership predicate and unit cases for current-token acceptance, stale-worker rejection after successor takeover, terminal statuses, missing records, and empty tokens (commits below). These tests have not been executed. Add emulator/integration coverage for takeover during an in-flight Firestore transaction, then audit any checkout side effect that occurs outside these guarded Firestore transactions. FIN-01 remains open until executable regression coverage and the broader webhook path review are complete. No live Stripe/Firebase operations were run.

Commit: `79421cc2c5951efbbdbdb69479b651ebdd606980`.


Ownership predicate/test commits: `a407a5494a307bf60edbc9e42a5cc0bc37cc72b4` and `35cfba743bc16bf9c272129f2d78dc50b314d734`.


## Section 99 — Production wiring for webhook claim ownership tests (2026-11-10)

The ownership predicate introduced with Section 98 is now used by the webhook implementation rather than existing only as a testable utility. Replaced the duplicated status/token comparisons in all 12 checkout transaction callbacks and in the final event completion and failure paths with `ownsStripeWebhookClaim`. The existing unpaid-checkout transaction retains its explicit equivalent guard. This aligns the production guard with the unit-tested predicate and makes stale-worker/successor-token rejection directly testable at the shared decision boundary.

Commits: `152b17ec1593578c79c0b918d8ec4306d1eb2313` (production wiring), with predicate and tests in `a407a5494a307bf60edbc9e42a5cc0bc37cc72b4` and `35cfba743bc16bf9c272129f2d78dc50b314d734`.

**Verification:** source fetch-back confirms the import and predicate use. Unit tests are present but not yet executed. The pure predicate test proves stale-token rejection; it does not simulate Firestore transaction retries or lease takeover during an in-flight callback. Emulator/integration coverage remains required. FIN-01 remains open.


## Section 100 — CI runner availability observation (2026-11-10)

GitHub Actions was triggered by pushes to the integration branch. The latest observed run for commit `f53b33d157b7af895812460435b30b3eee221fd5` (run `42830150821`) concluded `failure` before execution. Its job record reports `runner_id: 0`, an empty `steps` array, and no runner name; the immediately preceding run for `152b17ec1593578c79c0b918d8ec4306d1eb2313` has the same pre-step failure shape. The job-log endpoint returned no log blob. This indicates the workflow did not reach dependency installation or any test/build step; it is not a code-level failing test result. The exact account/billing cause is not exposed in the returned job metadata, so do not assert one as proven.

The integration branch's source, helper, tests, and plan were fetched back successfully. No test, emulator, lint, or build result can be claimed. Once GitHub runner availability is restored, rerun the existing CI workflow and inspect its actual step results before proceeding to close FIN-01.

Observed latest run: `42830150821`; previous run: `42830065952`.


## Section 101 — Remaining webhook projection write fenced (2026-11-10)

A further whole-handler audit found one Firestore mutation in the checkout path that was outside the claim-validated transactions: the boosted-job public-card projection (public_job_cards/{jobId}). Although the projection was described as retry-safe, retry safety alone did not prevent a worker whose event claim had been taken over from publishing a stale projection after its lease expired.

Changed that projection to a separate Firestore transaction which reads processed_stripe_events/{eventId}, validates the current processing status and exact claim token with the shared ownsStripeWebhookClaim predicate, and only then writes the projection. The core job/boost fulfillment remains atomic in its existing claim-fenced transaction; this additional transaction fences the denormalized public projection independently. The subscription lifecycle user update is also performed in a claim-validated transaction. No direct nontransactional Firestore write remains evident in the inspected checkout handler excerpt after this change; this is a source review, not runtime proof.

Implementation commit: 89d1ab582c377976fbad6fec649113bcc9f9d1ab.

**Verification boundary:** the updated source and this plan entry must be fetched back and inspected. No tests, emulator, build, or CI have run successfully; the latest CI issue remains pre-runner assignment as documented in Section 100. FIN-01 remains open pending executable transaction-takeover coverage and a complete audit of external/non-Firestore side effects.


## Section 102 — Webhook ownership test import correction (2026-11-10)

Reviewing the claim helper and its unit suite after the projection audit exposed a test-source defect: the test file invoked ownsStripeWebhookClaim but imported only shouldClaimStripeWebhookEvent. Added the missing named import so the ownership cases reference the production helper rather than an undefined identifier.

Test-source correction commit: 1628b234365dda87913f8bbbf4dd2a2c42315ae1.

This was found by source inspection; the suite has not been executed, so this is not evidence that the tests compile or pass. CI still needs a runner and the emulator takeover test remains outstanding. FIN-01 remains open.


## Section 103 — Webhook side-effect inventory and latest CI runner state (2026-11-10)

A second pass inventoried the Stripe webhook handler's Firestore mutation calls from event claim acquisition through checkout fulfillment, subscription lifecycle synchronization, completion, and failure handling. The handler's writes are transaction writes: claim acquisition; unpaid-event completion; intent review/processing; subscription and membership entitlement updates with fulfillment markers; ad-wallet credit with marker; mediation stake/job update with marker; boost/job/instant-match update with markers; the public-card projection now fenced by Section 101; lifecycle entitlement synchronization; and terminal event completion/failure. Each post-acquisition mutation transaction inspected reads the event claim and checks the current token/status before writing. The Stripe API calls found in this handler are subscription retrievals (read-only); no Stripe charge, refund, transfer, or other mutating Stripe API call was found in this handler excerpt. This inventory is a static source review, not proof against every race or non-Firestore side effect.

The newest Actions run observed after the Section 102 plan commit is run 42831357287 (run number 764), for commit e065add975fa7e2db5e0b69dc694e74d5f7235fe. Its sole job reports runner_id 0, empty runner name, and an empty steps array; it failed within seconds without reaching a workflow step. This repeats the pre-runner failure shape from Section 100 and does not establish a code test failure or prove the exact account/billing cause.

**Remaining FIN-01 work:** execute the unit suite when a runner is available; add emulator coverage for claim takeover and Firestore transaction retry; audit non-Firestore effects and delivery/retry semantics; then inspect actual CI step results. FIN-01 remains open. No live Stripe/Firebase operations were run.


## Section 104 — Ambiguous escrow transfer outcomes remain locked (2026-11-10)

FIN-03 follow-up remediation on the integration branch:

- A thrown `stripe.transfers.create` call is not proof that Stripe did not create the transfer. The transport can fail after Stripe accepts the request, so treating every exception as a definite failure and clearing `releaseOperationId` allowed a caller to submit a new key and mint a different Stripe idempotency key for the same milestone.
- `executeStripeEscrowTransfer` now classifies exceptions from the Stripe transfer call as `reconciliation_required`, records that status on the ledger, and returns the exact deterministic Stripe idempotency key. Preflight failures detected before calling Stripe remain `failed`.
- The escrow release route now handles this ambiguous result separately: it preserves the milestone's `funds_released` state and original `releaseOperationId`, marks `releaseStatus: reconciliation_required` only when the milestone still carries that exact operation key, and returns an explicit warning not to retry with a new key. The previous rollback-to-funded/clear-key behavior remains limited to definite preflight failures.
- Added a unit case that simulates a transfer request throwing after submission and asserts the reconciliation-required result, stable Stripe key, preserved milestone operation key/state, ledger status, and rejection of a subsequent release attempt using a different caller key.

Commits: ledger implementation `3ff058a1b91066ca25081c82c54e2d6d9b19a6b7`; route handling `f5b2c06a0ca676988267bf7f28d1f04dfc015667`; regression test `14a8c58595f8653748d67af9967ee24d5aa8a965`, strengthened by `109d10da2ca8f7ecf743d12ca62958e54f39b16e` to prove a new caller key is rejected.

**Verification boundary:** fetch-back/source inspection and branch comparison are pending. The unit test has not been executed; CI runner availability remains unresolved. This is a conservative lock-and-escalate behavior, not an automated Stripe transfer reconciler. An authorized operator still needs to reconcile Stripe's transfer records against the stored operation metadata before releasing the lock or retrying. No live Stripe/Firebase operation was performed.


## Section 105 — Durable Stripe transfer lookup metadata (2026-11-10)

FIN-03 recovery preparation:

- New escrow transfers now include `releaseOperationId`, the deterministic `stripeIdempotencyKey`, and `operationType: ANYTRADER_ESCROW_RELEASE` in Stripe transfer metadata, alongside job, quote, milestone and trader identifiers.
- This gives a future read-only reconciliation process an explicit operation identity to compare against Stripe's transfer records after an ambiguous API response. It does not itself prove that a transfer exists, and it does not retroactively annotate historical transfers.
- Added assertions to the successful transfer unit test for the complete metadata identity. The existing ambiguous-outcome test still verifies the lock and new-key rejection.
- Commits: metadata implementation `061475123b34bcda9f06940f5c35a293f8aef953`; metadata regression assertion `e6448fcd96f1b81971c4edd78a3bd0aad8abdb0d`.

**Remaining FIN-03 work:** implement a bounded, read-only Stripe transfer lookup/pagination path and compare metadata, destination account, amount and currency against the durable Firestore operation/ledger record. Any zero, multiple or mismatched candidates must remain manual-review cases; never automatically issue a replacement transfer. Also cover legacy transfers without operation metadata. Tests and CI remain unexecuted because GitHub Actions continues to fail before runner assignment. No live Stripe/Firebase calls were made.


## Section 106 — FIN-02 current integration-branch source-of-truth correction (2026-11-10)

A fresh review at integration HEAD `b430e240d0d0a8fdb3c6372d7176a036d8db08f8` resolves the earlier uncertainty about the webhook entry point:

- The current `server.ts` contains the `POST /api/webhook` route and its Stripe event dispatch. The inspected dispatch handles `checkout.session.completed` and subscription lifecycle events; it contains no `charge.refunded` branch, no `refunds.data` iteration, and no `stripe.refunds.list` pagination call.
- The complete Git tree for this exact commit contains 715 entries and is not truncated. Its paths include the payment ledger, Stripe integration, verification, subscription guards and webhook idempotency modules/tests, but no separately named refund or webhook handler module.
- Therefore, the older FIN-02 statement describing embedded-refund pagination and a `requiresPaginationReview` marker must be scoped to the historical PR #5/ZIP source examined in the earlier audit. It is not an accurate description of the current integration branch. The archived `charge.refunded` branch was not copied forward and must not be restored blindly.
- The current branch's Stripe webhook is not evidence of refund ingestion. FIN-02 remains open: identify the authoritative refund event/recording path, establish whether refunds are intentionally handled by a separate trusted process, and then design complete, retry-safe refund-level ingestion. If webhook ingestion is required, it must paginate all Stripe refunds, validate charge/payment-intent/currency identity, deduplicate individual refund IDs, preserve cumulative refund limits, and leave incomplete page retrieval retryable. No automatic financial correction is authorised.
- Static source review only. No Stripe API, Firebase production data, or live refund operations were called. No tests were run as part of this source-location check.

Next: inspect all current-branch references to refund persistence and the payment ledger's refund recording contract before proposing a new event handler. Keep the ZIP/PR #5 implementation as historical evidence, not as a source to transplant.


## Section 107 — FIN-02 active Instant Match refund side-effect audit (2026-11-10)

The follow-up search found an active refund-producing path outside the Stripe webhook:

- `server.ts` imports `startInstantMatchEngine` from `instantMatchWorker.ts` and invokes it with the Firestore instance during server startup (import at line 21; startup invocation at line 7700 in the inspected branch file).
- `instantMatchWorker.ts` issues `stripe.refunds.create({ payment_intent, reason: 'requested_by_customer' })` when an Instant Match expires after exhausting attempts. The same refund logic appears in two independently-triggered paths: the Firestore `instant_matches` snapshot listener and the 10-second timeout interval.
- Neither call supplies a Stripe idempotency key. The code marks the match `expired` before issuing the refund, does not persist the refund ID or a durable refund-operation status, and catches/logs Stripe errors without surfacing a retryable operation state. A process crash or ambiguous Stripe response can therefore leave the match expired with refund outcome unknown; overlapping listener/interval execution can attempt the same refund more than once. Stripe API idempotency is not explicitly used by this worker.
- This is not a general refund event-ingestion/reconciliation path and does not satisfy FIN-02's requirement to enumerate and reconcile individual refund records. It is a live refund-creation side effect, so it is in scope for AnyTrader financial integrity and must be treated separately from the missing `charge.refunded` webhook branch.
- No code change is made in this section. Safe remediation requires a durable per-match refund operation/claim with a stable key, lease/token fencing, explicit states for pending/ambiguous/confirmed/failed, persisted Stripe refund ID, and a retry/reconciliation path that first checks Stripe outcome rather than blindly creating another refund. Both worker triggers must converge on the same operation. Add deterministic unit tests with a mocked Stripe client and Firestore transaction harness; never call live Stripe in tests.
- Static review only. No worker was started, no Stripe request was made, and no Firebase data was read or mutated.

Next: inspect worker deployment/runtime topology and existing Instant Match tests, then design a single idempotent refund operation shared by both timeout triggers. Keep refund ingestion (FIN-02) distinct from refund initiation and reconciliation.


## Section 108 — Instant Match refund identity is absent from production fulfillment (2026-11-10)

A deeper trace from the Stripe checkout webhook into the worker shows that the Section 107 refund-initiation risk is incomplete without checking how the match is created:

- In the production `checkout.session.completed` fulfillment transaction, `server.ts` creates `instant_matches/{im_<session.id>}` with job/customer IDs, `chargeAmountPence`, tier, status and timestamps. It does **not** persist `session.payment_intent` or any `stripePaymentIntentId` field on the match. The same transaction's fulfillment marker stores the event/session/intent metadata reference, but not a PaymentIntent field on the match document.
- The Instant Match worker's two refund branches both guard on `match.stripePaymentIntentId`. The production-created match therefore does not satisfy the guard as currently written, so these branches cannot identify and refund the checkout payment for the normal webhook-created match. This is a source-level control-flow conclusion, not a live transaction test.
- The separate mock checkout route also creates an Instant Match without a PaymentIntent ID. It is not evidence of a production Stripe payment identity.
- A second gap exists in `initiateNextAttempt`: when no available traders remain, it sets the match to `expired` and returns without invoking the refund path. That path can expire a match even when a payment identity is available in a future corrected schema.
- Consequently, remediation must first establish a trusted, durable payment identity at checkout fulfillment (from the verified Stripe Checkout Session's PaymentIntent, with explicit handling if the session is not yet associated with one). Then every terminal no-match path must converge on the same durable refund operation. Do not infer a PaymentIntent from a client field, job ID, session ID, or the worker's current missing property.
- Keep the two failure classes distinct: (1) refund not initiated because the payment identity is missing or the terminal path bypasses refund logic; (2) refund initiated but outcome ambiguous/duplicated because of missing idempotency and durable operation state. Both need explicit tests.

No source code was changed in this section. No Stripe API or Firebase production data was accessed, and no worker was started. Tests remain unexecuted.

Next: inspect the Checkout Session creation mode and its PaymentIntent availability contract, then implement a trusted payment-identity handoff and a single terminal-expiry/refund operation covering attempt exhaustion and zero-eligible-trader expiry. Add tests for absent PaymentIntent, delayed/missing session PaymentIntent, no eligible traders, concurrent terminal triggers, and ambiguous Stripe responses before considering a live rollout.


### Section 108 addendum — checkout payment identity already exists in the intent registry

The Checkout Session creation route was inspected after Section 108 was drafted. It persists a trusted `payment_intents/{intentId}` record with `checkoutSessionId`, normalized currency and `paymentIntentId` (extracted from the Stripe-created Checkout Session) immediately after `stripe.checkout.sessions.create`. The session metadata carries the server-generated `intentId`, and the production webhook's Instant Match fulfillment marker also records that `intentId`.

This refines, but does not remove, the gap: a durable payment identity is already available in the payment-intent registry, but the Instant Match fulfillment transaction does not read that registry or copy `session.payment_intent` onto the match. The correct remediation should use the trusted registry record keyed by the webhook's server-issued `session.metadata.intentId` (and validate its `checkoutSessionId` matches the event session), or a validated PaymentIntent on the Stripe Checkout Session, before persisting the match's payment identity. If the registry entry is absent, mismatched or has no PaymentIntent ID, do not guess or issue a refund; leave a visible retryable/manual-review state. This is preferable to relying only on the webhook payload or trusting a client-supplied identifier.

The no-eligible-traders branch in `initiateNextAttempt` still independently expires a match without routing through a shared refund operation. The target remediation remains one terminal-expiry function that uses the verified payment-intent identity for every terminal path and a durable per-match refund operation. This addendum corrects the proposed source of the identity; no code or live financial operation was performed.


## Section 109 — Corrected checkout registry trace; Instant Match omits validated PaymentIntent (2026-11-10)

A further inspection of the webhook's common checkout preamble corrects the wording in Section 108 and its addendum:

- Before branching into product-specific fulfillment, `server.ts` already requires `session.metadata.intentId` and `session.client_reference_id`, loads `payment_intents/{intentId}`, and calls `evaluateCheckoutIntentBinding(intent, session)`. The helper checks user, Checkout Session ID, mode, amount, currency and, when the registry has a PaymentIntent ID, exact PaymentIntent identity. A still-pending session binding is retried; a mismatch is marked `review_required`. The registry record is therefore read and session-bound; Section 108's claim that the webhook does not read it was incorrect.
- The webhook then sets the authoritative intent record to `processing` and defines `meta = intent.metadata || {}`. Product-specific Instant Match fulfillment can safely use this already-validated `intent` record; it currently creates the match without copying `intent.paymentIntentId` into the match.
- The worker still guards both refund calls on `match.stripePaymentIntentId`, so the validated PaymentIntent identity is not handed from the authoritative registry to the worker. For a paid Instant Match, this is the concrete data-flow gap: verified identity exists upstream but is omitted from the match document. The no-eligible-traders branch also expires without invoking any refund operation.
- `evaluateCheckoutIntentBinding` permits a null PaymentIntent ID when the intent record also has no PaymentIntent ID. Therefore, the Instant Match branch must explicitly require a non-empty, valid PaymentIntent ID before treating a match as refund-capable. If absent, preserve the terminal match state only with a visible refund-review state; do not silently skip refund or guess the ID.
- The Checkout Session `payment_intents` registry path is not absent, and the proposed remediation does not need to introduce a second lookup. It needs to carry forward the already-validated `intent.paymentIntentId` (with the Instant Match-specific non-null invariant) into the match and route all terminal paths through one durable refund operation.

This section supersedes the mistaken statement in Section 108's addendum that the webhook does not read/validate the registry. The underlying omission on the match and the no-eligible-traders bypass remain valid. Source review only; no code or live Stripe/Firebase changes, and no tests executed.


## Section 110 — Instant Match refund identity handoff and durable expiry operation (2026-11-10)

Implemented on the integration branch:

- The existing checkout webhook's validated `payment_intents/{intentId}` record is now carried into the newly created Instant Match as `stripePaymentIntentId`. The value is accepted only when it is a non-empty PaymentIntent-shaped ID (`pi_...`). If it is absent or malformed, the paid match is created in `refund_review_required` with `refundStatus: manual_review`; it is not sent to the matching worker and no guessed refund identity is used.
- `instantMatchWorker.ts` now routes all three terminal no-match paths through `expireAndRefundInstantMatch`: no eligible traders, listener-detected attempt exhaustion, and interval-detected attempt exhaustion.
- The shared operation uses a deterministic `instant_match_refunds/{matchId}` record and stable Stripe idempotency key `instant-match-expiry:{matchId}`. It stores the PaymentIntent ID, operation reason, refund status and Stripe refund ID/status. The Stripe refund carries `instantMatchId` and operation-type metadata.
- A Stripe client absence or thrown/ambiguous Stripe request is recorded as `reconciliation_required`, not as a definite refund failure. A failed/canceled Stripe refund is held for manual review; only a `succeeded` Stripe refund is marked succeeded. Error-state persistence is transaction-fenced so a late error cannot downgrade an already recorded success.
- Concurrent triggers converge on the same operation document and Stripe idempotency key. This is an initiation/idempotency safeguard, not a full refund reconciler: no automatic retry is scheduled for expired matches, and an operator still needs a read-only Stripe refund lookup to resolve `reconciliation_required` states.

Commits: worker operation `aa6817322f470e3616723ec3e64a4b46e14394b3`; checkout identity handoff `8b7f7b449ec6b61d04b1321c504f9e9ce4a9a01c`; late-error fencing `cd90fe7b92eeab1279b23e85da5d38616a29cfed`.

**Verification boundary:** these changes have been written to the integration branch, but tests, TypeScript checking, build and CI have not been run. No live Stripe request, Firebase production read/write, worker startup or deployment was performed. Before rollout, add deterministic mocked tests for missing PaymentIntent, no eligible traders, attempt exhaustion, concurrent triggers, Stripe success, pending/failed refund statuses, thrown/ambiguous responses and late error-vs-success ordering. Review the interval/listener attempt-creation race separately; this change prevents duplicate refund operations but does not yet make attempt creation itself transactionally exclusive.

Next: add mocked worker-level regression coverage and execute the local type/test/build gates when the GitHub runner/billing issue is resolved; then implement read-only reconciliation of stored refund operation IDs against Stripe.

## Section 111 — Single-writer Instant Match attempt creation (2026-11-10)

Follow-up race review found that the Firestore snapshot listener and 10-second timeout poll can both observe the same match/attempt state and concurrently create a next trader attempt. `initiateNextAttempt` now uses deterministic attempt document IDs (`{matchId}_{attemptNumber}`) and a Firestore transaction that reads both the current match and target attempt document before writing. It creates the attempt and advances `currentAttempt` atomically only when the match remains `searching`, the target attempt does not exist, and `currentAttempt === attemptNumber - 1`. Concurrent callers therefore converge on one attempt document rather than creating duplicate trader notifications.

Commit: `749d830a61acdb53a169d85cd61ea13281e6f2c8`.

**Verification boundary:** source-level fetch-back only. No Firestore emulator test or worker-level mocked regression test has yet been added or executed. Existing random-ID attempt records remain readable by the existing query; all new attempts use deterministic IDs. This does not retroactively deduplicate historical duplicate attempts.
Regression coverage added in `tests/unit/instantMatchAttemptCreation.test.ts` for first creation, repeated-trigger deduplication, terminal match rejection and attempt-number sequencing. Commit: `c6ca6d789ed22e04a3f5e49b4d848e2c1f6cf19a`. These are mocked unit tests only and have not yet been executed. The listener/poll attempt-creation race is therefore addressed in source and has test coverage authored, but remains runtime-unverified.

## Section 112 — Prevent replay of unresolved Instant Match refund operations (2026-11-10)

Safety review identified that Stripe idempotency keys have finite retention and cannot be treated as permanent deduplication or lookup records. The refund operation now stops whenever `instant_match_refunds/{matchId}` already exists, regardless of its status. Only the caller that creates the operation record may submit the Stripe refund. Existing `processing`, `reconciliation_required`, `succeeded` and `manual_review` operations are never automatically resubmitted; unresolved records must be reconciled against Stripe before any further action. This deliberately prefers a locked/manual resolution after a crash over a possible duplicate refund.

The Stripe-client-unavailable path now persists `reconciliation_required` through a transaction that checks the latest refund state, preventing it from overwriting a concurrently recorded success. The shared operation is exported for focused unit testing.

Regression tests added in `tests/unit/instantMatchRefundOperation.test.ts` for successful refund identity persistence, missing PaymentIntent manual review, ambiguous Stripe exception with no replay, and completed-operation no-replay.

Commits: worker safety change `ad27277cf0f4add0c7dcdc96a862571a51758d8b`; refund tests `9847d1694ee137738b793d09775e7143be9afb48`.

**Verification boundary:** files were fetched back from the integration branch; tests have not been executed. The mocked tests validate intended state transitions but do not prove Stripe API behavior, Firestore transaction contention semantics, or recovery of an operation left `processing` by a process crash. The latter requires the planned read-only Stripe refund reconciliation before an operator may resolve it.

## Section 113 — Read-only Instant Match refund reconciliation evidence (2026-11-10)

Added `src/server/instantMatchRefundReconciliation.ts`, a side-effect-free lookup primitive that lists Stripe refunds filtered by the exact PaymentIntent and follows every `starting_after` page. A refund is considered a match only when its `instantMatchId` and `ANYTRADER_INSTANT_MATCH_EXPIRY` metadata, PaymentIntent ID, amount and currency all agree with local evidence. Multiple matching records or an identity/amount/currency mismatch produce `conflict`; a complete scan with no operation metadata match produces `not_found`; malformed or non-advancing pagination throws rather than presenting an incomplete scan as a negative result.

New Instant Match records now persist checkout currency alongside `chargeAmountPence`, and the durable refund operation records the expected amount and currency. Historical operations without this evidence are deliberately not eligible for an exact automated match and require manual investigation.

Regression coverage added in `tests/unit/instantMatchRefundReconciliation.test.ts`: multi-page exact match, complete-list absence, amount mismatch, malformed/non-advancing pagination and invalid local evidence. The helper performs no Firestore writes and exposes no refund creation/update/cancel path. Importantly, `not_found` is evidence only; it does not authorize automatic retry or a replacement refund.

Stripe API reference: refund listing supports filtering by `payment_intent` and cursor pagination with `starting_after` (Stripe API reference mirror: https://www.postman.com/stripedev/stripe-developers/request/jp7b6s6/list-all-refunds).

Commits: lookup helper `b13a85ab595777716f4e8b4644219b61321025f1`; operation evidence `a2c9474723ebbf45af645173d89f7246955bac16`; checkout currency `62ef0430c9a56961b6a20230e594b0acff530e9b`; regression tests `621b44a7255c7f98d2ad771a37ba1318f1464dfd`.

**Verification boundary:** source fetch-back and static review only; no tests, typecheck or build executed. No Stripe API request or Firestore operation was made. This primitive is not yet wired to an operator/admin workflow and does not automatically change operation status. A `not_found` result must remain unresolved until the operator verifies the payment/charge context and any pending external activity.

## Section 114 — Refund-to-ledger reconciliation boundary and safe resolution contract (2026-11-10)

Read-only source audit of the Section 113 lookup helper, the durable refund operation, its mocked operation tests and the financial ledger found:

- The durable worker operation is stored at `instant_match_refunds/{instantMatchId}`. Its expected payment identity is `paymentIntentId`, with `amount`, lowercase `currency`, `idempotencyKey`, `reason`, `status`, and optional `stripeRefundId` / `stripeRefundStatus`.
- The corresponding `instant_matches/{instantMatchId}` mirrors the refund status and Stripe refund ID. The Stripe refund is created with `instantMatchId` and `operationType=ANYTRADER_INSTANT_MATCH_EXPIRY` metadata.
- The Section 113 helper is strictly read-only. It checks all refund pages for one PaymentIntent and exact operation metadata, then validates PaymentIntent, amount and currency. It intentionally does not read Firestore, persist a result, or resolve an operation.
- `PaymentLedgerEngine.LedgerEntry` already permits type `REFUND`, but source inspection found no refund-entry writer in `paymentLedger.ts`. Instant Match refunds are therefore not currently represented by the general `payment_ledger` writer path. This is a source-level finding, not a query of production records.
- The current helper's `matched` outcome means exactly one Stripe refund matches the local evidence; it does not mean the refund succeeded. The Stripe status must be interpreted separately. `not_found` is not proof that no refund was created if pagination was incomplete (the helper throws in that case), and it never authorizes a retry. `conflict` must remain a human-review outcome.

### Safe resolution contract for the future operator workflow

1. Read the match and refund operation documents; require the operation's PaymentIntent ID, integer amount and lowercase currency to be valid. Do not reconstruct missing historical evidence from client fields.
2. Run the Section 113 complete, read-only Stripe scan using that exact local evidence.
3. Persist an immutable reconciliation audit record containing the local operation ID, PaymentIntent ID, expected amount/currency, outcome, pages scanned, observed Stripe refund IDs/statuses, actor, timestamp and correlation/request ID. Never persist secrets or raw Stripe objects.
4. Apply status handling only through a separately authorized, idempotent operator command:
   - one exact Stripe refund with `succeeded`: eligible to mark the durable refund operation and match as succeeded, after transactionally re-reading both documents and verifying their identity/evidence has not changed;
   - one exact refund with `pending` or another non-terminal status: keep the operation unresolved/processing and record the observed Stripe status;
   - one exact refund with `failed` or `canceled`: manual review; do not automatically create a replacement;
   - `not_found`: remain `reconciliation_required`; no automatic retry, because the lookup alone cannot prove that no external request remains in flight or that the original request did not have an ambiguous outcome;
   - `conflict`, multiple matches, missing historical evidence, or changed local identity: manual review; never choose one record heuristically.
5. Only after the refund has been authoritatively confirmed should a single deterministic refund ledger entry be written, transactionally deduplicated by the Stripe refund ID (and linked to the original PaymentIntent / Instant Match operation). Do not yet choose amount sign, payer/payee attribution, or fee-reversal treatment without reconciling the existing ledger's accounting convention and Stripe balance effects. The ledger interface's `REFUND` enum alone is not an accounting specification.
6. The operator endpoint must use verified authentication plus the repository's server-side admin authorization helper (not a client-supplied role flag), validate path/body identifiers against the loaded documents, rate-limit access, and expose no refund create/update/cancel operation. Audit both successful and rejected resolution attempts.

### Next implementation sequence

- Inspect existing admin authorization and admin route/test conventions in detail; build a dedicated service module with injected Firestore/Stripe dependencies before adding an HTTP route.
- Add unit tests for every status mapping, stale-document fencing, repeated operator submissions, identity mismatch, missing evidence, and ledger-entry deduplication.
- Determine the canonical double-entry/refund accounting convention before writing any `REFUND` ledger record. Keep Instant Match operational status and accounting posting separate but linked.
- Do not expose an operator endpoint or write to the ledger until those invariants and tests are in place.

**Verification boundary:** this section records source inspection only. No source code, runtime data or financial state was changed; no Stripe API or Firebase production operation was performed; tests, typecheck, build and CI remain unexecuted. GitHub billing approval remains pending. Main remains untouched.


## Section 115 — Admin authorization and ledger accounting convention audit (2026-11-10)

Follow-up inspection of `server.ts`, `src/server/authorization.ts`, `src/server/paymentLedger.ts`, and the existing ledger unit tests refined the operator-workflow design:

- `server.ts` exports `checkIsAdmin(user)`, which accepts only verified Firebase custom claims (`admin === true` / `isAdmin === true`) or a server-side `admins/{uid}` document. It does not trust the user's profile `role`.
- The `requireAdmin` middleware performs that check, but also attempts to migrate verified admins by writing Firebase custom claims. For a reconciliation endpoint whose purpose is narrowly controlled audit/resolution, that incidental auth-side write is unnecessary. Prefer `requireAuth` followed by an explicit `await checkIsAdmin(req.user)` guard in the route (or a new non-mutating admin middleware), and test both claim and Firestore-admin paths plus denial.
- `PaymentLedgerEngine.LedgerEntry` stores positive minor-unit `amount`, `platformFee`, and `netPayout`; escrow funding calculates a 12% fee and 88% net payout. The type union includes `REFUND`, but there is no refund writer in the inspected ledger module and no documented sign/reversal convention in its tests.
- The existing ledger unit tests cover positive funding, fee arithmetic, idempotency and stale-claim fencing, but do not establish refund payer/payee attribution, fee reversal, balance-account mapping or a canonical refund sign convention. Therefore no Instant Match refund ledger posting should be implemented yet.

### Revised next gate

Before a refund writer is added, inspect all ledger consumers/reporting aggregations and Stripe balance transaction handling to determine whether the ledger is an event journal of positive amounts or a signed balance ledger, then document the accounting model. Preserve gross refund amount, any platform-fee reversal, original payer/payee, original PaymentIntent, Stripe refund ID and the original operation ID as distinct fields. Do not infer a commission reversal merely because a customer refund succeeded.

**Verification boundary:** source inspection only; no source code, auth claims, Firestore or financial records were modified. No tests, typecheck, build or CI were executed. GitHub billing approval remains pending; main remains untouched.


## Section 116 — Ledger read-path, reporting and Stripe balance audit (2026-11-10)

A source-level audit of the current integration-branch versions of `src/server/paymentLedger.ts`, `src/server/driverPayoutOrchestration.ts`, and `server.ts` establishes the following:

- The two ledger writers in `PaymentLedgerEngine` are escrow funding and escrow release. Both persist positive integer minor-unit amounts. Funding stores the verified PaymentIntent as `transactionId`, customer as `payerId`, trader as `payeeId`, gross `amount`, `platformFee`, and `netPayout`. Release stores the same positive gross/fee/net shape, original homeowner/trader identities, and the PaymentIntent (or a fallback transaction identifier).
- The `LedgerEntry` interface allows `status: "reversed"` and `type: "REFUND"`, but the inspected module has no reversal/refund writer, no negative-amount convention, and no fee-reversal calculation. This is not evidence that historical records are uniform; it is the behavior of the current writers.
- `releaseEscrowFunds` writes the ledger row with `status: "completed"` as part of the Firestore transaction, before the external Stripe transfer. The transfer outcome is represented separately by `transferStatus`, `stripeTransferId`, and related fields. The release route may later set the row's `status` to `failed` when its transfer fails. Consequently, `status` alone is not a reliable indicator that a Stripe transfer settled.
- The inspected driver payout orchestrator uses `payment_ledger` as a fallback only when retrieving/verifying the PaymentIntent did not succeed. It queries by `transactionId`, takes the first row, and accepts `status === "completed"` or `captured === true` with GBP and a sufficient amount. It does not constrain `type`, inspect refund/reversal fields, or require a Stripe settlement identifier. A refund posting sharing the original PaymentIntent must not be allowed to satisfy this positive-payment fallback.
- The inspected server profitability aggregation writes `user_profitability_daily` from `shop_orders` and does not aggregate `payment_ledger`. The associated analytics route reads that pre-aggregated collection. It is therefore not a canonical provider earnings or refund ledger report.
- The inspected Stripe connected-account routes call `stripe.balance.retrieve({ stripeAccount })` to read available/pending balances and create payouts. The inspected ledger and server paths do not retrieve Stripe balance transactions or use their fee/net/gross details for reconciliation. No balance-transaction-based refund/fee accounting convention can be inferred from these paths.
- In the fetched integration-branch versions of these three files, the direct collection references show the ledger writers, the driver fallback reader, and transfer-status updates. This is a scoped source audit, not a claim about production Firestore contents or a guarantee that no other uninspected module accesses the collection.

### Accounting and implementation consequences

1. Treat the current ledger as a positive-amount financial event journal with incomplete reversal semantics, not as a proven signed balance ledger or complete double-entry general ledger.
2. Do not add a refund row that can pass the driver payout fallback. Before any refund writer is introduced, harden payment verification to require an explicitly eligible positive-payment event type and exclude refund/reversal events; also require authoritative Stripe PaymentIntent verification wherever possible.
3. Keep the original payment event and refund event distinct. A future refund row must have its own deterministic identity keyed to the Stripe refund ID, explicit refund type, original PaymentIntent link, original Instant Match operation link, and separately modelled payer/payee and gross/fee/net effects. Do not overload the original deposit row or infer fee reversal.
4. The existing `completed` status cannot be interpreted as proof of external Stripe transfer settlement. Future consumers must check the relevant operation-specific Stripe status/ID, and the ledger status model should be clarified before it is reused for refund reconciliation.
5. To determine actual connected-account economics, the next audit must inspect Stripe Connect charge configuration (destination charges versus separate charges/transfers), application-fee handling, refund flags such as transfer/application-fee reversal, and the associated Stripe balance transaction records/fees. This requires API-contract/source review or explicitly authorized test-mode fixtures; no live Stripe request is authorized here.
6. Keep the proposed Instant Match refund posting blocked until the payment-verification fallback is made refund-safe and the Connect refund/fee accounting treatment is evidenced. Do not make a ledger schema change based solely on the current enum or positive-amount examples.

**Verification boundary:** fetched and reviewed integration-branch source only. No code, tests, typecheck, build, CI, Stripe API, Firestore or production financial records were changed or queried. The source audit does not establish historical ledger consistency or real Stripe balance effects. Main remains untouched; GitHub billing approval remains pending.


## Section 117 — Distinguish Instant Match platform-fee refunds from Connect escrow refunds (2026-11-10)

A focused integration-branch trace through `src/server/pricingCatalog.ts`, the real checkout-session construction and webhook fulfillment in `server.ts`, and `instantMatchWorker.ts` resolves an important accounting distinction:

- The Instant Match product (`price_instant_match`, currently catalogued at £2.99 with dynamic admin override support) is returned by the pricing catalog as a one-off `mode: "payment"` item with `isClientMoney: false`. Its result does not include `paymentIntentData`.
- The real checkout route only adds `session_options.payment_intent_data` when the authoritative catalog result supplies it. Therefore this Instant Match checkout path does not set a Connect `transfer_data.destination` or `application_fee_amount`; it is a platform-owned charge for the Instant Match dispatch service, not the homeowner-to-tradesperson milestone escrow charge.
- The successful checkout webhook creates the Instant Match record and associates its `stripePaymentIntentId` with the checkout PaymentIntent. The expiry worker later calls `stripe.refunds.create({ payment_intent, reason, metadata })` with its deterministic idempotency key. It does not set `reverse_transfer` or `refund_application_fee`; those Connect-specific options are not applicable to this observed standalone platform charge path.
- By contrast, milestone escrow checkout is explicitly configured in `pricingCatalog.ts` with `application_fee_amount` and `transfer_data.destination`. That is a separate Connect destination-charge flow. Its refund/transfer reversal treatment must be designed independently and cannot be copied from Instant Match.

### Accounting decision for Instant Match

1. An exact successful Instant Match refund should be represented as reversal of the platform's original £2.99 (or the verified dynamic charge amount), linked to the original PaymentIntent and operation. Do not allocate a trader payout or reverse a Connect application fee for this flow: the inspected checkout result creates neither.
2. Do not assume the Stripe processing fee is refunded or choose the platform's net cash impact from gross amount alone. Confirm the actual refund's Stripe balance transaction and fee details before modelling net accounting.
3. Keep the separate Connect milestone refund path out of scope for the Instant Match writer. It requires its own source/API-contract review of transfer reversal and application-fee refund behavior, with evidence for partial and full refunds.
4. For Instant Match reconciliation, persist the Stripe refund ID and status first; only an authoritative `succeeded` refund can become eligible for a deterministic refund event. The earlier Section 116 payout-fallback safeguard still applies: the refund event must never be treated as a positive collected-payment record.

**Verification boundary:** source fetch-back and static trace only. No checkout, Stripe API, Stripe balance transaction, Firestore or production operation was performed. No code or tests were changed or executed. The £2.99 catalog default is not asserted as the actual amount of every historical refund; the durable operation's verified amount/currency remain authoritative. Main remains untouched; GitHub billing approval remains pending.


## Section 118 — Fail-closed driver payout ledger fallback (2026-11-10)

The driver payout fallback previously queried `payment_ledger` by `transactionId` only, selected the first result, and treated `status: "completed"` or `captured: true` plus a sufficient GBP amount as proof of ride collection. It did not constrain the financial event type. This could allow a refund or unrelated escrow record sharing a PaymentIntent identifier to satisfy the payout gate.

### Change made on integration

- `src/server/driverPayoutOrchestration.ts` now additionally filters the fallback query by `type == "RIDE_PAYMENT"`.
- It explicitly rejects a returned entry whose type is not `RIDE_PAYMENT`.
- Missing currency is no longer silently defaulted to GBP in this fallback; the entry must explicitly declare GBP.
- `tests/unit/driverPayoutOrchestration.test.ts` now includes a regression asserting that a completed, GBP-denominated `REFUND` entry with an otherwise sufficient amount cannot authorize a driver transfer.
- A positive-path test asserts that an explicitly typed completed `RIDE_PAYMENT` receipt with GBP and sufficient integer pence can satisfy the ledger fallback when PaymentIntent retrieval is unavailable.
- The pre-existing wrong-currency/untyped ledger fixture remains rejected, consistent with fail-closed behavior.

### Important source limitation

The current integration-branch `server.ts` no longer contains the `ledg_ride_` writer found by repository-wide search results (those search hits resolve to a different indexed revision). The current branch still declares `RIDE_PAYMENT` in the `LedgerEntry` union, but the inspected branch source does not establish a live writer for this event type. Therefore the new positive-path test validates the contract for an explicitly typed receipt; it does not prove production currently emits such receipts. Until a canonical writer is located or added and verified, PaymentIntent retrieval remains the authoritative normal path and missing/legacy/untyped ledger records intentionally fail closed.

**Verification boundary:** both changed source/test files were fetched back from `integration/pr-consolidation-20261109` and their expected changes confirmed. The unit tests, lint/typecheck, build and CI have not been run in this environment. No production Firestore or Stripe data was accessed. No live payout/refund was initiated. Main remains untouched; GitHub billing approval remains pending.


## Section 119 — Trace the canonical taxi ride checkout and webhook path (2026-11-10)

The follow-up audit traced the integration-branch implementation in `src/server/tripPaymentAuthorization.ts`, its authenticated route in `server.ts` (`POST /api/rides/create-trip-payment`), and the shared `checkout.session.completed` webhook handler.

### Observed checkout behavior

- The route calls `executeCreateTripPaymentCommand`. That command loads the authoritative ride from `ride_requests` (with a legacy `rides` fallback), checks the passenger/assigned-driver/admin relationship, resolves the assigned driver's Connect account from the server-side user document, and derives the fare from the ride record.
- It creates a Stripe Checkout Session directly. The session metadata includes `type: "taxi_trip"`, `rideId`, driver/recipient IDs, passenger ID, base fare and tip. The PaymentIntent data configures a Connect destination charge with a 12% application fee and server-derived destination account.
- Critically, this direct session creation does **not** create or persist a corresponding `payment_intents/{intentId}` authorization record, does not set `metadata.intentId`, and does not set `client_reference_id`. The route returns only the checkout URL. The command does not write a ride-payment ledger row or an authoritative paid state to the ride document.

### Observed webhook behavior and consequence

- Before any product-specific fulfillment branch, the shared `checkout.session.completed` handler requires `session.metadata.intentId` and `session.client_reference_id`, loads `payment_intents/{intentId}`, and validates the session against that server-created intent record.
- The taxi-trip Checkout Session created by the traced command supplies neither required binding and has no matching authorization record created by that command. Consequently, this checkout cannot pass the shared webhook's initial authoritative-intent gate as currently implemented. The `taxi_trip` metadata does not itself trigger a ride-specific fulfillment branch in the inspected handler.
- The inspected integration-branch source therefore does not establish a working webhook path that marks the ride paid or writes a canonical `RIDE_PAYMENT` event to `payment_ledger`. The ledger engine still declares the type, but declaration alone is not a writer.
- This is more than an absent ledger writer: there is a checkout-to-webhook contract gap. A customer may complete the direct taxi-trip Checkout Session, while the webhook rejects fulfillment because its required authorization binding is absent. This source trace does not establish what the customer-facing recovery or manual reconciliation process currently does.

### Reconciliation decision

1. Do **not** add a synthetic `RIDE_PAYMENT` writer or relax the payout fallback based only on `taxi_trip` session metadata. The verified payment must first be bound to the exact ride, passenger, assigned driver, amount, currency, Connect destination and Stripe PaymentIntent using a server-created authorization record.
2. Keep the Section 118 fallback fail-closed. An explicitly typed ledger receipt may satisfy its contract only when a real, authoritative writer emits it after verified Stripe payment and binds it to the correct ride and PaymentIntent. Until then, PaymentIntent retrieval remains the primary proof and absent/untyped records do not authorize payout.
3. The next implementation should be a dedicated, idempotent taxi-trip payment authorization/fulfillment flow: persist the server-generated intent record before returning the session URL; bind the Checkout Session and client reference to that record; verify paid status, exact amount/currency, ride identity, passenger, assigned driver and destination account in the webhook; then transactionally persist the ride's paid state, a fulfillment marker and a deterministic `RIDE_PAYMENT` event. Any mismatch must move to review without payout authorization.
4. Add focused tests for session creation binding, webhook success, unpaid session, missing/mismatched authorization, wrong ride/driver/passenger, amount/currency mismatch, duplicate webhook delivery and ledger idempotency. Ensure the Connect destination/application-fee accounting fields are explicitly modelled; do not infer settlement from Checkout completion alone.
5. Treat this as a separate high-priority payment-flow correctness fix before enabling any fallback-based driver payout. No live customer, Stripe, Firestore or payout operation is authorized by this audit.

**Verification boundary:** integration-branch source fetch and static control-flow trace only. No source code or tests were changed or executed in this step. No Stripe API, Firestore production data, customer payment or payout was accessed. Main remains untouched; GitHub billing approval remains pending.


## Section 120 — Taxi fulfillment must satisfy the existing payout contract (2026-11-10)

A second pass through `src/server/driverPayoutOrchestration.ts` and its unit tests establishes the exact downstream contract that a taxi-trip webhook repair must preserve:

- The payout worker queries only `ride_requests` with `status == "completed"`, `paymentStatus == "paid"`, and `payoutTransferred == false`. A successful Checkout Session alone does not make a ride eligible.
- The worker derives the payout base from authoritative `finalFare`, adds the ride's `tipAmount`, and retrieves the ride's exact `stripePaymentIntentId`. It rejects a missing authoritative fare, an unavailable/unverified PaymentIntent, underpayment, or non-GBP currency.
- For the existing 12% standard commission path, the expected driver transfer is 88% of base fare plus 100% of tip. Existing tests explicitly assert £50 base + £5 tip produces £49 driver transfer, and that a £10 collection cannot authorize that payout.
- The Section 118 ledger fallback is only a fallback when PaymentIntent retrieval fails; it requires an explicit `RIDE_PAYMENT` type, completed status, GBP currency and sufficient amount. The positive fallback fixture does not prove a production writer exists.
- `tests/unit/checkoutIntentIntegrity.test.ts` confirms the shared checkout-binding contract: intent `userId` must equal session `client_reference_id`; Checkout Session ID, mode, integer amount, currency and PaymentIntent binding must match; only `session_created` or `processing` intent states are accepted after binding. A pending intent without a session ID is retryable; mismatches are rejected.

### Implementation gates before restoring the taxi path

1. The taxi command must persist a pre-checkout intent with the passenger UID, exact integer total in pence (base plus tip), GBP currency, payment mode and server-derived taxi metadata. The Stripe Session must carry that intent ID and passenger client reference; the intent must be updated with the returned Checkout Session ID and PaymentIntent ID before the route reports success.
2. The webhook must not mark the ride paid based on metadata alone. It must pass the shared intent binding and additionally verify taxi metadata against the persisted intent, then transactionally re-read the ride and ensure its passenger, assigned driver, authoritative fare and Connect destination still match the intent. It must verify the paid session's exact amount/currency and non-empty PaymentIntent ID.
3. Only after those checks may one transaction set the ride's `stripePaymentIntentId`, `paymentStatus: "paid"` and verified payment evidence, and create an event-scoped fulfillment marker. The ride's operational `status` must remain governed by the ride lifecycle; payment completion must not falsely mark an unfinished trip as completed.
4. Create a `RIDE_PAYMENT` ledger receipt only after the same authoritative verification, keyed deterministically to the Stripe PaymentIntent (and protected against duplicate webhook events). Its amount must represent the gross collected amount in integer pence; the existing payout split remains 88% of base fare plus the full tip. Keep gross amount, base fare, tip, application fee and net driver transfer distinguishable rather than storing an ambiguous net amount.
5. Add tests at both command and webhook boundaries for exact binding, duplicate delivery, early webhook-before-session-write, unpaid checkout, wrong passenger/driver/ride, changed fare or Connect account, wrong amount/currency, missing PaymentIntent, and ledger idempotency. Add an integration-level regression proving that successful verified fulfillment makes the ride eligible for the existing PaymentIntent-based payout verification without bypassing any payout gate.

**Safety decision:** do not create a ledger receipt from Checkout Session metadata, do not set `paymentStatus: "paid"` before the exact Stripe evidence and ride identity checks, and do not weaken the existing payout contract to compensate for the broken checkout/webhook binding. The current positive `RIDE_PAYMENT` fallback test remains a contract test only.

**Verification boundary:** read-only source and test inspection on the integration branch. No code or tests were changed or executed in this step. No Stripe, Firestore production, customer payment or payout operation was performed. Main remains untouched; GitHub billing approval remains pending.


## Section 121 — Taxi checkout webhook fulfillment branch audit (2026-11-10)

A further exact-branch trace inspected the shared webhook's complete one-off payment fulfillment dispatch, the taxi route, and the existing generic checkout implementation. This narrows the failure point and confirms the gap is not solved by adding only the shared intent binding.

### Additional verified findings

- The shared webhook validates the payment_intents/{intentId} binding before product fulfillment. It then dispatches subscription sessions through subscription-specific branches and one-off payment sessions through explicit metadata branches.
- In the inspected one-off payment dispatch, handlers exist for ad_wallet_topup, mediation_stake, and boost (with Instant Match creation nested under boost). There is no taxi_trip handler and no ride-payment fulfillment branch. Thus, even if a taxi session were amended to pass the generic intent gate, its metadata would still not cause ride paid-state mutation, ride fulfillment-marker creation, or a RIDE_PAYMENT receipt.
- The generic POST /api/create-checkout-session route demonstrates the repository's intended binding sequence: create a server-side payment_intents record in pending state before Stripe session creation; send metadata.intentId and client_reference_id; then persist the returned Checkout Session ID, currency, PaymentIntent ID and session_created status. The taxi command currently bypasses this sequence.
- The taxi route refuses to continue without Stripe in production or when mock payments are not explicitly enabled. In permitted development mock mode, it can still call the command with a null Stripe client; the command returns a local success URL without creating a Stripe Session or an authorization record. This is a development-only path, not proof of a paid ride, and must never be treated as payment evidence.
- The current generic webhook marks an unpaid checkout.session.completed event as completed with skippedReason: payment_not_paid and returns HTTP 200. Any future taxi flow must explicitly define its supported asynchronous payment methods/events rather than assume that this branch retries an unpaid completed session after payment settles. The existing taxi session currently restricts payment methods to card, but that does not remove the need for explicit event semantics and tests.

### Revised implementation boundary

The repair must be a coordinated change across the taxi command, shared webhook dispatch, ride/payment persistence and tests. The safe shape is:

1. Add a server-generated taxi intent before creating the Checkout Session, with immutable passenger/ride/driver/fare/tip/GBP/Connect-destination facts and exact integer-pence amount. Use a cryptographically strong or collision-resistant ID consistent with repository conventions; do not use client input as the document identity.
2. Bind the Stripe Session using metadata.intentId and client_reference_id, and persist its returned Session and PaymentIntent IDs. If the route cannot durably finish the binding write, do not report a usable checkout URL as fully initialized; retain a recoverable reconciliation state.
3. Add a dedicated taxi_trip webhook fulfillment branch after the shared binding gate. It must verify the intent's taxi type and immutable facts against the paid Stripe session and a fresh authoritative ride/driver read. Verify exact amount, currency, PaymentIntent ID and Connect destination. Do not trust session metadata as the authority for those values.
4. In a transaction fenced by the existing webhook claim, atomically apply the ride payment evidence, a session/event fulfillment marker, and a deterministic PaymentIntent-keyed RIDE_PAYMENT event. Re-read all relevant documents in the transaction and reject conflicting prior bindings. Preserve the ride's operational lifecycle status.
5. Keep the event retryable/reconcilable on a missing or incomplete pre-checkout binding; do not mark an unfulfilled taxi event permanently complete. Define explicit behavior for unpaid and asynchronous payment events.
6. Add command, webhook and payout-eligibility tests before enabling the route. Include duplicate and concurrent webhook delivery, Stripe session creation succeeding while Firestore binding persistence fails, webhook arrival before binding persistence, and changed ride/driver/Connect account between checkout and webhook.

**Decision:** do not make a partial edit to tripPaymentAuthorization.ts alone. That would create a valid generic intent binding but still leave the paid taxi session without ride fulfillment. Implement and validate the command + webhook dispatch + transactional fulfillment as one reviewed change set. Until then, the payout fallback remains fail-closed and the taxi checkout path remains an identified correctness blocker; this audit itself does not disable or change the route.

**Verification boundary:** exact integration-branch source fetch and static control-flow inspection only. No code or tests were changed or executed. No Stripe API, Firestore production data, customer payment or payout was accessed. Main remains untouched; GitHub billing approval remains pending.


## Section 122 — Taxi checkout tip versus payout source-of-truth mismatch (2026-11-10)

A focused comparison of the taxi payment command and driver payout orchestrator identified a second, independent financial-integrity condition that the coordinated repair must resolve.

### Verified source behavior

- In src/server/tripPaymentAuthorization.ts, the checkout command derives the base fare from the ride document, but derives the tip from Number(body.tipAmount) and clamps it to £0–£500. It then charges the combined base fare plus this request-supplied tip.
- The command does not persist that sanitized tip to the ride document or to a server-created payment_intents authorization record (no such record is currently created by the command).
- In src/server/driverPayoutOrchestration.ts, the payout worker independently calculates the driver amount from authoritative ride.finalFare and Number(ride.tipAmount). It does not derive the tip from the Checkout Session or the PaymentIntent metadata.
- Therefore, for any checkout request whose body tip differs from ride.tipAmount, the amount collected and the amount later used in the payout calculation can diverge. The current source does not establish that the two values are kept equal by another step.
- The checkout command calculates the 12% application fee on base fare only, while the checkout total includes base fare plus tip. This aligns with the documented payout split (88% of base fare plus 100% of tip), but only if the exact tip charged is also the tip subsequently persisted and used by payout.

### Required repair invariant

The coordinated taxi checkout/webhook repair must choose one explicit tip authority and enforce it end to end:

1. If tips are intended to be selected by the passenger at checkout, persist the sanitized integer-pence tip in the server-created taxi intent and, only after exact successful Stripe verification, transactionally persist that same amount on the ride as the paid tip. The webhook must reject any mismatch between intent, paid session amount, and the ride's already-bound payment facts; do not let a later checkout silently replace a tip already paid or attached to another PaymentIntent.
2. If the ride's existing tipAmount is intended to be authoritative before checkout, ignore body.tipAmount and charge only the persisted ride value. Document that contract and test that client input cannot alter the charge.
3. In either model, use integer pence for base, tip, total, application fee and payout arithmetic. Reject non-finite, negative, unsafe or excessive inputs explicitly; avoid floating-point rounding as the cross-service identity check.
4. Preserve the current commission contract: 12% of base fare only; driver amount 88% of base fare plus the full verified tip. Verify the actual collected gross amount against base + tip and the PaymentIntent currency before any ride paid-state or ledger write.
5. Add regression cases where request tip differs from ride.tipAmount, is absent, is negative, is non-finite, exceeds the cap, and is replayed against an already-paid ride. Assert that the amount collected, ride tip persisted, ledger gross amount and payout computation all use the same verified tip.

**Decision:** no implementation should write a RIDE_PAYMENT receipt or mark a taxi ride paid until this tip source-of-truth contract is explicit. A ledger receipt with the correct gross charge but a payout calculated from a different ride tip would make the downstream payment evidence internally inconsistent.

**Verification boundary:** exact integration-branch source fetch and static comparison only. No source code or tests were changed or executed. No Stripe API, Firestore production data, customer payment or payout was accessed. Main remains untouched; GitHub billing approval remains pending.


## Section 123 — Taxi tip cap mismatch and payout collection tolerance (2026-11-10)

A further comparison of the exact checkout and payout arithmetic found two concrete reconciliation defects relevant to the taxi-flow repair.

### 1. Checkout and payout enforce different maximum tips

- src/server/tripPaymentAuthorization.ts converts body.tipAmount with Number(...) || 0, then clamps it to a maximum of £500.
- src/server/driverPayoutOrchestration.ts rejects a ride when ride.tipAmount exceeds £200.
- Consequently, the checkout command can create a Stripe charge containing a tip between £200.01 and £500, while the payout worker later rejects the same ride as amount_out_of_bounds. This is a deterministic cross-service contract mismatch, independent of webhook fulfillment.
- The checkout conversion also does not explicitly reject non-finite input: positive Infinity is clamped to £500, while NaN and other falsy numeric conversions become zero. The desired behavior should be explicit validation, not silent normalization of malformed client input.

### 2. Stripe collection verification accepts over-collection

- The payout worker computes expected gross collection in integer pence as rounded finalFare plus rounded ride.tipAmount.
- Its Stripe PaymentIntent path currently accepts amount_received when it is greater than or equal to expectedTotalCollectedPence; it rejects underpayment but does not reject overpayment.
- The ride payout itself is calculated from finalFare and tipAmount, not from the excess amount collected. This leaves an over-collection unexplained by the ride's canonical fare/tip contract and means a PaymentIntent can be treated as proof for a different gross amount.
- The ledger fallback likewise accepts a RIDE_PAYMENT amount greater than or equal to the expected gross amount. The fallback's explicit type/status/currency checks are useful, but the amount comparison is not an exact match.

### Required cross-service contract

1. Define one maximum tip and apply it consistently at checkout, webhook verification, ride persistence, payout validation and tests. Do not silently change the existing £200 payout cap or £500 checkout cap without an explicit product/business decision; until resolved, fail closed for any tip that violates the chosen shared limit.
2. Validate the submitted tip as a finite numeric amount, convert once to integer pence, enforce non-negative and shared maximum pence, and persist that exact integer-pence value in the server intent. Do not round the same decimal independently at multiple trust boundaries.
3. The webhook must require Stripe's exact gross amount to equal the immutable intent amount and current authoritative ride fare plus the verified tip. It must not accept greater-than-or-equal as a substitute for equality.
4. The payout worker should require exact equality between Stripe amount_received and the canonical expected gross pence for a single-charge taxi payment, and exact equality for a RIDE_PAYMENT fallback receipt. If legitimate overpayment, partial capture or adjustments are supported, model them explicitly as separate, auditable financial events rather than silently accepting a different amount.
5. Add boundary tests at £200.00, £200.01, £500.00, and malformed values (NaN, Infinity, negative, numeric strings, missing), plus exact/under/over Stripe amount and ledger amount cases. Include payout eligibility after a verified tip is persisted.

**Decision:** the taxi repair is not complete merely when a webhook can set paymentStatus=paid. The checkout cap, canonical tip value, paid gross amount, ledger gross amount and payout verifier must share one exact integer-pence contract. The existing payout worker's fail-closed cap must not be bypassed to accommodate the looser checkout input.

**Verification boundary:** exact integration-branch source fetch and static arithmetic/control-flow inspection only. No source code or tests were changed or executed. No Stripe API, Firestore production data, customer payment or payout was accessed. Main remains untouched; GitHub billing approval remains pending.


## Section 124 — Taxi checkout can report success after Stripe session creation fails (2026-11-10)

Exact-branch inspection of `src/server/tripPaymentAuthorization.ts` found an additional failure-mode defect.

### Finding

- When a Stripe client is supplied, the taxi command attempts `stripeClient.checkout.sessions.create(...)`.
- If Stripe throws, the catch logs the error and rethrows only when `NODE_ENV === "production"`.
- In non-production environments, it suppresses the Stripe error and continues.
- The command initialized `checkoutUrl` before the Stripe call to a local `/payment-success?rideId=...&fare=...&tip=...` URL. If session creation throws, it can therefore return `success: true` with that local success URL and `session: null`.
- The route can return this URL as though checkout were ready. This is not Stripe payment evidence, but a client may be sent to a success-looking page without any Checkout Session existing.
- This differs from the route's explicit no-Stripe development mock gate: the dangerous path occurs even when a Stripe client exists but its session-creation request fails.

### Required repair

1. If a Stripe client is present, failure to create a Checkout Session must fail the command in every environment. Never convert a Stripe API failure into a successful-looking local payment URL.
2. A successful result must require a non-empty Stripe Checkout Session ID and URL, and must include a durable server-side intent/session binding before returning the URL.
3. Keep any explicitly permitted mock/development path separate, visibly marked as mock, and incapable of setting paid state, writing a RIDE_PAYMENT receipt, or qualifying for payout.
4. Add tests for Stripe session creation throwing in development and production, missing session ID, missing URL, Firestore intent persistence failure, and success only after durable session binding.
5. The UI success/cancel routes must not be treated as proof of payment; only the verified Stripe webhook path can authorize ride paid state and payout evidence.

**Decision:** remove the non-production swallow-and-fallback behavior as part of the coordinated taxi checkout repair. Do not patch this command alone while the missing pre-checkout intent, webhook fulfillment, and tip source-of-truth issues remain unresolved.

**Verification boundary:** source fetch and static control-flow inspection only. No code or tests changed or executed; no Stripe API, production Firestore data, customer payments or payouts accessed. Main remains untouched.

## Section 125 — Checkout asynchronous-payment events and terminal unpaid-event handling

### Exact source evidence

The exact integration-branch webhook source was re-read in `server.ts` (blob SHA `d0d781571a2a1dd28478ca92930f4f9b919bf38a`), together with `src/server/stripeWebhookIdempotency.ts` (SHA `06f43eb8f727f4e85dceee294fcaaccc28d886c6`) and `tests/unit/stripeWebhookIdempotency.test.ts` (SHA `623a34d91591d37b85b3469ab064f827dadc7ea5`).

Observed behavior:

1. The `checkout.session.completed` branch treats any session whose `payment_status` is not `paid` as terminal: it writes the processed event as `completed` with `skippedReason: "payment_not_paid"`, removes the claim token, and returns HTTP 200.
2. The inspected webhook source has no handler for `checkout.session.async_payment_succeeded` or `checkout.session.async_payment_failed`. Thus, if a Checkout Session is configured for an asynchronous payment method and its completed event arrives before settlement, this event is acknowledged as complete and there is no corresponding async-success fulfillment path in this webhook.
3. The generic Checkout intent binding gate is only entered after the unpaid early-return. The event is therefore not held in a retryable pending state awaiting settlement.
4. Taxi Checkout currently specifies `payment_method_types: ["card"]`, so this is not evidence of an active asynchronous taxi payment path today. It is a generic Checkout/webhook correctness gap and a future risk if accepted payment methods expand.
5. The webhook claim helper considers a processing record with no readable `claimedAt` timestamp fresh indefinitely: `shouldClaimStripeWebhookEvent` substitutes `nowMs` when the timestamp is absent. The existing unit test explicitly codifies this behavior. This is fail-safe against stealing an un-timestamped active claim, but it also means a malformed/legacy processing record without `claimedAt` has no automatic stale-claim recovery path.

### Required repair

- Define event-state semantics for asynchronous Checkout methods. Do not mark an unpaid `checkout.session.completed` event as fulfilled/completed if the Session can still settle later.
- Add explicit, intent-bound handling for `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, or enforce and test a card-only configuration consistently at every generic Checkout entry point.
- Async success must re-fetch or otherwise verify authoritative Stripe Session/PaymentIntent state, pass the same server-intent binding checks, and use the same idempotent product fulfillment path. Async failure must transition the intent/event to a retry-safe terminal failure/reconciliation state without granting entitlements.
- Keep event delivery idempotency separate from payment settlement state: an event may be acknowledged as received without declaring the underlying intent fulfilled.
- Define a bounded recovery policy for processing claims with missing or malformed `claimedAt`. Recovery must not let a worker steal a valid active claim; if safe age cannot be established, surface a reconciliation/alert state rather than silently leaving a permanent lock.
- Add tests for unpaid completed followed by async success, async failure, duplicate async events, intent mismatch, and malformed/missing claim timestamps. Confirm the configured payment-method set for each Checkout route before deciding which event paths are mandatory.

### Scope and safety

This is a source-audit finding only. No source code or tests were changed or run in this section. No Stripe or Firestore production operations were performed. Taxi-specific binding, amount, destination, ride fulfillment, and ledger requirements in Sections 119–124 remain unresolved and must be repaired as a coordinated flow; this section does not authorize loosening any payment or payout gate.

## Section 126 — Checkout route inventory: payment-method scope and fee-settlement binding gap

### Exact source evidence

The integration-branch `server.ts` was fetched directly (blob SHA `d0d781571a2a1dd28478ca92930f4f9b919bf38a`) and the following Checkout Session creation sites were enumerated:

1. `POST /api/create-checkout-session` (around lines 2333–2630):
   - Creates a `payment_intents/{intentId}` record before Stripe Checkout.
   - Uses `payment_method_types: ['card']`, `client_reference_id: userId`, and `metadata: { intentId }`.
   - Persists Checkout Session ID, currency, PaymentIntent ID, and `session_created` after Stripe returns.
   - For payment mode, it may configure `payment_intent_data` for Connect destination charges.
2. `POST /api/create-setup-session` (around lines 2640–2690):
   - Uses `mode: 'setup'` and `payment_method_types: ['card']`.
   - It is a card-setup flow, not a payment fulfillment flow; no payment-intent binding is expected.
3. `POST /api/rides/create-trip-payment` delegates to `src/server/tripPaymentAuthorization.ts`:
   - Uses `mode: 'payment'` and `payment_method_types: ['card']`.
   - Does not currently bind to the shared server-created `payment_intents` record or shared webhook fulfillment (Sections 119–125).
4. `POST /api/driver/settle-fees` (around lines 4793–4815):
   - Uses `mode: 'payment'` and `payment_method_types: ['card']`.
   - Session metadata contains only `driverId` and `type: 'fee_settlement'`; it has no `intentId` and no `client_reference_id`.
   - The shared `checkout.session.completed` webhook requires both fields before it will process a paid Session. No `fee_settlement` fulfillment handler was found in the inspected webhook dispatch.
   - The route therefore creates a real card Checkout Session that cannot pass the shared checkout intent-binding gate and has no corresponding webhook fulfillment in the inspected path. The route's success URL is not payment evidence.

### Conclusions

- All four enumerated Checkout Session creation sites explicitly constrain accepted methods to card. The asynchronous Checkout gap in Section 125 is therefore not currently demonstrated as an active asynchronous-method bug in these routes. It remains a future-proofing issue if any route changes its method configuration or another Session creator is added.
- The driver fee-settlement route is a separate, concrete integration gap: it creates a paid Checkout Session without the required server-side intent binding and without a matching webhook fulfillment branch.
- The fee-settlement route's development sandbox path is separate from Stripe settlement and must not be treated as external payment evidence. Existing manual confirmation endpoints require their own authorization and financial-state audit before relying on them.

### Required repair

1. Decide whether fee settlement is intended to be webhook-verified Stripe payment or an explicitly manual/sandbox operation. Do not mix the two.
2. If Stripe payment is intended, create a pre-checkout server intent bound to the authenticated driver, authoritative outstanding fee balance, GBP integer-pence amount, and fee-settlement purpose. Set `metadata.intentId` and `client_reference_id`, then persist Session and PaymentIntent IDs before returning the URL.
3. Add a dedicated webhook fulfillment handler that verifies exact paid status, amount, currency, driver identity, and current outstanding fee balance; atomically records a deterministic settlement marker and updates fee balances. Handle duplicate and concurrent delivery and do not trust client-supplied settlement amounts.
4. If manual settlement remains supported, keep it separate from Stripe Checkout and require auditable evidence plus strict server-side authorization; never let a success redirect or sandbox URL mark a Stripe payment as settled.
5. Add route inventory regression tests asserting that every payment-mode Checkout Session creator either supplies the shared binding and has an explicit webhook fulfillment handler, or is explicitly documented as non-fulfilling/setup-only.
6. Keep card-only constraints explicit until asynchronous methods have complete event and settlement handling. Revisit Section 125 if accepted methods expand.

### Scope and safety

This is a source-audit finding only. No source code or tests were changed or run in this section. No Stripe or Firestore production operations were performed. The taxi payment and payout repair remains coordinated and fail-closed; no payout gate is relaxed.


## Section 127 — Cash-fee accrual and settlement confirmation are not a verified accounting lifecycle

### Exact integration-branch evidence
- `src/components/driver/DriverTerminal.tsx` (blob `40db85db97f62c425787fd64b77ea241d3dd8eb8`):
  - In the cash-trip completion path, the client computes `baseFare` from the ride estimate plus paid waiting time, computes `totalFare = baseFare + tip`, and computes `platformFee = baseFare * fareConfig.commissionRate + fixedTripFee`.
  - It writes the completed cash ride to `ride_requests` with `paymentMethod: "cash"`, `finalFare`, and `platformFeeOwed`, then directly increments `users/{driverId}.pendingPlatformFees` by `platformFee` from the client.
  - The client-side computation and direct Firestore write are not a server-verified accounting event. Whether rules constrain these writes must be audited separately; no claim is made here about the deployed rules.
- `server.ts` (blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a`):
  - `POST /api/driver/settle-fees` derives driver identity from the auth token, but starts with `amount || 9.75`; if Firestore is unavailable, the read fails, or the user document is missing, this client-supplied/fallback amount can be used. A zero stored balance also falls through because of `||`.
  - When the document is readable, it uses `pendingPlatformFees` as a GBP decimal and converts to integer pence with `Math.round(pendingPlatformFees * 100)`.
  - It creates card-only Checkout with metadata `driverId` and `type: "fee_settlement"`, but no shared `intentId`, no `client_reference_id`, and no persisted settlement/session record.
  - The success URL includes the amount as a query parameter. The route returns the Checkout URL without recording an immutable amount snapshot or binding it to a settlement attempt.
  - `POST /api/driver/confirm-fee-settlement` is gated to non-production with `ALLOW_MOCK_PAYMENTS === "true"`; in that sandbox it reads the current balance and unconditionally writes `pendingPlatformFees: 0`. It does not verify a Checkout Session, PaymentIntent, amount, currency, or payment status, and it is not transactionally tied to an accrual cutoff.
- `src/components/driver/PlatformFeeSuccess.tsx` (blob `6f187db4db4c77f56fa25d824f4a05eb4781ea40`):
  - On mount it calls the confirmation endpoint regardless of whether the URL contains `sandbox=true`.
  - On a non-OK response or exception it still sets the displayed amount from the URL and emits a success toast; the page labels the method “Stripe Card Payment” and status “Success”. Thus the browser return URL can produce a success presentation without backend settlement confirmation.
  - The URL amount is display input only and is not evidence of payment.

### Reconciliation implications
1. The fee balance currently has at least one client-side accrual writer and a separate sandbox-only zeroing endpoint; there is no demonstrated authoritative server-side fee ledger tying each cash ride accrual to a later settlement.
2. A driver can accrue additional fees while a settlement is in flight. Clearing the whole live balance on return can erase fees accrued after the Checkout amount was calculated; a fixed amount URL does not solve this race.
3. When the database read fails, the settlement route can price a Checkout from a request body/default rather than a verified outstanding balance. When a readable balance is zero, the `||` fallback can also substitute a nonzero request/default value.
4. The success page intentionally degrades every backend failure into a success-looking state. It must be treated as a presentation defect, not proof of payment.
5. Sandbox confirmation currently clears a balance without a payment artifact. It must remain isolated from any live financial state and must not be presented as a real Stripe settlement.

### Required repair sequence (do not implement piecemeal)
1. Inventory Firestore rules and every writer/reader of `pendingPlatformFees`, `platformFeeOwed`, and cash-trip completion fields. Establish whether client writes are permitted and whether retries can double-accrue.
2. Move fee accrual to a trusted server-side, idempotent cash-trip completion operation, using integer pence and a stable ride/accrual ID. Preserve a per-ride immutable fee record and derive the driver's outstanding amount from those records or a reconciled aggregate.
3. Create a settlement-attempt record server-side from the authenticated driver's authoritative outstanding balance. Reject missing database state; never accept a request-body/default amount as the financial authority. Bind Checkout Session, PaymentIntent, driver, GBP amount, and the exact set/cutoff of fee records being settled.
4. Add a dedicated verified webhook fulfillment path for `fee_settlement`. Validate paid status, amount, currency, driver, session/intent binding, and attempt state; atomically mark the attempt and only the fee records included in it as settled. Preserve later accruals. Make webhook retries and concurrent settlement attempts idempotent.
5. Restrict any manual/sandbox clearing to isolated test fixtures or a distinct non-financial test ledger. Do not let a success redirect or query-string amount mutate financial state.
6. Change the success page to display success only from a server-verified settlement status. On failure/pending, show pending or failed and never emit a success toast or represent the URL amount as settled.
7. Add tests for DB read failure, zero balance, forged body amount, duplicate cash completion, concurrent accrual during Checkout, duplicate webhook delivery, wrong driver/currency/amount/session, unpaid session, sandbox route behavior, and non-OK success-page response.

### Status
- Section 127 is evidence and plan documentation only.
- No source code, Firestore rules, or tests were changed in this section.
- No tests, typecheck, build, CI, Stripe calls, production operations, or production data changes were run.
- Next: inspect the exact Firestore security rules and all other branch occurrences of the fee fields, then consolidate the trusted accrual/settlement design before editing financial code.


## Section 128 — Firestore rules reject the current client-side cash-fee writes

### Exact integration-branch evidence
- `firestore.rules` blob `0d1139b17382491e47d7f0151fd41187978abedb`:
  - `match /users/{userId}` lines 279–307 allows an owner to update only an explicit profile allowlist. `pendingPlatformFees` and `totalBusinessMileage` are not in that allowlist. Only an admin bypasses the owner allowlist.
  - `match /ride_requests/{rideId}` lines 357–395 allows an assigned driver to update only `status`, `location`, and `updatedAt`; the cash completion write in `DriverTerminal.tsx` changes fields including `finalFare`, `platformFeeOwed`, `reportedCashCollected`, `reportedCashDiscrepancy`, and `completedAt`. Those fields are not allowed in the assigned-driver update branch.
  - Passenger updates are also explicitly barred from changing `finalFare` and financial status fields. The driver-acceptance branch is limited to status/driver assignment fields.
- Therefore the observed `DriverTerminal.tsx` cash-completion path attempts two direct Firestore writes that the checked-in rules reject for an ordinary authenticated driver: the ride financial completion update and the user fee-balance increment. The surrounding client catch logs a failure; the UI's “Cash Trip Recorded” confirmation is reached only if those writes succeed. This is a code/rules mismatch, not evidence that a production request was tested.
- Exact branch-wide scan of `server.ts` found the fee-balance reads/zeroing in the two driver fee routes, but no server-side accrual writer for `pendingPlatformFees` and no other `fee_settlement` fulfillment writer. The one cash accrual attempt found remains in the client component.

### Consequences and repair implications
1. The prior Section 127 wording that the client “writes” the cash ride and increments the balance should be read as “attempts to write”; the checked-in Firestore rules deny both operations for a normal driver.
2. Cash trip completion can fail at the first prohibited ride update, so the subsequent fee-balance increment may never execute. The route must not assume the pending balance reflects all completed cash rides.
3. Do not fix this by broadening client Firestore permissions for financial fields. Route the entire cash completion operation through a trusted server command that authenticates the assigned driver, validates the ride lifecycle and cash evidence, calculates fees from server-owned configuration, and atomically/idempotently writes the completed ride plus fee accrual.
4. Add emulator tests proving ordinary drivers cannot directly mutate these protected fields and proving the new server command performs the intended atomic operation. Verify the actual deployed rules separately before any live rollout.

### Status
- Section 128 is documentation only; no rules or application code changed.
- No emulator tests, CI, build, or production checks were run.
- Next: map the existing server-side ride completion/force-complete commands and their authentication/lifecycle guards so the repair can reuse the correct trusted boundary rather than introduce a parallel completion path.


## Section 129 — No trusted taxi cash-completion route exists in the current server route inventory

### Exact integration-branch evidence
- `server.ts` blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a`:
  - The ride-specific authenticated routes found in the route inventory are `POST /api/rides/accept` and `POST /api/rides/create-trip-payment`; the former delegates to `executeAcceptRideCommand`, the latter creates Stripe Checkout through `executeCreateTripPaymentCommand`.
  - No authenticated `complete-ride`, `complete-trip`, `cash-confirm`, or `force-complete` route was found in this server file. The fee routes are separate and do not complete a ride.
  - The Stripe webhook exists, but the earlier Sections 119–126 establish that the taxi Checkout path is not bound into the shared intent/webhook fulfillment contract.
- `src/components/driver/DriverTerminal.tsx` blob `40db85db97f62c425787fd64b77ea241d3dd8eb8`:
  - Driver cash completion writes `awaiting_cash_confirm` or `completed` directly to `ride_requests`, including financial fields, then attempts to increment `users/{driverId}.pendingPlatformFees`.
  - A `cash_confirmed` snapshot causes the driver client to call `handleCashPayment(true)` again, so the completion/accrual path is re-entered from a client-observed status transition.
- `src/components/passenger/PassengerBooking.tsx` blob `ef0fc1e0c03d777cd460863241a86b2c54d318ec`:
  - Passenger-side simulation transitions `awaiting_cash_confirm` to `completed` by direct Firestore updates.
  - The cash-confirmation button first attempts to write `status: "cash_confirmed"`, then may write passenger pending charges and financial completion fields directly to Firestore.
- These client operations conflict with the checked-in `firestore.rules` ride update allowlists documented in Section 128: assigned drivers can update only operational status/location/timestamp fields; passengers cannot change financial completion fields and can only perform narrowly allowed cancellation/draft status transitions. This review has not run an emulator to test the rules, but the source predicates exclude the fields in question.

### Reconciliation implications
1. The current cash workflow has no trusted server command that owns the full state transition, fee calculation, and ledger accrual. It relies on multiple client writes that are disallowed by the checked-in rules.
2. The driver snapshot callback can re-enter cash completion when it sees `cash_confirmed`; without a stable ride-scoped idempotency record, retries or repeated snapshots risk duplicate metric/fee side effects if any write path is later permitted.
3. A separate client simulation path should not be mistaken for a production completion authority. The passenger UI and driver UI are both attempting state changes rather than invoking a single server state machine.
4. Do not loosen Firestore rules to permit these financial mutations. Implement one authenticated server command for cash collection confirmation and completion, with role/ride ownership checks, allowed lifecycle transitions, exact cash collected/discrepancy validation, idempotent fee accrual, and atomic writes.

### Required next inspection before implementation
1. Fetch and trace `executeAcceptRideCommand`, ride lifecycle/state-machine helpers, and any shared ride authorization or force-completion command before designing the new route.
2. Identify the canonical source of fare configuration and commission rate. The current driver component uses local `fareConfig` state, which must not be the authority for money calculations.
3. Decide the domain semantics for partial cash: passenger-confirmed unpaid balance, force-complete reason, and driver platform commission must be separate, explicit ledger entries.
4. Build a server command and emulator/unit tests together; keep direct client writes denied.

### Status
- Section 129 is documentation only; no application code or rules changed.
- No tests, emulator, typecheck, build, CI, or production operation was run.
- Next: inspect `executeAcceptRideCommand` and ride lifecycle helpers, then design the server-owned cash completion command around the existing trusted patterns.


## Section 130 — Existing trusted ride acceptance is reusable, but the formal ride state machine does not model cash-confirmation states

### Exact integration-branch evidence
- `src/server/driverAuthorization.ts` blob `35c44e8d788e8a24c98af5fde11196749c5b7038`:
  - `executeAcceptRideCommand` is a server-authoritative pattern: derives the effective driver from authenticated `caller.uid`, rejects a conflicting body `driverId`, checks driver eligibility, reads the ride in a Firestore transaction, verifies the ride is available and unassigned, and atomically assigns the driver plus marks the driver busy.
  - This is an acceptance command only. It does not implement arrival, in-progress, cash collection, completion, commission accrual, or fee settlement.
- `src/server/stateMachine.ts` blob `85f6e4ecbf757c7907870cfff8754a34af1f6dff`:
  - `RideStatus` and `VALID_RIDE_TRANSITIONS` model `draft/requested/searching/offered/accepted/arriving/arrived/in_progress/completed/cancelled`.
  - The formal transitions allow `in_progress -> completed`, but do not include the UI statuses `awaiting_cash_confirm` or `cash_confirmed`.
  - `validateRideTransition` would therefore reject these UI-only intermediate states if applied directly; the new command must explicitly reconcile or replace these statuses rather than bypass the state machine.
- `server.ts` imports and mounts the acceptance command at `POST /api/rides/accept`, but the route inventory in Section 129 found no corresponding server-side ride completion command.
- `DriverTerminal.tsx` loads `remoteConfig.platformCommissionRate` into local `fareConfig`; the cash fee calculation is performed in the client component, not in a trusted command. The server must resolve the authoritative commission/fixed-fee configuration independently.

### Design constraints for the replacement
1. Preserve the trusted command shape from ride acceptance: authenticated caller identity, resource ownership/assignment checks, server transaction, and explicit conflict handling.
2. Use the formal ride state machine as the lifecycle authority. Decide whether partial-cash confirmation is a first-class ride/payment substate or a separate payment-collection record; do not silently add ad hoc ride statuses.
3. Separate the ride lifecycle transition from the financial ledger event while committing both atomically where they share the same Firestore transaction.
4. Derive fare, waiting time, commission, and fixed fee from persisted authoritative ride data and server-owned configuration. Reject client-provided commission or fee amounts.
5. Use a stable ride-scoped idempotency key and immutable cash-collection evidence so repeated calls or snapshots cannot duplicate commission accrual, passenger debt, or driver metrics.
6. Add transition tests for full cash, partial cash, passenger confirmation, timeout/force completion, already-completed rides, reassignment, and concurrent duplicate requests.

### Status
- Section 130 is documentation only; no code or tests changed.
- No tests, emulator, typecheck, build, CI, or production operations were run.
- Next: inspect the remote-config/server pricing authority and the exact cash confirmation/timeout callbacks to specify the command input contract before implementation.


## Section 131 — Cash shortfall confirmation and force-completion are client-controlled; fee pricing has split configuration inputs

### Exact integration-branch evidence
- `src/components/driver/DriverTerminal.tsx` blob `40db85db97f62c425787fd64b77ea241d3dd8eb8`:
  - Cash completion derives fare and platform fee in the client from `activeRide`, client-side wait seconds, `fareConfig`, and the driver's entered cash amount.
  - When cash collected is below the calculated total, the client writes `awaiting_cash_confirm` and the reported collected/shortfall amounts directly to the ride document, then starts a 45-second local countdown. This countdown is UI state, not a server-enforced deadline.
  - After timeout, the driver UI offers a reason and force-completion path. The force-completion flag/reason is client state; the inspected path passes it into the same client-side cash completion function. It is not a server authorization decision.
  - A Firestore snapshot observing `cash_confirmed` while the local ride state is `completed` calls `handleCashPayment(true)` again. That is a second client-triggered execution path, not a durable, server-side confirmation event.
  - The fee calculation uses `fareConfig.commissionRate` and `fareConfig.fixedTripFee`. The former is taken from `remoteConfig.platformCommissionRate` when present, otherwise `platform_config/rides.commissionRate`, otherwise 12%; fixed fee comes from `platform_config/rides.fixedTripFee`. Thus commission and fixed fee may be sourced from different configuration documents, and neither is authoritatively read by a cash-completion server command because no such command exists.
- `src/components/passenger/PassengerBooking.tsx` blob `ef0fc1e0c03d777cd460863241a86b2c54d318ec`:
  - Passenger confirmation directly writes `cash_confirmed`, then attempts to update the passenger's `pendingCharges` and the ride's completed/financial fields.
  - Its “stuck” force-completion button independently writes the ride as completed and may apply the pending passenger charge. It does not require a server-issued deadline, driver evidence, or a server adjudication.
  - The UI says the unpaid remainder will be carried into the next trip/account balance. This is a debt/receivable, not collected cash, and must not be represented as money received or as a Stripe payment.
- Checked-in `firestore.rules` allowlists documented in Sections 128–129 do not permit ordinary driver/passenger clients to perform these financial writes. This source inspection does not test deployed rules.

### Required domain separation
1. Cash received by driver, unpaid passenger remainder, platform commission receivable, and any later recovery/payment of that remainder must be distinct ledger facts. Do not equate an unpaid remainder with cash collected.
2. A 45-second passenger response window must be recorded server-side with a timestamp/deadline and enforced by the command. A browser timer expiring is not proof that the deadline elapsed.
3. Passenger confirmation should record acknowledgement of the stated cash/shortfall evidence; it must not itself assert cash collection or independently complete the ride.
4. Force completion should be a server-authorized exception with a constrained reason, actor, timestamp, evidence, and review/reconciliation status. It must not erase a passenger receivable or create a paid record.
5. Centralize the authoritative fare/commission/fixed-fee configuration. Resolve whether Remote Config or `platform_config/rides` owns each value, define validation/versioning, and snapshot the selected config version and integer-pence calculation into the ride/ledger event.
6. The server transaction should atomically commit the lifecycle outcome, cash evidence, receivable (if any), platform-fee accrual, and idempotency marker. All client UIs become readers/callers of that command.

### Status
- Section 131 is documentation only; no application code, config, or rules changed.
- No tests, emulator, typecheck, build, CI, or production operation was run.
- Next: inspect the Remote Config provider and configuration write permissions/version semantics; then specify the canonical pricing schema and cash-completion command contract before coding.


## Section 132 — Remote Config and local simulation overrides are presentation inputs, not a trusted pricing authority

### Exact integration-branch evidence
- `src/services/remoteConfigService.ts` blob `959ee6fccda2e9b4de74f46eac0abb898b52656a`:
  - Firebase Remote Config is initialized only in the browser (`typeof window === "undefined"` returns defaults).
  - `platformCommissionRate` defaults to 0.12. If Remote Config is unsupported or fetch fails, the code returns defaults.
  - The fetch uses `Promise.race` with a 1,000 ms timeout, but does not cancel or await the underlying fetch after the timeout. It then reads active SDK values and merges local overrides.
  - `getSavedOverrides()` reads `anytrader_remote_config_sim_overrides` from browser localStorage; `getMergedValuesWithOverrides` spreads those values over the fetched/default values without schema validation.
- `src/components/RemoteConfigProvider.tsx` blob `90e4d4cf67370d08a4132083ed8eb89bb7600fdd`:
  - Provider exposes `updateSimulationOverrides`, persists arbitrary partial config overrides to localStorage, and immediately merges them into UI state.
  - No server-side persistence, authenticated config version, audit trail, or authoritative pricing snapshot is produced by this provider.
- `src/components/anyroller/GlobalSettings.tsx` blob `00f98d7d1ea9d9f68dddeffd2140cfcd7ee82e8a`:
  - “Apply Simulator State” changes local simulation overrides, including commission; it does not publish or update Firebase Remote Config.
  - The UI copy nevertheless describes the settings as system-wide and says changes override payment QR rates and active terminal totals. The same component calls the source “live Google Cloud” when no local override is active, which can mislead operators about what is authoritative.
- `firestore.rules` blob `0d1139b17382491e47d7f0151fd41187978abedb`:
  - Client reads of `platform_config/{doc}` are allowed except the secrets document; writes are restricted to admins. This is a reasonable client permission boundary, but the rules do not establish schema validation, versioning, or an immutable audit record for pricing changes.
- `DriverTerminal.tsx` consumes the browser Remote Config commission if present, otherwise reads `platform_config/rides` and defaults to 12%; it separately reads `fixedTripFee` from `platform_config/rides`. No server-side cash completion command currently reads and snapshots a canonical pricing record.

### Reconciliation conclusions
1. Browser Remote Config values and localStorage simulation overrides are not suitable as the monetary authority for cash completion, fee accrual, or settlement. They are mutable client presentation inputs and may differ across devices/sessions.
2. The 1-second fetch race plus fallback defaults means two clients may calculate different amounts depending on fetch timing, support, cache, or local override state.
3. The UI's “system-wide” and “live cloud” descriptions overstate what the simulator actually changes. Applying an override changes that browser's local state only; it does not publish a global config.
4. `platform_config/rides` is a possible Firestore-owned source, but the checked-in rules only provide access control, not a typed/validated pricing contract. The server must validate every field and fail closed if the canonical document is missing or invalid.
5. The server must persist a pricing snapshot with each cash-completion/fee-accrual event: integer pence, commission basis points or a validated rational rate, fixed fee in pence, currency, config version, and effective timestamp. Later config edits must not rewrite historical fee calculations.

### Recommended canonical design (proposal; not implemented)
- Use one server-read Firestore document, e.g. `platform_config/rides_pricing`, as the operational pricing authority for cash rides. Keep Firebase Remote Config for non-financial client presentation and rollout flags only.
- Add a strict schema and bounded validation for commission rate, fixed fee, currency, and effective version. Require an explicit monotonically increasing `configVersion` and server-authored `updatedAt`/actor audit metadata. Admin writes should go through a validated server command or a rules-constrained schema; do not rely on admin UI convention alone.
- Resolve the pricing document inside the same trusted completion command that calculates and records the fee, and copy the exact snapshot into the immutable ride fee-accrual record. Use integer pence throughout.
- Keep local simulation overrides explicitly labelled and isolated from real-money paths; the server must never accept a client-supplied rate, fee, or config version as authority.
- Correct GlobalSettings labels/help text so simulation overrides are described as local preview-only, not live system-wide changes.

### Status
- Section 132 is documentation only; no source code, Firestore rules, Remote Config parameters, or live configuration changed.
- No tests, emulator, typecheck, build, CI, Firebase console access, or production operation was run.
- Next: inspect all server-side reads and admin mutation paths for `platform_config/rides` and any existing audit/version conventions, then finalize the pricing schema before implementation.


## Section 133 — Ride pricing has multiple client-side admin writers but no server-owned versioned pricing contract

### Exact integration-branch evidence
- `src/components/RidesCommandCenter.tsx` blob `1078ff7c6dd0d9407cddfb5a0c1edeef8fc98915`:
  - `handleSaveConfig` writes a broad sanitized set of fare, commission, fixed-fee, dispatch, and surge fields to `platform_config/rides` using client SDK `setDoc(..., { merge: true })`.
  - It stamps `updatedAt: serverTimestamp()`, but does not add a config version, actor identity, before/after audit event, or schema validation at the server boundary. Numeric coercions such as `Number(value) || fallback` can silently turn explicit zero/invalid values into defaults.
- `src/components/anyroller/PricingFares.tsx` blob `885960b0aeaba10a31096c565dbc05b39c161c36`:
  - A second client admin screen writes overlapping fare, commission, and fixed-fee fields to the same document with merge semantics.
  - It writes `commissionRate` as a decimal fraction but does not write a version or audit record.
- `src/components/anyroller/DispatchEngine.tsx` blob `50e7a3624248c6c2a91817e2691dcbe19c75cf87`:
  - A third client admin surface writes operational policy fields to the same document, also with merge semantics. This creates a shared mutable document with multiple independently deployed writers and no explicit version contract.
- `firestore.rules` (Section 132 blob `0d1139b17382491e47d7f0151fd41187978abedb`) restricts writes to admins, but any authorized admin client can write the allowed document fields directly. This is access control, not validation or audit/version enforcement.
- `server.ts` blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a` reads `platform_config/rides` for demand-zone surge settings. In the inspected read it tolerates a missing document and overlays defaults; that is a non-financial surge consumer, not an authoritative cash-fare/commission reader.
- `src/server/pricingCatalog.ts` blob found on the integration branch resolves the separate `platform_config/global_tiers` and `platform_config/global` documents for marketplace/tradesperson pricing. Its commission logic is for milestone escrow, not taxi cash commission. Do not reuse it as the taxi pricing authority without a deliberate domain model change.

### Reconciliation conclusions
1. `platform_config/rides` is written by multiple admin client surfaces and is protected by admin-only rules, but it has no server-enforced schema, monotonic version, immutable audit trail, or single-writer command.
2. Merge writes allow different screens to update overlapping subsets of the same document. Without a version check, stale admin screens can overwrite newer fields with stale values.
3. The current client writes use inconsistent field shapes/defaulting conventions (for example commission displayed as percent in one UI and decimal in storage); any canonical schema must explicitly define units and reject ambiguous values.
4. A server cash-completion command must not trust a browser snapshot, Remote Config value, local override, or request-supplied commission/fixed fee. It must read and validate a canonical server-owned pricing version and snapshot it with each fee accrual.
5. Avoid making the entire operational `rides` document the financial pricing authority by accident. Prefer a dedicated `platform_config/rides_pricing` record or a validated subset with a clear owner, to prevent dispatch/surge UI changes from changing historical financial calculations.

### Required implementation sequence
1. Define a dedicated taxi pricing schema with explicit GBP/pence units, commission basis points, fixed fee pence, fare formula version, effective timestamp, config version, and admin actor.
2. Add an authenticated admin server command that validates the full schema, enforces optimistic version increments, and writes an immutable audit record in the same transaction.
3. Make admin pricing UIs call that command rather than directly merge-writing financial pricing fields. Operational dispatch/surge settings may remain separate.
4. Make the cash completion command read only the canonical pricing document, fail closed on missing/invalid configuration, and persist the exact snapshot to the ride fee record.
5. Add tests for invalid/negative/out-of-range rates, unit confusion, stale version conflicts, concurrent admin edits, missing config, and historical snapshot immutability.

### Status
- Section 133 is documentation only; no source code, Firestore rules, or configuration changed.
- No tests, emulator, typecheck, build, CI, or production operation was run.
- Next: inspect current admin authorization helpers and server route conventions to determine the safest reusable pattern for a versioned pricing-admin command and audit transaction.


## Section 134 — Existing server admin authorization is reusable; generic audit endpoints are not a safe pricing-write contract

### Exact integration-branch evidence
- `server.ts` blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a`:
  - `requireAuth` verifies a Firebase bearer token with `verifyTokenSafely` and attaches the decoded token to the request.
  - `requireAdmin` verifies the token if needed, calls `checkIsAdmin`, rejects non-admin callers, and may migrate a verified admin to custom claims.
  - `checkIsAdmin` accepts server-minted `admin === true` or `isAdmin === true` custom claims, or a server-side `admins/{uid}` document. This is the existing server authorization boundary to reuse for pricing administration.
  - Existing admin routes commonly use `requireAdmin`, but the generic `POST /api/admin/agents/audit-logs` spreads `req.body` into the persisted record and accepts a caller-provided timestamp. It is a generic operational log endpoint, not a constrained, immutable financial configuration audit mechanism.
  - Existing `/api/admin/sync-public-job-cards` and `/api/admin/sync-public-properties` demonstrate the simple `requireAdmin` route shape, but do not provide a versioned config transaction.
- No existing dedicated server route was found that updates `platform_config/rides` with schema validation, optimistic version checks, and an atomic audit record. Existing client screens write directly to Firestore as documented in Section 133.

### Recommended server command contract (proposal; not implemented)
- Route: `PUT /api/admin/rides-pricing`, protected by `requireAdmin`.
- Body contains only the proposed pricing fields and `expectedConfigVersion`; reject unknown keys and reject any client-supplied actor, timestamp, version, or audit metadata.
- Server validates finite bounded values, explicit GBP currency, commission basis points, fixed fee pence, fare formula version, and an integer expected version. No fallback defaults for missing/invalid financial values.
- In one Firestore transaction:
  1. Read current canonical pricing document and compare `configVersion` to `expectedConfigVersion`.
  2. Reject stale writes with a conflict response.
  3. Write the complete validated config with `configVersion + 1`, server timestamp, and authenticated admin UID.
  4. Create a separate append-only audit document with before/after snapshots, version transition, actor UID, and server timestamp.
- Keep the audit write in the same transaction as the config write so a successful config update cannot exist without its audit event.
- Do not reuse the generic audit endpoint, accept arbitrary audit payloads, or make the admin client write the pricing document directly.
- The cash completion command reads this canonical version and snapshots its exact values. Existing operational dispatch/surge settings should be separated from financial pricing.

### Status
- Section 134 is documentation only; no route, authorization helper, config, or audit collection changed.
- No tests, emulator, typecheck, build, CI, or production operation was run.
- Next: inspect the repository's Firestore transaction and command test conventions, then design the implementation/test split for the pricing admin command and cash completion command.


## Section 135 — Existing command and test conventions support a dedicated versioned pricing command, with emulator coverage still required

### Exact integration-branch evidence
- `src/server/quoteCommands.ts` blob `e1f45e46f16a47f5cc46ea7b951200ad6eee0bc4`:
  - Uses Zod schemas with `.strict()` for command payloads, explicit protected-field rejection, and server-side identity rather than trusting caller-supplied ownership fields.
  - Its command executor uses `db.runTransaction(...)` and reads authoritative documents before making writes. This is a useful structural precedent for a pricing command, although its domain-specific quote logic and idempotency behavior should not be copied wholesale.
- `src/server/accountBootstrap.ts` blob `bdb625fdea1bbf4e52c73fbcd718b78566415518`:
  - Uses a strict Zod input schema and a server command function with explicit database and authenticated-caller parameters. This is another suitable pattern for separating validation/command logic from Express route wiring.
- `src/server/driverAuthorization.ts` blob `35c44e8d788e8a24c98af5fde11196749c5c7038`:
  - Demonstrates a small command input interface, explicit caller UID validation, authoritative reads inside a Firestore transaction, and server-authored timestamps. It imports Firebase Admin for server timestamps.
- `tests/unit/task4AcceptQuote.test.ts` blob `dc345fde2c21e92b74dcd89288df2ffcb705a110`:
  - Uses Vitest and a hand-built Firestore mock with collection/document references and a `runTransaction` callback. This is a useful unit-test pattern for validation, conflict handling, and asserting config/audit writes.
  - The mock executes a transaction callback against an in-memory object; it does not model Firestore's production transaction retries, isolation, or concurrent optimistic-conflict behavior. Passing these tests alone cannot establish race safety.
- `package.json` blob `973603b055a65607106d2afac29b248d0b915b27`:
  - The repository provides `vitest run` through `npm test`, `tsc --noEmit` through `npm run lint`, and separate Firebase emulator scripts. A substantial set of emulator-dependent suites is deliberately excluded from the ordinary unit-test command.
- GitHub code search did not return a reliable integration-branch test for `executeAcceptRideCommand`; search results can target the default branch. No conclusion about absence of every possible test file should be drawn from that search alone.

### Implementation implications
1. Keep the pricing command in a focused server module, separate from `server.ts` route wiring. Export a strict Zod schema and a command executor that receives the Firestore dependency and authenticated admin UID.
2. The command should accept only the complete pricing proposal and `expectedConfigVersion`. Derive actor UID, timestamps, and next version on the server. Reject unknown fields, fractional/unsafe version values, invalid ranges, ambiguous currency/units, and missing required fields.
3. In the transaction, read the canonical config first, enforce the expected version, then write the complete next config and a new audit event together. Do not perform transaction writes before all required reads are complete.
4. Keep unit tests for schema boundaries, missing config policy, stale versions, exact before/after audit content, and atomic write intent. Add a real Firestore emulator concurrency test for two admin updates racing on the same expected version; exactly one must commit and the other must conflict.
5. Before route/UI integration, inspect the exact Firestore Admin SDK timestamp and transaction APIs used in this repository, route error mapping for `ConflictError`, test-runner TypeScript configuration, and current admin UI payload shapes. Then implement the command, route, UI migration, and cash completion integration as separately reviewable changes.
6. Do not treat the existing in-memory mocks as evidence of concurrent correctness. Do not connect the new config to live cash completion until the versioned command and the fee snapshot lifecycle are both covered by tests.

### Status
- Section 135 records implementation/test conventions only. No source code, tests, route, UI, Firestore rules, pricing document, or live configuration changed.
- No unit tests, emulator tests, typecheck, build, or CI were run in this step.
- Next: inspect exact admin route error handling, timestamp conventions, and existing test configuration, then implement the isolated pricing schema/command with unit tests before any client migration.


## Section 136 — Admin route error handling is available, but existing pricing screens expose incompatible legacy units and mixed responsibilities

### Exact integration-branch evidence
- `server.ts` blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a`:
  - `requireAdmin` verifies a Firebase bearer token, calls `checkIsAdmin`, rejects unauthorized callers, and attaches the decoded token as `req.user`. The authenticated UID is available from that verified token; the route must not accept an actor UID in the request body.
  - Existing admin routes demonstrate `app.post(path, requireAdmin, handler)`. New route error handling should use the shared `sendHttpError(res, error, req)` rather than exposing raw exception messages.
  - The generic AI audit-log endpoint is still unsuitable for pricing audit: it spreads arbitrary request-body fields and accepts a client timestamp.
- `src/server/httpErrors.ts` blob `4a94fe94f02303d3ba120f18d34b62691d90bd1e`:
  - Provides `BadRequestError` (400), `ForbiddenError` (403), `ConflictError` (409), and `sendHttpError`, which emits structured safe error responses with a correlation ID. The pricing command should use `ConflictError` for an optimistic-version mismatch and route failures should flow through this responder.
- `src/components/anyroller/PricingFares.tsx` blob `885960b0aeaba10a31096c565dbc05b39c161c36`:
  - Loads `platform_config/rides`; UI commission is displayed as a percentage and stored as a decimal fraction (`commissionRate / 100`). Fare, distance, time, waiting, minimum fare, and fixed trip fee are displayed as GBP decimal numbers, not integer pence.
  - Saves only its subset with `setDoc(..., { merge: true })`; it does not carry a config version or actor/audit metadata.
  - Uses truthy fallback for several loaded fields, so legitimate numeric zero values can be replaced by defaults.
- `src/components/RidesCommandCenter.tsx` blob `1078ff7c6dd0d9407cddfb5a0c1edeef8fc98915`:
  - Loads and saves the same `platform_config/rides` document but mixes financial fare/commission values with dispatch, surge, vehicle, and operational settings.
  - Its commission editor uses a percentage field called `commission`, and save maps it to decimal `commissionRate`; its sanitization uses `Number(value) || fallback`, which can turn explicit zero into a fallback for some fields.
  - It writes with client-side `setDoc(..., { merge: true })`, not through a versioned server command.
- `tsconfig.json` blob `fd560f328a1bdd5e1a5a83db0e89a5a14ec687fa` uses ESNext/bundler resolution, `allowImportingTsExtensions`, `noEmit`, and non-strict checking. The new module should follow the repository's existing explicit `.ts` import convention.
- `tests/unit/propertyCommandService.test.ts` blob `a0e744354525419c3880dab8446545352fa68d47` demonstrates client command-service tests by stubbing global `fetch` with Vitest and asserting request/retry behavior. This is relevant for testing the future admin UI command client, but does not replace server command tests.

### Reconciliation conclusions
1. The server has a usable admin middleware and standardized 409 error class. The new endpoint can be narrowly scoped and should return the next config version; stale edits must return a structured conflict so the UI can reload rather than silently overwrite.
2. The two current financial editors do not share a clean input contract. One calls commission `commissionRate` in storage and the other calls it `commission` in UI; both store a decimal fraction, while both show a percentage. Any migration must explicitly convert legacy values and reject ambiguous/invalid values rather than guessing.
3. The UI stores monetary values as GBP decimal numbers, whereas the proposed authoritative server contract uses integer pence. The migration needs explicit conversion at the boundary, safe-integer checks, and tests for rounding (including half-penny inputs); do not silently round arbitrary legacy values without an agreed policy.
4. Fare inputs (base/distance/time/wait/minimum), commission, fixed fee, and vehicle multipliers may influence ride pricing, but the first canonical schema must include only fields whose usage and formula are fully traced. Surge/dispatch policy should not be mixed into the financial config by convenience.
5. A versioned endpoint must not simply redirect one screen while leaving another able to write the same financial fields directly. Both admin writers must be migrated or direct writes must be removed/denied in the same controlled rollout.

### Status
- Section 136 is documentation only; no route, UI, schema, test, Firestore rule, pricing record, or production configuration changed.
- No tests, emulator, typecheck, build, or CI were run in this step.
- Next: trace every server and client consumer of the proposed canonical pricing fields, decide the exact supported formula and legacy migration/rounding policy, then implement the strict server schema/command and its tests.


## Section 137 — Fare formula is inconsistent across passenger quote, driver simulation, and cash completion; pricing schema cannot yet be finalized safely

### Exact integration-branch evidence
- `src/components/passenger/PassengerBooking.tsx` blob `ef0fc1e0c03d777cd460863241a86b2c54d318ec`:
  - Initial passenger quote calculates `baseFare + distanceMiles * distanceRate + durationMinutes * timeRate`, then applies `minFare`.
  - Vehicle category multiplier and surge are applied in a later `getComputedFare` path; fixed surge is added or multiplier surge applied.
  - Config is read from `platform_config/rides` in multiple effects; one effect merges raw data, another maps selected fields with truthy defaults. Commission/fixed fee are not part of passenger's fare quote, but fee/wait values are used later in lifecycle handling.
- `src/components/driver/DriverTerminal.tsx` blob `40db85db97f62c425787fd64b77ea241d3dd8eb8`:
  - Ride simulation calculates `max(minFare, baseFare + simulatedDistance * distanceRate)` and omits `timeRate * simulatedTime`; surge and priority fee are applied afterward.
  - Live cash completion logic previously documented calculates base fare from ride estimate and waiting, then derives platform fee from commission and fixed trip fee. This is a separate path, not a shared authoritative pricing function.
  - Driver fare config can be overridden by Remote Config's `platformCommissionRate`, so simulator/Remote Config can diverge from Firestore commission.
- `src/components/driver/DriverEarnings.tsx` blob `bfacf90c6bc81c5a84d4c71009622df3669f20fb` and `src/components/driver/DriverJobs.tsx` blob `173418417b339c4549b8bb75fa2531e17abbba71`:
  - Driver earnings are independently reconstructed from final fare, tip, commission and fixed fee; some fallback paths hardcode 12% or use legacy `commission` percent field.
  - Earnings screens also read `platform_config/global_tiers` and may override/retain tier commission, meaning the displayed net amount is not necessarily tied to the ride's original pricing/fee snapshot.
- `src/components/RidesCommandCenter.tsx` blob `1078ff7c6dd0d9407cddfb5a0c1edeef8fc98915`:
  - Its simulator computes base + distance + time, minimum, vehicle multiplier, surge and surcharge; its saved config includes dispatch/operational fields in the same document.
  - The UI's `commission` percent is converted to decimal `commissionRate`, while `PricingFares` uses a percentage UI and writes the same decimal field.

### Conclusions / blockers
1. There is no single shared fare calculation implementation across passenger, driver and admin simulator paths. The initial canonical config command must not be mistaken for a reconciliation of fare calculations.
2. A trustworthy future ride record needs an immutable pricing snapshot at quote/acceptance (formula version, config version, currency, relevant rates/multipliers/surge, gross fare and component breakdown). Commission/fixed fee should be captured at the point of financial authorization, not recomputed from today's admin settings at settlement.
3. Cash completion must consume server-calculated fare/fee values and explicit collected amount; it cannot accept driver-reported fare, commission, wait seconds, or shortfall as authoritative. Server should derive allowable wait/shortfall from ride events and validated policy.
4. Before finalizing config schema, enumerate and agree the fare formula (distance/time source, rounding stage, min fare placement, category multipliers, surge, priority, waiting, tips, cancellation and statutory surcharges). Existing UIs demonstrate differing calculations and cannot establish a safe single formula.
5. The immediate safe coding step is therefore a narrowly versioned **configuration storage/validation command**, not a new fare calculator or cash settlement endpoint. Keep financial activation blocked until formula/snapshot and ride lifecycle are reconciled.

### Status
- Section 137 is documentation only; no source code, tests, route, UI, rules, or pricing values changed.
- No unit tests, emulator, typecheck, build, or CI were run in this step.
- Next: trace all completion/settlement fee paths and identify whether any immutable fare/commission snapshot already exists; then implement the isolated config command with explicit legacy field mapping and versioning.


## Section 138 — Cash completion has repeatable client-side fee writes and passenger-side acknowledgement; no immutable fee snapshot was found in the inspected paths

### Exact integration-branch evidence
- `src/components/driver/DriverTerminal.tsx` blob `40db85db97f62c425787fd64b77ea241d3dd8eb8`:
  - `handleCashPayment(forceComplete)` calculates `baseFare = fareEstimate/vehicleSubtotal + waitFare`, `totalFare = baseFare + tip`, and `platformFee = baseFare * current fareConfig.commissionRate + fixedTripFee` in the browser.
  - Short collection writes `awaiting_cash_confirm`, `reportedCashCollected`, and `reportedCashDiscrepancy` directly to `ride_requests`; force completion uses a client-held reason and the same handler.
  - Completion writes ride `finalFare`, `platformFeeOwed`, paid-wait seconds, reported collection/discrepancy and a client-side `pendingChargesApplied` marker; it separately increments `users/{driverUid}.pendingPlatformFees`. A repeated invocation can re-run the balance increment; the marker is not a server-enforced idempotency key.
  - A Firestore listener seeing `cash_confirmed` while local ride state is completed calls `handleCashPayment(true)` again, confirming a repeat-trigger path.
  - The displayed commission uses whichever current config/Remote Config override is in component state, not a persisted ride-specific rate.
- `src/components/passenger/PassengerBooking.tsx` blob `ef0fc1e0c03d777cd460863241a86b2c54d318ec`:
  - Passenger acknowledgement directly changes ride status to `cash_confirmed`; if a reported discrepancy exists, it applies passenger-side pending charge data from the client.
  - The passenger UI can transition `awaiting_payment` or `awaiting_cash_confirm` to `completed` in its local transition helper; status progression is not a server-authorized financial command.
- `src/server/tripPaymentAuthorization.ts` blob `979287a17a7537362fc9b59a8d7f2535f02f9292`:
  - Card checkout calculates a fixed 12% fee on effective base fare in this path, independently of admin `commissionRate`, and does not establish the cash ride's fee snapshot.
- `src/server/driverPayoutOrchestration.ts` blob `144ab708d22c816929cb1ab57dfeb128ccede112`:
  - Payout metadata carries a commission value/rate at payout time; it is not proof that the originating ride's commission and fee were frozen when the ride completed.

### Required financial lifecycle
1. Server command should own the terminal transition, calculate/check fare and fee from validated ride inputs and a persisted pricing snapshot, and atomically persist a unique completion operation plus immutable cash receipt/fee ledger entry and ride status.
2. Driver's reported cash amount is an input evidence field, never authority for gross fare, platform fee, or shortfall. Passenger acknowledgement is a separate authenticated transition and must not repeat accrual.
3. Balance aggregation must be idempotent or derived from ledger entries. A client boolean such as `pendingChargesApplied` cannot prevent duplicate fee increments.
4. The ride must bind to a quote/pricing version before dispatch; cash completion must use that snapshot. Config versioning without ride snapshots would still let historical fee calculations drift.
5. Preserve status distinctions (cash due, awaiting passenger acknowledgement, acknowledged, shortfall disputed/force-completion requested, completed) in the server state machine and define allowed actors/transitions explicitly. Never let a timeout in a browser automatically authorize financial completion.

### Status
- Section 138 is documentation only; no code, tests, route, UI, Firestore rules, ledger, or balance changed.
- No tests, emulator, typecheck, build, or CI were run in this step.
- Next: inventory all existing fee/receivable ledger writers and settlement readers, then design one idempotent server cash-completion command with ride snapshot and reconciliation against legacy pending balances.


## Section 139 — Platform-fee settlement still has no Stripe-bound fulfillment; the sandbox confirmation route clears the entire aggregate balance

### Exact integration-branch evidence
- `server.ts` blob `d0d781571a2a1dd28478ca92930f4f9b919bf38a`:
  - `POST /api/driver/settle-fees` derives driver UID from verified auth, but accepts a body `amount` fallback (including default £9.75) and falls back to that amount if Firestore read fails or no document is found. A zero stored balance can also fall through because of `||`.
  - Stripe Checkout metadata contains only `driverId` and `type: fee_settlement`; no settlement operation ID, intent binding, persisted attempt, or exact expected balance/version is recorded. The success URL is amount-based.
  - `POST /api/driver/confirm-fee-settlement` is sandbox-only behind non-production and `ALLOW_MOCK_PAYMENTS=true`; it reads the current aggregate pending balance and unconditionally writes `pendingPlatformFees: 0`. It does not verify a Stripe Session/PaymentIntent, paid status, currency, amount, settlement ID, or balance version.
  - No corresponding fee-settlement fulfillment handler was found in the previously inspected shared webhook path (Section 126). Consequently a genuine card success has no verified server-side settlement ledger/clear operation.
- Existing `pendingPlatformFees` writes found in repository search are the client-side cash accrual increment and the server sandbox zeroing path; no dedicated fee receivable ledger writer was surfaced by the targeted searches. Search is not a complete proof of absence, but the aggregate balance is not currently backed by a demonstrated immutable per-ride fee ledger.

### Required settlement redesign
1. Create a server-owned settlement attempt against an exact ledger-derived outstanding balance and unique settlement ID; persist it before redirecting to Checkout.
2. Bind Checkout metadata and/or `client_reference_id` to the persisted attempt, validate exact GBP amount and Stripe-paid status in webhook fulfillment, and make fulfillment idempotent.
3. Reconcile settlement against fee ledger entries (or an explicit versioned balance snapshot) so fees accrued after Checkout creation remain outstanding; never clear the entire current aggregate on an old session success.
4. Remove the amount/default fallback. If the server cannot read the trusted balance, fail closed and do not create a Checkout Session.
5. Retire the sandbox clearing endpoint and success UI that can report success despite a failed backend confirmation. Sandbox simulations must use separate non-financial records and must never mutate the real fee receivable balance.

### Status
- Section 139 is documentation only; no route, webhook, client, ledger, or balance changed.
- No tests, emulator, typecheck, build, or CI were run in this step.
- Next: inspect Stripe webhook registration/dispatch and existing payment-intent ledger conventions, then define settlement attempt + fee ledger schemas and idempotent webhook behavior.


## Section 140 — Stripe webhook has a generic payment-intent binding gate, but fee settlement is not a recognized fulfillment type; existing ledger is job/escrow oriented

### Exact integration-branch evidence
- `server.ts` blob fetched from `integration/pr-consolidation-20261109`, webhook route `POST /api/webhook`:
  - Every paid `checkout.session.completed` is required to carry `metadata.intentId` and `client_reference_id`; the corresponding `payment_intents/{intentId}` must exist and pass `evaluateCheckoutIntentBinding` (user, session ID, mode, exact amount, currency, optional PaymentIntent ID, and allowed intent status).
  - A binding mismatch marks the intent `review_required` and fails fulfillment. A pending Session-ID binding is deliberately retryable.
  - The subsequent type-specific fulfillment chain handles Video Pro, Exclusive Leads, Gold Driver, Gotham SaaS, and membership/subscription branches. No `fee_settlement` branch was found in that chain; the driver fee Checkout creator found in the same server file still creates a card Session with only `driverId` and `type: fee_settlement`, without an intent ID/client reference. It therefore cannot pass the common paid-session binding gate.
  - The webhook's unpaid `checkout.session.completed` path marks the event completed/skipped rather than waiting for `checkout.session.async_payment_succeeded`; Section 125 records the separate async-payment event gap.
- `src/server/paymentLedger.ts`:
  - `LedgerEntry` is typed for `ESCROW_DEPOSIT | ESCROW_RELEASE | PLATFORM_COMMISSION | REFUND | RIDE_PAYMENT`, with minor-unit amount, platform fee, net payout, currency, payer/payee, status and idempotency key.
  - The engine uses `payment_ledger` and `payment_idempotency` for escrow/release and other payment operations. No dedicated fee-receivable/fee-settlement entry type or settlement allocation contract appears in this interface.
- `src/server/checkoutIntentIntegrity.ts`:
  - The shared binding helper is generic and could validate a properly persisted fee settlement intent, but its current accepted intent states and Session fields do not themselves prove that a fee receivable was allocated or settled.

### Conclusions / design constraints
1. Do not bolt a fee-settlement branch onto webhook metadata alone. First persist an immutable settlement attempt and exact allocation of outstanding fee ledger IDs/amounts; then create a `payment_intents` record using the existing binding contract and set Stripe metadata to the attempt ID/type.
2. Extend the financial ledger model deliberately (fee accrual/settlement allocation or a separate receivable ledger with clear accounting semantics); do not mislabel driver fee debt as `RIDE_PAYMENT` or `PLATFORM_COMMISSION` escrow proceeds.
3. Webhook fulfillment must transactionally verify the claim token, bound intent, paid Session, GBP exact amount, settlement attempt state, and the exact fee allocations; write a unique fulfillment marker and settlement entries. Replay must return the existing effect, not clear a current aggregate.
4. Add `checkout.session.async_payment_succeeded` / failed handling only with the same intent/attempt binding and payment verification; avoid marking an unpaid event terminal before a later successful payment can be reconciled.
5. The generic Checkout intent gate is a reusable security boundary, not proof that all current Checkout creators comply. Inventory each creator against the required persisted intent and fulfillment handler before claiming end-to-end payment integrity.

### Status
- Section 140 is documentation only; no webhook, intent, ledger, settlement, route, client, or balance changed.
- No tests, emulator, typecheck, build, or CI were run in this step.
- Next: enumerate all `payment_intents` creators and their metadata/type branches, then define a narrow fee receivable/settlement schema and tests before changing live financial code.


## Section 141 — Payment-intent inventory: generic checkout creates bound records; taxi and driver fee Checkout remain outside that contract

### Exact integration-branch evidence
- `server.ts` has one generic `/api/create-checkout-session` intent creation flow:
  - Creates `payment_intents/{chk_intent_*}` before Stripe Session creation, storing authenticated `userId`, server-resolved metadata/mode/amount and pending status.
  - After Session creation, persists `checkoutSessionId`, Session currency, PaymentIntent ID and `session_created` status. The webhook later validates this exact record (Sections 140 and 125).
  - The generated ID currently uses timestamp + Math.random rather than a cryptographically random identifier; Firestore document uniqueness prevents collision overwrite only if collision handling is explicit. Review this separately before broadening its use.
- Separate `/api/rides/create-trip-payment` calls `executeCreateTripPaymentCommand`; Section 119–123 established that this flow does not create a `payment_intents` record or a ride-payment ledger entry and has no taxi fulfillment branch.
- Separate `/api/driver/settle-fees` creates Checkout directly and records only `driverId` + `type: fee_settlement`; no payment intent or settlement attempt.
- `/api/create-setup-session` is a Setup-mode flow (not a paid checkout fulfillment) and should not be counted as a payment-intent creator.
- Search results also show `payment_intents` reads in webhook/verification paths, but the branch-specific server source inspection surfaced the generic Checkout creator as the only writer of the collection. Repository-wide search is default-branch indexed and may be stale; this is a scoped finding, not a claim that every other file/branch has no writer.

### Conclusions
1. Keep the generic intent contract as the baseline for future fee settlement, but do not assume the existing fee/taxi routes inherit it.
2. Introduce a dedicated server command for fee settlement: derive driver identity, read ledger-backed outstanding entries, atomically reserve exact entry IDs/amount/version, create persisted attempt and bound payment intent, then create Checkout. Fail closed if any trusted read or Stripe call fails; compensate a stranded attempt without releasing already-settled fees.
3. Reconcile generic intent ID generation and failed Session creation cleanup before using the route for high-value receivable settlement.
4. No current change to generic Checkout or the fee/taxi routes is justified until fee accrual/ledger and settlement-allocation semantics are agreed and tested.

### Status
- Section 141 is documentation only; no route, intent, Stripe session, ledger, or user balance changed.
- No tests, emulator, typecheck, build, or CI were run in this step.
- Next: review `PaymentLedgerEngine.recordEscrowFunding` and transaction/idempotency semantics alongside the existing webhook fulfillment markers; then specify precise fee receivable entries, reservation state transitions, and reversal/retry behavior.


## Section 142 — Ledger engine review: release is transactionally written, escrow funding is not; idempotency lease is separate from the financial mutation

### `src/server/paymentLedger.ts` findings (integration branch)
- `LedgerEntry` uses integer minor units and explicit currency, but `createdAt` is an ISO string (not Firestore Timestamp). The type set remains escrow deposit/release, platform commission, refund, ride payment; no driver-fee receivable or settlement allocation type.
- `recordEscrowFunding` wraps its work in `executeIdempotentOperation`, but milestone read/transition/update and ledger `.set()` are separate operations—not one Firestore transaction. A crash after milestone update but before ledger write (or vice versa) can leave a split state. The idempotency lock is in `payment_idempotency`, but it does not atomically include the business writes.
- `releaseEscrowFunds` does use one Firestore transaction for job/quote/milestone and ledger release entry, then dispatches the domain event after commit. Stripe transfer is intentionally a separate post-commit side effect with deterministic Stripe idempotency key and persisted outcome/reconciliation path.
- `executeIdempotentOperation` fences completion/cleanup by claim token and rejects concurrent live claims; however, its executor runs outside the idempotency transaction. A stale takeover may overlap a still-running external executor. This is safe only when the financial effect itself is independently transactional/idempotent (release's operation ID/transaction checks help; funding's split writes are weaker).
- Existing `tests/unit/paymentLedger.test.ts` cover amount validation, 12% arithmetic, a simplified idempotency replay, operation-key mismatch, and stale claim fencing. Its mock DB does not model real Firestore transaction conflict/retry semantics or atomic multi-document commits; no emulator evidence is available.

### Implications for fee-receivable design
1. Do not implement cash-fee accrual by calling `executeIdempotentOperation` around independent aggregate increments. Use a Firestore transaction with immutable fee entry ID, source ride/completion ID, driver, exact pence/currency, policy version/rate, and unique source idempotency key.
2. Fee settlement must transactionally reserve a specific set of outstanding fee entries (or a fixed ledger cursor/version), create the attempt + allocations + payment intent binding, and reject overlapping active reservations. Keep fees accrued after reservation outside the attempt.
3. Verified paid webhook should atomically mark only those reserved entries settled and create a unique settlement marker; never write `pendingPlatformFees = 0` as a substitute for ledger reconciliation.
4. Preserve external Stripe calls outside Firestore transactions. Use deterministic Stripe idempotency keys, explicit attempt states, and retry/reconciliation records for failures between Stripe Session creation and persistence.
5. Add Firestore emulator concurrency/fault-injection tests for funding, reservations, webhook replay, claim takeover, and late fee accrual; unit mocks alone cannot establish these invariants.

### Status
- Section 142 is documentation only. No ledger engine, fee, payment, payout, or balance code changed.
- No tests, emulator, typecheck, build, or CI were run.
- Next: trace cash ride completion writes and identify a single trusted source event for fee accrual; then design an idempotent accrual command and schema before implementing settlement.


## Section 143 — Passenger cash acknowledgement directly mutates ride and driver balance; repeated client actions are not an accrual authority

### Integration-branch source trace
- `src/components/passenger/PassengerBooking.tsx`, cash remainder confirmation:
  - Passenger client directly updates `ride_requests/{rideId}.status = cash_confirmed`.
  - It reads the same ride client-side and checks `pendingChargesApplied`, then increments `users/{driverUid}.pendingCharges` by the driver's reported discrepancy and updates the ride to `completed` with `pendingChargesApplied: true`.
  - The no-remainder branch directly writes completed/paymentMethod/finalFare/reported cash fields and sets `pendingChargesApplied: true`.
  - It then performs an additional `dummyCheckForCloseBracketHack` ride update. These are multiple client Firestore writes, not a single trusted command/transaction; the check-then-increment is raceable and not protected by a server idempotency key.
- `src/components/driver/DriverTerminal.tsx`, ride listener:
  - When the ride snapshot reports `cash_confirmed` while local `rideState === "completed"`, it calls `handleCashPayment(true)` again. The listener is therefore a second potential completion/metric/fee side-effect path, not merely display state.
- This corroborates Sections 127–129 and 138: both passenger and driver clients participate in completion and aggregate mutation; there is no canonical server cash-completion event whose immutable fee entry is exactly-once.

### Required remediation boundary
1. Replace passenger multi-write confirmation and driver listener side effects with one authenticated server command (derive passenger/driver from ride record; enforce assigned participants and permitted ride state).
2. In one Firestore transaction, claim a unique ride-completion/cash-confirmation operation, validate driver-reported cash and passenger acknowledgement, finalize immutable ride fare/cash fields, and write one fee-receivable entry from server-authoritative commission policy. Never increment a mutable balance as the ledger source of truth.
3. Make listener/UI state-only; duplicate snapshots must not execute financial writes. Any derived balance is a projection of fee ledger entries.
4. Handle partial cash, zero remainder, disputes, cancellation, and late acknowledgement with explicit states; do not equate passenger acknowledgement of a discrepancy with Stripe payment or debt settlement.
5. Add concurrent duplicate confirmation and forged participant/amount tests using Firestore emulator; verify no double accrual and no client writes to protected financial fields in rules.

### Status
- Section 143 is documentation only; no passenger/driver UI, Firestore rules, server route, ride status, or balances changed.
- No tests, emulator, typecheck, build, or CI were run.
- Next: inspect Firestore rules for `ride_requests` and `users.pendingCharges` write permissions to quantify whether the client path is currently executable, then implement a server-only completion command behind a safe rollout.


## Section 144 — Firestore rules block the passenger cash-confirmation and pending-charge client writes (verified branch source)

### Rules evidence: `firestore.rules` on `integration/pr-consolidation-20261109`
- Passenger `ride_requests` updates are limited to non-financial keys and, when changing status, only `cancelled` or `draft` from pending/searching/offered/draft. `cash_confirmed` and `completed` are not allowed by that passenger branch.
- Driver `ride_requests` updates are allowlisted to `status`, `location`, `updatedAt`; final fare, discrepancy, completion timestamp, payment method and related financial fields are not permitted.
- `users/{userId}` owner update allowlist does not include `pendingCharges` or `pendingChargesReason`. Admin bypass is separate and does not apply to ordinary passenger confirmation.
- Therefore the passenger UI sequence identified in Section 143 is not merely raceable: ordinary client writes to `status: cash_confirmed`, `status: completed`, and driver `pendingCharges` are rejected by these rules. Its catch/log behavior can leave the user believing confirmation succeeded while the financial writes did not. The UI and deployed rules are inconsistent.
- This is a source-level rules evaluation; no Firebase emulator request was executed. Existing deployed rules may differ from this integration branch and are not asserted here.

### Remediation
1. Do not loosen client rules to permit these financial/status fields. Preserve the deny-by-default boundary.
2. Route acknowledgement through a server command callable by the authenticated passenger; server verifies ride identity/participants, assigned driver, state and reported values, and performs one transaction.
3. UI must await server success and display failure explicitly; remove direct `pendingCharges` increment and the dummy close-bracket write.
4. Add emulator tests proving passenger/driver direct writes are denied and the trusted command succeeds exactly once; separately test current UI's rejected writes and error presentation.

### Status
- Section 144 is documentation only; Firestore rules and UI remain unchanged.
- No emulator, tests, typecheck, build, or CI run.
- Next: inspect the driver's `handleCashPayment` implementation and the existing trusted ride command pattern, then specify a server cash-finalization command that can replace both client flows safely.


## Section 145 — Driver cash handler itself writes fee aggregate, rider debt and metrics from client; force-completion bypasses acknowledgement

### `src/components/driver/DriverTerminal.tsx` trace
- `handleCashPayment(forceComplete)` derives fare from client state/config (`fareConfig`, distance, duration, wait seconds, tip); uses `activeRide.fareEstimate` when present and computes platform fee from client commission/fixed-fee config.
- On short cash without force, it writes `awaiting_cash_confirm`, reported cash and discrepancy directly to ride, then waits for passenger snapshot.
- On normal/forced completion it writes `completed`, `finalFare`, `platformFeeOwed`, cash amounts, `pendingChargesApplied`, force reason and timestamp to ride directly.
- It separately increments passenger `users.pendingCharges` for discrepancy (or clears it to zero in the alternate branch), increments driver `users.pendingPlatformFees` and mileage, and increments driver daily earnings/jobs metrics. These effects are not one transaction and no immutable per-ride fee record is created.
- `isAlreadyApplied` is a client-side snapshot check of `pendingChargesApplied`; it only gates one passenger increment, not driver fee accrual, mileage, metrics, or ride completion. Repeated handler calls/listener snapshots can repeat those other effects.
- `forceComplete` lets the driver proceed without passenger acknowledgement; the reason is client-provided state. It is not an authorized server dispute/override decision.
- Rules from Section 144 deny these ride/user writes for ordinary driver clients, so this implementation is inconsistent with current branch rules as well as unsafe as a financial authority.

### Design decision
- Driver must submit a completion proposal (reported cash, wait, force reason) to server; server calculates/validates amount using persisted trip inputs and versioned pricing policy, authorizes any forced/disputed completion, and records a stable ride operation ID.
- Passenger acknowledgement is a distinct state/command. Acknowledgement confirms reported discrepancy only; it must not create a Stripe payment or erase debt.
- Transaction should finalize ride and create one fee receivable entry keyed to ride completion, then update only derived projections/outbox. Earnings metrics must be idempotent projections or outbox consumers, not independent increments from UI.
- Zero/partial cash and dispute paths need explicit state machine and reconciliation; no clearing rider debt aggregate to zero without itemized debt settlement evidence.

### Status
- Section 145 is documentation only; no driver UI, rules, pricing, ride, metrics, or financial data changed.
- No tests, emulator, typecheck, build, or CI were run.
- Next: inspect existing server command patterns for authorization, idempotency and transaction write discipline; select a reusable implementation shape for a ride cash-finalization command.


## Section 146 — Existing trusted ride command pattern: server derives driver identity and atomically claims ride + driver status

### `src/server/driverAuthorization.ts` / `executeAcceptRideCommand`
- The established pattern accepts a verified caller object and a narrow command body; it rejects a supplied `driverId` that differs from caller UID.
- Inside one Firestore transaction it reads the caller's `users` profile, checks authoritative driver role/activity/approval, reads the ride, validates available state/no prior assignment/not passenger self-claim, then writes assigned driver/status and `driver_status` busy/currentRideId.
- It dispatches `RIDE_ACCEPTED` after the transaction. The command is exposed from `server.ts` via an authenticated backend route (route source should be rechecked when implementing).
- This is a useful structure for cash completion: caller identity from auth, narrow validated payload, transaction reads before writes, persisted ride state as authority, and one atomic multi-document state transition. It is not itself a financial idempotency template: acceptance's transaction guards availability, whereas cash completion needs a stable operation ID and unique immutable ledger entry.

### Cash command shape recommended (design only)
- `POST /api/rides/:rideId/cash-completion` or an equivalent typed route; caller role/participant determined from Firebase token + persisted ride.
- Driver proposal command: reported cash, wait seconds, optional force/dispute request (not client fare or commission). Server validates allowed status and computes fare from canonical server pricing/ride snapshot.
- Passenger acknowledgement command: acknowledge exact discrepancy snapshot/version; cannot supply or alter amount.
- Finalization transaction: read ride, user profiles/config needed, operation marker and fee ledger key; reject stale proposal/duplicate or return prior result; write finalized ride, immutable fee receivable, and outbox/projection marker atomically. Keep any required reads before writes per Firestore transaction constraints.
- If driver and passenger commands are separate, preserve explicit states (proposed → acknowledged or force-review → finalized); do not let a driver command silently impersonate passenger acknowledgement. A privileged force path requires server authorization/audit, not just a reason string.
- Rollout prerequisite: reconcile Firestore rules with server-only fields, remove direct UI financial writes, and use emulator tests to verify participant authorization, race/replay behavior, and no client bypass.

### Status
- Section 146 is documentation only; no command route, pricing logic, UI, rules, or financial records changed.
- No tests, emulator, typecheck, build, or CI were run.
- Next: inspect canonical pricing resolver and ride config types to establish which fare inputs can be safely captured/validated server-side without importing driver UI state.


## Section 147 — Cash pricing inputs are not currently a single server-authoritative snapshot

### Integration-branch evidence
- DriverTerminal local `fareConfig` defaults: base £3.50, distance £1.30/mile, time £0.15/min, wait £0.25/min, minimum £5, commission 12%; values are hydrated from `platform_config/rides`.
- Commission is additionally overridden by Remote Config `platformCommissionRate` when present; fixed trip fee and surge options are separately hydrated. UI uses `Number(value) || default`, so explicit zero values are replaced by defaults.
- Cash handler computes vehicle subtotal as `max(minFare, baseFare + distance*distanceRate + duration*timeRate)`, then adds wait and tip; however, it prefers `activeRide.fareEstimate` when present. It computes platform fee on base fare (excluding tip) plus fixed trip fee, but no canonical server pricing snapshot/version is persisted by this handler.
- Passenger and driver UI can have different cached config snapshots; Remote Config and Firestore can disagree. Existing earlier Section 137 already records driver simulation omits time and the broader formula divergence.
- `resolveAuthoritativeLineItem` in `src/server/pricingCatalog.ts` is designed for product/subscription/milestone checkout; it is not a taxi-fare resolver and should not be reused as one without a separate ride-specific contract.

### Consequence / prerequisites
1. Before server cash finalization, define a ride pricing policy/schema with explicit units (GBP decimal inputs vs integer pence output), policy version, fare components, commission basis, fixed fee and surge handling.
2. At ride creation/acceptance, persist authoritative pricing snapshot or enough immutable inputs to recompute (distance/time source, stops, wait, tier/commission eligibility, tip and applied surge). Define whether the quoted fare is guaranteed or final meter fare.
3. Server must reject non-finite/negative values and avoid truthy fallbacks for valid zero policy values. Calculate in integer pence with documented rounding at each component.
4. Reconcile passenger quote, driver meter, completion, card Checkout (12% hardcoded path), payout (88% base + 100% tip), and fee accrual against one explicit versioned contract before replacing cash handler.
5. Treat remote/admin pricing changes as prospective policy versions; never retroactively recalculate already-finalized rides without a ledger adjustment.

### Status
- Section 147 is documentation only; no fare config, Remote Config, pricing, ride, or ledger data changed.
- No tests, emulator, typecheck, build, or CI were run.
- Next: trace ride creation and checkout/payout calculations to specify exact persisted pricing fields and rounding, then draft one canonical TaxiPricingPolicy schema with fixtures.


## Section 148 — Ride Checkout and payout use incompatible fare/fee contracts

### Card Checkout (`src/server/tripPaymentAuthorization.ts`)
- Reads ride from `ride_requests` (fallback legacy `rides`) and authorizes passenger, assigned driver, or admin.
- Base amount is selected from `finalFare ?? fare ?? estimatedFare ?? totalFare ?? price`; it does not include `fareEstimate`. This makes precedence important and a fallback to legacy fields possible when finalFare is absent.
- Tip is accepted from request body, sanitized to £0–£500, and added to Checkout total; thus it is not strictly read from an immutable ride snapshot.
- Platform fee is hard-coded at 12% of effective base fare, rounded to pence; tip is excluded. This diverges from configurable driver commission/fixed trip fee and payout tier logic.
- Checkout creates a Connect destination payment with amount in integer pence; this route does not itself finalize ride payment or create a canonical payment-intent/fee ledger entry (previous sections 119–140).

### Driver payout (`src/server/driverPayoutOrchestration.ts`)
- Requires protected `ride.finalFare` > 0; explicitly refuses client-editable fareEstimate fallback.
- Tip is read from ride `tipAmount`, then driver earnings are calculated with tier/commission logic; prior trace establishes 88% base + 100% tip at standard 12%, and gold tier/overrides can change commission.
- Payout records platform commission separately and writes payout completion only after Stripe transfer succeeds (transaction checks claim token); earlier sections note claim acquisition and ledger reconciliation concerns.

### Reconciliation conclusion
- Checkout: base `finalFare` + request tip; fee = fixed 12% of base.
- Payout: ride `finalFare` + persisted tip; driver net uses effective tier commission, platform fee is payout-derived.
- Cash: UI fare estimate/config + wait + tip; fee uses UI commission/fixed fee and can differ from Checkout/payout.
- These paths can disagree on tip source, commission rate, fixed fee, and fare authority. A cash command cannot safely be implemented by copying any one path.

### Required contract before implementation
- One finalized ride snapshot: `baseFarePence`, `tipPence`, `totalFarePence`, `pricingPolicyVersion`, `commissionRateBps`, `platformFeePence`, `driverEarningsPence`, source/measurement and finalization timestamps.
- Checkout must consume that snapshot (including persisted tip) rather than client tip; payout must use exactly the same base/tip/commission snapshot; cash receivable accrual must share its fee basis.
- If policy/tier differs by payment mode, represent it explicitly in versioned policy and snapshot; don't hardcode 12% in Checkout.
- Migration/reconciliation for legacy rides must fail closed or use an auditable admin repair command; never silently select estimated/client-editable fare.

### Status
- Section 148 is documentation only; checkout, payout, cash, Stripe, and ledger code untouched.
- No tests, emulator, typecheck, build, or CI run.
- Next: trace fee tier resolution and rounding/pence conversions to see whether payout has a reusable pure calculator; document extraction before any shared calculator implementation.


## Section 149 — Payout calculator is inline and entitlement-driven; cash fee must not infer tier from UI

### Exact payout math (`src/server/driverPayoutOrchestration.ts`)
- Gold commission is applied only when persisted `isGoldDriver === true`, a non-empty `driverSubscriptionId`, and `driverSubscriptionStatus === "active"`; otherwise `PLATFORM_COMMISSION_RATE`.
- Inputs are `ride.finalFare` and `ride.tipAmount`, converted from GBP decimal to integer pence using `Math.round(value * 100)`.
- Driver base earnings are rounded once: `round(basePence * (1 - commissionRate))`; tip pence are added in full. Platform commission is the residual `basePence - driverBaseEarningsPence`, ensuring base split reconciles exactly in pence.
- This is an inline worker calculation rather than an exported reusable pure calculator. It also reads driver entitlement and ride data in worker orchestration, so extracting math must keep eligibility/authorization outside the pure function.
- Payout validates fare >0, fare ≤£500 and tip ≤£200; Checkout's tip cap is £500. These are not a common ride-level contract.
- No equivalent persisted pricing/commission snapshot is required on ride before payout; effective tier is resolved at payout time. That means entitlement changes between ride completion and payout can alter split unless snapshotting is introduced.

### Proposed extraction boundary (not implemented)
- Pure `calculateRideSplit({baseFarePence, tipPence, commissionRateBps})`: validate safe integers/ranges; return driver base, tip, total payout, platform commission. No Firestore, Stripe, or tier lookup.
- Separate policy resolver determines commission rate from trusted driver entitlement and policy version; completion snapshots the rate and amounts. Payout consumes the snapshot and verifies Stripe collected amount matches base+tip.
- Add unit fixtures for standard/gold rates, £0.01 rounding, tips, caps, invalid NaN/Infinity/negative and reconciliation identity: driver base + platform fee = base fare pence; payout = driver base + tip.
- Add integration/emulator tests for entitlement changes after completion, duplicate payout, and fee ledger matching.

### Status
- Section 149 is documentation only; payout implementation unchanged.
- No tests, emulator, typecheck, build, or CI run.
- Next: inspect payment verification requirements in payout and ledger writer fields to map how one ride snapshot can match collected Stripe amount, payout transfer, and platform receivable without double counting.


## Section 150 — Payout proof checks collection, but exact overpayment and canonical ride ledger are unresolved

### Collection reconciliation in payout worker
- Stripe path retrieves `ride.stripePaymentIntentId || ride.paymentIntentId`; requires GBP and PaymentIntent `succeeded`, then checks `amount_received >= baseFarePence + tipPence`. It accepts over-collection rather than requiring exact match; `verifiedCollectedPence` is recorded in local flow but does not establish a fee receivable/settlement allocation.
- Fallback ledger query requires `transactionId` match (PI or `ride_<id>`), `type == RIDE_PAYMENT`, captured/completed, GBP and amount ≥ expected. It is structurally sound as a fail-closed type filter but previous source search found no canonical writer producing such RIDE_PAYMENT entries for taxi checkout.
- When proof fails, payout is refused and ride gets `rejected_unverified_payment`; the worker does not itself create the missing collection proof.
- A verified collected amount does not establish the platform fee was recognized, allocated, or settled. Stripe Connect destination transfer and platform fee are separate financial legs; the platform's receivable needs its own durable lifecycle.

### Accounting implications
- Card ride: customer collection (base+tip) → driver transfer (net base+tip) + platform fee (base residual). Fee may be retained via Stripe application fee or platform balance mechanics; actual checkout configuration must be verified and ledgered, not assumed from metadata.
- Cash ride: customer cash to driver → platform fee receivable from driver → later driver settlement. No Stripe collection for ride fare; fee accrual must be independent of payment verification used by card payout.
- Avoid treating `payment_ledger RIDE_PAYMENT` as proof of cash fee settlement. Separate types/entries: ride collection, platform fee receivable/accrual, driver fee settlement, Stripe transfer, refund/adjustment, with ride and operation linkage.

### Required controls
1. Require exact expected collected amount or explicitly support adjustment/refund with reason and ledger record; define how overpayment is handled.
2. Use one immutable ride snapshot to calculate expected collected amount and split; store source PaymentIntent/Checkout Session binding.
3. Create ledger rows in same transaction as local finalization or use durable outbox + idempotent consumer; Stripe external effects require intent/attempt and webhook proof.
4. Add reconciliation report for rides with payment proof but no collection ledger, fee receivable without settlement, and payout transfer without matching ride snapshot.

### Status
- Section 150 is documentation only; no payout, Stripe, ledger, or ride changes.
- No tests, emulator, typecheck, build, or CI run.
- Next: inspect PaymentLedgerEngine's idempotency/entry model and Stripe Checkout Connect configuration to establish the proper distinct ledger entry types and transaction boundary.


## Section 151 — PaymentLedgerEngine schema has no driver fee receivable or settlement allocation

### `src/server/paymentLedger.ts` review
- `LedgerEntry` is a single row shape: transaction/idempotency IDs, payer/payee, `amount`, `platformFee`, `netPayout`, currency, status and createdAt.
- Allowed types are `ESCROW_DEPOSIT`, `ESCROW_RELEASE`, `PLATFORM_COMMISSION`, `REFUND`, and `RIDE_PAYMENT`. There is no explicit `DRIVER_FEE_RECEIVABLE`, `DRIVER_FEE_SETTLEMENT`, `STRIPE_TRANSFER`, `CASH_RIDE_COLLECTION`, or adjustment/allocation type.
- The generic idempotency helper claims in a transaction, executes the supplied callback outside that transaction, and then marks the claim completed in a separate transaction. It can fence claim completion, but it does not make callback financial writes atomic with the claim; prior Section 142 covers lease takeover/concurrency implications.
- Existing escrow funding writes milestone and ledger separately (previous section 142), reinforcing that the engine is not a general atomic journal yet.
- A `PLATFORM_COMMISSION` label alone cannot distinguish fee earned/accrued from fee actually settled/received; `RIDE_PAYMENT` represents collection proof, not the driver debt balance.

### Accounting model required for taxi
- Immutable per-ride fee accrual row: rideId, completionOperationId, driverId, feePence, currency GBP, policyVersion, fee basis and status `receivable`; unique key on ride + completion operation.
- Settlement allocation row(s): settlementAttemptId, receivable entry IDs/amounts, verified Stripe PaymentIntent/Checkout Session or cash evidence, settledPence, remainingPence, status. Partial settlement must not clear whole aggregate.
- Separate external transfer/collection evidence from internal receivable and settlement allocation. A Stripe success webhook or verified PI is evidence; client success page is not.
- Keep user `pendingPlatformFees` as derived/cache projection only. Reconcile it to sum of open receivable balances; never use aggregate as source of truth.
- For settlement, atomically reserve/allocate receivables and persist an attempt before Stripe call; fulfill only from verified webhook/Stripe retrieval; release/reconcile failures without dropping debt. Cash settlement is a different evidence route but must allocate the same receivables.

### Status
- Section 151 is documentation only; PaymentLedgerEngine and financial records unchanged.
- No tests, emulator, typecheck, build, or CI run.
- Next: inspect existing `/api/driver/settle-fees` and webhook event handlers together to map current settlement attempt records, evidence and failure recovery, then define migration-safe settlement state transitions.


## Section 152 — Driver fee settlement route has no durable attempt or webhook fulfillment; sandbox clears aggregate debt

### `server.ts` routes verified on integration
- `POST /api/driver/settle-fees` derives driver UID from verified token, but accepts body `amount` as fallback (£9.75) if Firestore read fails; otherwise uses aggregate `users.pendingPlatformFees`. It creates card Checkout for the aggregate, metadata `driverId` and `type: fee_settlement`, amount in GBP pence. It does not persist settlement attempt, receivable allocations, PaymentIntent/client reference binding, or Session ID.
- If Stripe is unavailable in permitted sandbox mode, route returns a sandbox success URL without creating any payment evidence.
- `POST /api/driver/confirm-fee-settlement` is blocked in production and requires `ALLOW_MOCK_PAYMENTS=true`; nevertheless it reads aggregate pending fees and sets `pendingPlatformFees: 0` with no supplied Checkout Session, PaymentIntent, amount/currency verification, or ledger allocation. This destroys the projection balance rather than settling itemized receivables.
- `PlatformFeeSuccess` frontend path was previously traced to call this confirmation even in sandbox, and backend errors do not necessarily prevent a success toast (Section 126).
- Generic `checkout.session.completed` webhook requires persisted generic payment_intents record, exact session binding and client reference. Taxi fee Checkout bypasses that record; webhook has no fee_settlement fulfillment branch (Sections 140/126). Thus a genuine paid fee Checkout has no authoritative settlement allocation/fulfillment.

### Required repair
1. Replace aggregate-only Checkout with persisted `driver_fee_settlement_attempts/{attemptId}`: immutable amount, currency, driver, allocated receivable IDs/amounts, idempotency key, Stripe PI/Session binding, status and timestamps.
2. Amount must be sum of selected open receivables, never client body fallback or hardcoded £9.75; fail closed if authoritative records unavailable.
3. Bind Checkout Session to attempt ID in metadata + client_reference_id and persist returned Session. Add webhook branch that validates exact Session/attempt/driver/amount/currency/payment_status and Stripe PI paid evidence, then transactionally allocates only that attempt's receivables exactly once.
4. Sandbox must use explicit test fixture/evidence and mark only test receivables; it must never zero production-like aggregate balances or report a real settlement.
5. Aggregate pending fees becomes projection from open receivables; failed/cancelled attempts retain debt and allow safe retry. Success UI waits for verified backend result and surfaces failures.

### Status
- Section 152 is documentation only; settlement route, frontend, webhook and user aggregates untouched.
- No tests, emulator, typecheck, build, or CI run.
- Next: examine Stripe webhook event lifecycle/claim retries for the precise event set and failure behavior, then establish an executable phased implementation plan (ledger schema → accrual command → settlement attempt/webhook → projection/UI).


## Section 153 — Stripe webhook retry semantics and missing asynchronous Checkout events

### `server.ts` webhook claim lifecycle
- Signature is verified before event processing. Event claim is stored in `processed_stripe_events/{event.id}` with `status: processing`, server timestamp `claimedAt`, worker ID and random claim token.
- `shouldClaimStripeWebhookEvent` controls replay/stale takeover. Claim ownership is checked before mutations; processing failures return HTTP 500 so Stripe can retry, while completed events are acknowledged.
- `checkout.session.completed` with `payment_status !== paid` is marked completed/skipped and claim token removed. This does not later fulfill an async payment when the same Session becomes paid.
- For paid generic Checkout, missing intent metadata/client_reference_id or absent persisted intent throws; binding pending throws retryable error; mismatch marks intent review-required then throws. This is a strict binding model but excludes fee settlement Checkout which does not persist generic intent.
- Current event branch inspected does not include `checkout.session.async_payment_succeeded` or `checkout.session.async_payment_failed`; no asynchronous Checkout recovery was identified in this handler. Fee settlement additionally has no attempt/fulfillment branch (Section 152).

### Design implications
1. Add supported async Checkout events to same exact attempt binding and idempotent fulfillment path; never treat `completed` unpaid as final for async methods.
2. For fee settlement, bind to dedicated attempt (not generic `payment_intents` if its schema is not applicable); verify Session ID, driver, currency, exact amount, PI status/amount_received, and expected attempt status.
3. Do not mark an event completed until its payment state is either fulfilled or intentionally terminal with a recoverable/reconciliation marker. Unpaid completion must leave a durable pending attempt that async success can advance.
4. Webhook event idempotency and business operation idempotency are separate: multiple Stripe event IDs for one Session must converge on one attempt/receivable allocation.
5. Add retry tests for event order, claim expiry/takeover, duplicate delivery, paid-after-unpaid, and fulfillment crash between transaction and acknowledgement.

### Status
- Section 153 is documentation only; webhook code and event records unchanged.
- No Stripe test events, tests, emulator, typecheck, build, or CI run.
- Next: turn the evidence into a phased implementation checklist with dependency order and acceptance criteria, then start a safe first phase (pure pence calculator + tests) once repository test conventions are checked.


## Section 154 — Reconciliation execution phases and acceptance gates (sequenced)

### Phase A — Pure calculation contract (lowest risk; no persistence)
- [ ] Define `TaxiPricingPolicyV1`: all fare inputs in explicit integer pence/rates basis points; distinguish quoted base, meter adjustment, wait, surge, tip, fixed platform fee and commission basis.
- [ ] Extract pure fare/split functions from UI/worker; no Firebase/Stripe imports or side effects.
- [ ] Fixtures: standard/gold commission; penny rounding; zero fixed fee; tips; wait; min fare; valid zero; NaN/Infinity/negative; £500/£200 caps; component conservation.
- [ ] Acceptance: deterministic outputs and property invariant `driverBasePence + platformFeePence = baseFarePence`; `driverPayoutPence = driverBasePence + tipPence`; all inputs safe integer/finite as specified.

### Phase B — Immutable ride pricing snapshot (server-only)
- [ ] Specify ride creation/acceptance source fields and policy version; snapshot only after trusted source validation.
- [ ] Write schema migration/legacy classification; no backfill from client estimate without explicit reviewed provenance.
- [ ] Protect snapshot fields in Firestore rules and validate server writes.
- [ ] Acceptance: clients cannot mutate; policy changes do not retroactively change completed ride split; legacy rides fail closed/flag for review.

### Phase C — Exactly-once cash finalization and receivable accrual
- [ ] Driver submits proposal; passenger acknowledges exact proposal/version; authorized override has separate server privilege and audit.
- [ ] Server transaction checks participant, ride state, snapshot, proposal operation ID and unique fee-accrual key; atomically finalizes ride + immutable receivable + outbox.
- [ ] Eliminate UI direct ride/user/metrics financial writes and duplicate snapshot handler; UI awaits server response and surfaces errors.
- [ ] Acceptance: replay returns same result; concurrent passenger/driver/override races produce one terminal state/one fee entry; rules deny direct writes; no debt clearing by setting aggregate zero.

### Phase D — Fee settlement attempt and webhook
- [ ] Itemized receivable allocation; persist settlement attempt before Checkout; exact Session/PI/amount/currency/driver binding.
- [ ] Webhook paid and async-success fulfill same attempt idempotently; failed/cancelled retains receivable; sandbox only fixture ledger.
- [ ] Acceptance: replay/multiple event IDs cannot double settle; partial settlement leaves exact remainder; UI success only after verified backend fulfillment.

### Phase E — Projections and reconciliation
- [ ] Rebuild `pendingPlatformFees` from open receivables; metrics from idempotent outbox/event projections.
- [ ] Report card collections lacking ledger, receivables lacking settlement, transfers without snapshot, aggregate drift, duplicate/reversed entries.
- [ ] Acceptance: projection rebuild matches ledger; every financial aggregate has traceable source entries and adjustments.

### Phase F — Tests, rollout and operations
- [ ] Unit tests for pure calculator; Firestore emulator rules/transactions; concurrency/replay; Stripe mocked contract + test-mode webhook fixtures.
- [ ] Run `npm test`, `npm run lint`, `npm run build`, relevant emulator suite, release audit; record exact results and CI links.
- [ ] Deploy rules/backend/UI only after integration CI green; staged migration, monitor, rollback and operator reconciliation runbook. Never modify production financial records as part of test/migration without separately approved controlled procedure.

### Immediate safe next step
Implement Phase A calculator + unit tests on integration branch only. Repository `package.json` defines Vitest, `npm test`, `npm run lint`, and emulator scripts; tests require a real checkout/runtime (GitHub file API alone cannot execute them). Current session can author/commit source and tests, but must not report them passing without execution. The calculator should not be wired into cash/payout routes until its policy contract and fixture review are complete.

### Status
- Section 154 is documentation only; no code, test, financial data or production changes.
- No test/lint/build/emulator/CI execution in this session.
- Reconciliation branch remains integration-only; `main` untouched.



## Section 155 — FIN-04 idempotency binding audit and execution boundary (11 November 2026)

### Current integration-branch evidence
- The branch still points to `0376186214e03afa6c90ecb44cdd4d661e575307`; comparison against the previously recorded HEAD is identical (0 commits ahead, 0 behind). No application changes were made during this review.
- `src/server/paymentLedger.ts` implements `executeIdempotentOperation(db, idempotencyKey, operationName, executor)`. The persisted `payment_idempotency/{idempotencyKey}` record binds only `operationName`, status, timestamps, claim token and cached response. It does not persist or compare authenticated actor, resource identity, destination/account, currency or canonical request payload.
- Existing safeguards are meaningful but narrower: a different operation name is rejected; in-progress requests are rejected during the lease; stale executor completion/deletion is fenced by claim token. Existing unit tests cover operation-name conflict and stale-claim takeover, but not same-operation key reuse across different owners/resources/amounts.
- Production call sites include the driver Stripe payout route and milestone escrow funding/release helpers. For driver payout, the route derives the driver from the URL and checks resource ownership, but the idempotency record does not bind the driver, connected Stripe account or requested amount. A replay under the same key can therefore return a cached result without proving it belongs to the same semantic request.
- The helper runs the executor outside the claim transaction and persists its response only after side effects. This is not an atomic transaction spanning Stripe and Firestore; the claim token fences stale completion but cannot itself resolve an ambiguous external Stripe result. Preserve the separate operation-specific Stripe idempotency key and reconciliation-required behavior.

### FIN-04 implementation contract before editing
1. Add a required, explicit binding object to financial idempotency calls: authenticated actor ID, operation/resource type and ID, canonical target account/destination where relevant, currency, and canonical minor-unit amount or canonical payload hash.
2. Persist a versioned binding fingerprint with the claim. On every replay or takeover, compare the full fingerprint before returning a cached response or executing. Reject missing/invalid binding fields for production financial operations; do not silently fall back to the legacy unbound form.
3. Keep user-supplied idempotency key separate from the fingerprint. Namespace/hash the storage document ID safely; do not expose raw caller keys in paths or logs.
4. Do not treat this helper as a substitute for Stripe's own stable idempotency key, durable operation records, or reconciliation of ambiguous Stripe outcomes. Preserve existing claim-token fencing.
5. Add regression tests for same key + same operation but different actor, resource, destination, amount, currency, payload, plus exact replay, expired-claim takeover, and stale executor completion. Update every production call site and relevant tests together.

### CI checkpoint
- Rechecked the recorded branch HEAD: the compare endpoint reports no delta from `0376186214e03afa6c90ecb44cdd4d661e575307`.
- Commit-associated workflow lookup returned no PR-triggered workflow runs, and the combined commit status returned no status records. This does not prove that no push-triggered Actions run exists; the available commit-run wrapper is explicitly PR-triggered-only. CI run #889 therefore remains unverified, not passed.
- GitHub's available repository tooling in this session does not expose a general list-workflow-runs-by-branch operation. Do not infer a result from the empty PR-only response.

### Status and next action
- Section 155 is a source audit and plan update only. No application code, test, Firebase data, Stripe object, deployment, or production configuration was changed.
- Next safe code change: implement FIN-04 binding with required context at the helper and all production call sites, then add the cross-owner/resource/amount/currency replay tests. Run the focused Vitest file, full lint/build and the integration CI workflow before marking complete.
- Keep all writes on `integration/pr-consolidation-20261109`; do not create branches, merge, deploy, or modify `main`.


## Section 156 — FIN-04 call-site and test-fixture audit (11 November 2026)

### Verified source locations on the integration branch
- `src/server/paymentLedger.ts` contains three production entry points using the generic helper:
  - `recordEscrowFunding` calls `executeIdempotentOperation` with `FUND_MILESTONE_ESCROW`. The semantic request includes job ID, milestone ID, customer ID, trader ID, verified minor-unit amount, currency and Stripe PaymentIntent ID.
  - `releaseEscrowFunds` calls it with `RELEASE_MILESTONE`. The semantic request includes authenticated UID, job ID, quote ID, milestone ID and QR/admin authorization mode; the release amount and payee are resolved from persisted job/quote/milestone state inside the executor.
- `server.ts` contains the driver payout route call at approximately line 3621. It checks `assertResourceOwner(user, driverId)` before calling the helper, but reads the connected Stripe account and calculates the final payout amount inside the executor after the generic claim is acquired. The binding therefore must be constructed from server-verified data before a cached replay can be returned; amount selection (explicit requested amount versus full available balance) needs a deliberate canonical policy. Do not bind a client-supplied amount without server-side normalization and validation.
- `tests/unit/paymentLedger.test.ts` directly exercises the helper with its older four-argument signature. `tests/unit/adversarialRedTeam.test.ts` also has direct helper calls for replay behavior. Both fixtures must be migrated to explicit binding objects; retaining an unbound compatibility overload would defeat the production invariant.
- The existing payment-ledger mock database hardcodes one document key (`test_key_1`) in transaction operations. It is adequate for its narrow historical replay test but is not a reliable multi-key / multi-binding fixture. Replace or extend it to resolve transaction refs by document ID before adding the adversarial binding matrix.

### Implementation sequencing decision
1. First change the helper contract and deterministic binding canonicalizer/fingerprint, with strict validation and a version marker. The helper must compare the fingerprint before both cached replay and stale-lease takeover.
2. Update `recordEscrowFunding` and `releaseEscrowFunds` to pass complete, server-derived binding data. For release, include the caller and job/quote/milestone identity plus a canonical authorization mode; use server-read release amount/currency/payee where the helper contract permits a preflight read, or bind a canonical request identity and explicitly verify the resolved persisted financial facts before side effects. Avoid introducing a race by treating a preflight read as authoritative.
3. Refactor the driver payout route so driver identity and connected account are loaded and verified before entering the generic helper. Decide and document how “pay available balance” is replay-safe when the available balance changes; do not silently replay a payout cached for a different amount/account.
4. Migrate direct helper tests and add mismatch tests for actor/resource/account/amount/currency/payload, exact replay, stale takeover, and claim fencing. Add method-level tests for all three production call paths.
5. Keep the helper's external-effect ambiguity limitations explicit. A fingerprint mismatch must fail closed; it must not clear another request's claim or retry Stripe with a new key.

### Status
- This section records a deeper read-only call-site/test audit. No source or test code was changed, and no tests, lint, build, emulator, or CI jobs were run.
- The currently fetched integration branch compare still reports 460 commits ahead of `main` and 0 behind. `main` remains untouched.
- FIN-04 is still open. Do not claim idempotency binding is fixed until the helper, every production caller and all direct test callers have been migrated and verified together.


## Section 157 — FIN-04 replay-binding edge cases and CI budget policy (11 November 2026)

### Additional source findings

- The current helper's db === null development fallback executes the supplied executor directly. Any binding contract added to the database-backed claim path must still validate required binding fields before this fallback; otherwise tests or non-production callers could silently exercise an unbound financial operation.
- The storage document currently uses the caller-provided idempotency key directly as the Firestore document ID. The FIN-04 implementation should derive a deterministic storage ID from a cryptographic hash of the caller key, while retaining the stable caller key only where the business operation / Stripe key derivation requires it. Do not log or expose raw caller keys.
- recordEscrowFunding is invoked from the verified Stripe webhook path and from focused payment-authority tests. Its binding must describe the verified payment facts (job, milestone, customer, trader, amount in minor units, normalized currency and PaymentIntent ID); it must not trust an unrelated client actor.
- releaseEscrowFunds is invoked by the canonical release route and several method-level tests. The binding must include authenticated caller, job, quote, milestone and canonical authorization mode. QR secret material itself must never be stored in the fingerprint; bind only the authorization mode and resource identity. The authoritative amount/payee remain read from Firestore in the release transaction and must be checked there.
- Driver payout needs a server-verified driver record and connected account before the helper can return a cached response. Normalize an explicit requested amount to integer pence before claiming. For “all available”, bind the semantic mode (full available balance) plus account and driver, then preserve the Stripe idempotency key; do not bind an unvalidated client amount or accidentally turn a later changed balance into a different request without an explicit new key.
- The payment-ledger unit fixture's hard-coded test_key_1 transaction reference prevents meaningful multi-key adversarial tests. Replace it with document-reference-aware map operations before relying on cross-key or cross-binding coverage.

### Required implementation gate

Before changing production callers, define one versioned canonical binding schema and a deterministic serializer. Validate actor/resource identity, operation-specific currency and either a safe integer minor-unit amount or a canonical payload digest. Compare the fingerprint before cached replay and before stale-lease takeover. Reject legacy records without a fingerprint rather than silently replaying them. Keep claim-token fencing, Stripe's independent stable idempotency key and explicit reconciliation for ambiguous external outcomes.

### CI budget policy (user-requested)

- Batch related source and test changes into one coherent implementation set.
- Run focused local checks first where an executable checkout is available.
- Do not trigger CI after each small commit or for documentation-only commits.
- Run one consolidated integration CI pass after a meaningful implementation batch, then verify the exact commit and workflow results before marking the item complete.
- Reuse results only when they apply to the exact commit and workflow. Empty PR-only workflow/status responses do not establish that push-triggered CI passed or failed.
- Never claim tests or CI passed unless the execution result is actually available and verified.

### Current branch checkpoint

- Live compare against main reports integration/pr-consolidation-20261109 is **461 commits ahead and 0 behind**; base SHA is 4b7963c831acbb2ea6f3084f9f4d069fb772792a. This supersedes Section 156's 460-ahead observation.
- main was not modified. No application source, tests, Firebase data, Stripe object, deployment or CI workflow was changed or run in this documentation checkpoint.
- FIN-04 remains open. Next implementation batch is the helper contract + all production call sites + migrated direct-helper tests and adversarial replay matrix; validate the complete batch before triggering one consolidated integration CI run.


## Section 158 — FIN-04 webhook funding call-site semantics (11 November 2026)

### Verified webhook path details

- The `recordEscrowFunding` call is inside the Stripe webhook's `authoritativeResult.mode === 'payment'` / `meta.type === 'milestone_funding'` fulfillment branch. The webhook has already resolved the PaymentIntent and authoritative amount, and supplies the authenticated customer metadata, trader metadata / quote recipient, amount in pence and GBP currency.
- The call currently supplies a deterministic key formatted as `mock_fund_${jobId}_${milestoneId}`. This key is stable per job/milestone but is not visibly bound to the PaymentIntent ID. The FIN-04 binding must include the verified PaymentIntent ID and exact financial/resource facts; separately review whether the key namespace should be renamed without changing retry identity for already-created operations.
- Before calling `recordEscrowFunding`, this webhook branch updates the quote's milestone array to `status: 'funded'`, `fundedAt` and `stripePaymentIntentId` using a standalone `quoteRef.update`. The subsequent ledger helper separately reads and updates `jobs/{jobId}/milestones/{milestoneId}` and writes `payment_ledger`. These are different document paths and are not one atomic transaction. A failure between the quote update and ledger operation can leave partially fulfilled funding state; this must be treated as a separate webhook/ledger consistency issue, not assumed solved by FIN-04 fingerprinting.
- The webhook later completes its event claim only after processing returns, and failures return HTTP 500 through the existing retry path. That provides a retry opportunity, but the funding branch still needs a replay-safe state transition across quote milestone, job milestone, ledger and domain event. Tests should simulate failure after the quote update and before ledger completion, then redelivery of the same Stripe event / PaymentIntent.
- The release route delegates to `releaseEscrowFunds` with authenticated UID, QR mode, optional handshake code and server-computed admin status. Only the QR mode / actor / resource belong in the idempotency binding; never include the secret handshake code itself.

### Status

- This is a read-only call-site trace. No source or test files changed, and no tests, emulator, lint, build or CI were run.
- FIN-04 remains open. Add the funding partial-fulfillment replay case to the same coherent source/test implementation batch where possible, but do not conflate it with the core binding fingerprint or claim it fixed by the helper alone.
- All writes remain restricted to `integration/pr-consolidation-20261109`; `main`, production Firebase and Stripe remain untouched.


## Section 159 — FIN-04 complete caller inventory and safe migration boundary (11 November 2026)

### Repository-wide direct-helper inventory

The GitHub code search for `executeIdempotentOperation(` returned the following application/test call sites on the indexed repository snapshot:

- Production: `src/server/paymentLedger.ts` (the escrow funding and milestone release wrappers) and `server.ts` (driver Stripe payout route).
- Direct helper tests: `tests/unit/paymentLedger.test.ts` and `tests/unit/adversarialRedTeam.test.ts`.
- `SECURITY_ENGINEERING_AUDIT.md` documents the helper but is not an executable caller.
- No additional direct generic-helper callers were returned by this search. Because GitHub code search is indexed against the default branch, this inventory is a locator, not proof that the integration branch has no additional call sites; re-run a local ripgrep across the checked-out integration branch before implementation.

### FIN-04 migration details

1. Extend the helper API with a mandatory, versioned semantic binding argument. Validate it before the no-database development fallback as well as before any Firestore operation.
2. Canonicalize a restricted JSON-compatible binding deterministically (stable key ordering, normalized currency, integer minor units, no undefined, NaN, Infinity, functions, secrets or arbitrary object instances). Hash the canonical representation with SHA-256. Persist the schema version and fingerprint alongside operation name and claim state.
3. Derive the Firestore idempotency document ID from a cryptographic hash of the caller key to avoid storing raw caller-provided keys in document paths. Preserve existing external Stripe idempotency key derivation and business operation IDs; do not silently rotate keys for already-attempted external effects.
4. Compare operation name, binding version and fingerprint before returning a cached response and before taking over an expired lease. Missing fingerprints on legacy in-progress/completed records must fail closed into an explicit reconciliation path; do not auto-replay or overwrite them.
5. Keep stale-claim fencing based on claimToken. Cleanup may delete only the exact claim generation owned by the failing executor. The executor's ambiguous Stripe outcome still requires durable reconciliation, not a blind retry.
6. Migrate funding, release, payout, both direct helper tests and all wrapper tests in one source/test batch. Add exact replay success and mismatch rejection for actor, resource, destination account, amount, currency, and payload; add a legacy-record fail-closed test and expired-lease takeover / stale-completion tests.

### Call-site binding contract

- Funding: verified customer, job, milestone, trader, PaymentIntent ID, normalized currency, integer verified pence, and a binding schema version. The PaymentIntent must be verified by the webhook/payment authority before the helper is entered.
- Release: authenticated UID, job, quote, milestone, canonical authorization mode (owner/admin/QR), and a digest of the stable release request facts. Never fingerprint the QR handshake code or persist it in the idempotency record. The release transaction remains authoritative for milestone amount, payee, quote acceptance and destination account; validate those facts inside the transaction before financial effects.
- Driver payout: authenticated actor, driver ID, verified connected Stripe account, GBP, and a normalized request mode. For explicit payout amounts, bind the validated integer pence. For “all available”, bind an explicit full-available mode plus driver/account and keep the external Stripe idempotency key stable. Load and verify the driver/account before the helper can return a cached response. Reject malformed/non-positive/unsafe amounts before claiming.

### Separate consistency finding

The funding webhook updates the quote milestone before invoking the ledger helper. FIN-04 binding prevents a mismatched replay from returning a cached response, but it does not make that quote update atomic with the job milestone, payment ledger and domain event. A separate idempotent webhook fulfillment coordinator or a transactionally staged outbox/state machine is required to make partial fulfillment recoverable. Do not mark webhook fulfillment consistency complete solely because the helper fingerprint is implemented.

### Implementation readiness

- Read-only tracing is complete enough to define the helper contract, but code migration should begin only after a local checkout of the exact integration branch is available for complete call-site search and focused test execution.
- Do not make a helper-only change that leaves production callers or tests on the old signature. Do not use a compatibility overload that permits missing bindings.
- CI remains batched: local focused checks first; one consolidated integration CI run after the full source/test batch. No CI should be run for this plan-only update.


## Section 160 — FIN-02 Instant Match refund-path verification (11 November 2026)

### Correction to earlier PaymentIntent persistence note

A branch-specific fetch of `server.ts` on `integration/pr-consolidation-20261109` shows that the Instant Match Checkout fulfillment already validates `intent.paymentIntentId` against the Stripe PaymentIntent ID pattern and persists the result as `stripePaymentIntentId` on the newly created `instant_matches/{matchId}` document. When the value is invalid or absent, the match is created in `refund_review_required` with `refundStatus: manual_review`. The earlier audit note claiming that production fulfillment omitted this field is stale; do not implement that already-present field addition again.

### Current terminal no-match routing

The current root-level `instantMatchWorker.ts` exports `expireAndRefundInstantMatch`. Both observed terminal no-match routes call it:
- `initiateNextAttempt` calls it with `no_eligible_traders` when no eligible traders remain.
- Both the snapshot listener and timeout interval call it with `attempts_exhausted` after the configured attempt limit.

The function creates a durable `instant_match_refunds/{matchId}` operation record before calling Stripe, with PaymentIntent ID, locally expected amount, currency, stable idempotency key, reason and processing status. It deliberately stops if any operation record already exists, avoiding blind replay after Stripe's finite idempotency retention period. Missing PaymentIntent identity is routed to manual review. Missing Stripe client and thrown Stripe errors are routed to `reconciliation_required`. The added unit tests cover successful recording, missing PaymentIntent, ambiguous Stripe exception/no automatic replay, and completed-operation no replay.

### Remaining concrete gaps

1. **Stripe result is not checked against the persisted operation before success is recorded.** The create call supplies the PaymentIntent ID and metadata, but does not supply the expected amount explicitly. The returned object is not checked for its PaymentIntent, amount, currency, metadata, or a non-empty refund ID before its status/ID are copied into Firestore. A malformed or mismatched response could therefore be recorded as the operation's result.
2. **The post-Stripe transaction is not fenced to the operation generation or immutable evidence.** It checks only that match and refund documents exist. It should compare the persisted PaymentIntent, amount, currency, idempotency key and expected processing state before writing; it must not let a stale worker overwrite a reconciled/manual-review outcome.
3. **Existing operation records are a deliberate stop, not a recovery mechanism.** This is safe against duplicate creation but means recovery depends on an explicit reconciliation action. The read-only `inspectInstantMatchRefunds` helper scans all PaymentIntent refund pages, checks operation metadata and compares PaymentIntent/amount/currency, and reports matched/not_found/conflict. Its current unit tests cover pagination, conflict, malformed pages and invalid evidence. The audit has not yet established a complete operator workflow that maps those outcomes into a fenced durable resolution of the refund operation.
4. **Refund amount semantics need to be made explicit.** The operation stores `chargeAmountPence`, while `stripe.refunds.create` omits `amount` and therefore requests Stripe's default full remaining refund. Confirm that the stored amount is the intended full refundable amount and is in integer safe minor units before using it as reconciliation evidence; do not infer that from a field name alone.
5. **Checkout's invalid-PaymentIntent terminal state is outside the worker's `searching` state guard.** It is intentionally placed into manual review at creation, but tests should assert that no matching/search listener can accidentally move it back into a refundable/searching path.

### Next implementation batch

- Add strict local evidence validation before creating the operation: non-empty match ID, valid PaymentIntent ID, positive safe-integer pence, normalized three-letter currency, and a known full-refund semantic.
- Persist an immutable operation fingerprint/version and a claim generation for the external call and completion write. Do not automatically retry an existing ambiguous operation.
- Pass the explicit expected amount to Stripe only if the business rule confirms it is the intended amount; otherwise retain full-remaining semantics and record that mode explicitly.
- Validate returned refund ID, PaymentIntent, amount, currency and operation metadata before recording a successful/processing result. Any mismatch becomes a conflict/manual-reconciliation state, never success.
- Fence the completion transaction against the exact operation generation and expected processing state.
- Add tests for mismatched returned PaymentIntent, amount, currency, metadata, missing refund ID, stale completion after reconciliation, and full-refund amount semantics. Extend reconciliation tests for multiple matching refunds and successful vs pending/failed Stripe statuses.
- Verify the integration branch's local test and full call-site inventory before source edits. Batch worker, reconciliation coordinator, tests and any required caller changes together; run one consolidated CI pass only after the meaningful batch.

### Verification status

This section is a branch-specific read-only source/test audit. The GitHub fetch confirms the code and test contents, but no local test command was run and no CI run was started. Do not report the new tests as passing. The branch was still 464 commits ahead of `main` and 0 behind at the start of this checkpoint; the base SHA remained `4b7963c831acbb2ea6f3084f9f4d069fb772792a`. No source, test, production configuration, Firebase data, Stripe object, deployment or CI workflow was changed.


## Section 161 — FIN-04 release failure fencing and payment aggregate integrity (11 November 2026)

### Branch-specific source confirmation

Reviewed `server.ts` lines 4891–5050 and `src/server/paymentLedger.ts` lines 467–620 at integration head `1811b23bd0cf6d11d7c09c28cb227762db6a83a5`.

1. **Definite-failure rollback is not operation-fenced.** The `transferStatus === "failed"` route transaction finds the milestone by ID only; unlike the ambiguous-outcome path, it does not require `m.releaseOperationId === idempotencyKey`. A stale preflight failure can reset a later release's milestone to `funded`, set `releaseStatus: failed`, and clear its operation key.
2. **Job aggregate is overwritten, not recomputed.** That same failure transaction unconditionally writes job `paymentStatus: funded` and `isPaid: false`, even if another milestone has already been released or the job is otherwise partially/fully paid. This can corrupt aggregate state and mislead the existing JobDetails payment badge.
3. **Stripe response is trusted too broadly.** `executeStripeEscrowTransfer` reads `transfer?.id` but returns `completed` without requiring a valid transfer ID or checking response amount, currency, destination, or release metadata against the request. A malformed/mismatched response must not become a completed payout.
4. **Ledger selection is ambiguous.** Success and exception handling query `payment_ledger` by caller `idempotencyKey` and update the first result. The release transaction already returns `ledgerEntryId`; the transfer side effect should carry and update that exact entry, verify its operation/resource/payee/amount and expected state, and use a fenced state transition.
5. **Skip states are not consistently safe.** Non-destination skips (`skipped_no_trader`, `skipped_no_stripe`, `skipped_mock_account`) fall through the route's normal response/notification path. They must be explicit non-success outcomes; only `skipped_destination_charge` is a valid completed settlement path where the destination charge itself is authoritative.
6. **Ambiguous-vs-definite boundary must stay strict.** Only a preflight condition proven to happen before Stripe invocation may release the milestone claim for retry. Once a Stripe request has been attempted, exceptions/timeouts remain reconciliation-required and keep the original operation locked.

### Required implementation and test changes

- Fence every release status mutation (success, definite failure, reconciliation) by quote + milestone + exact release operation ID and expected current status/generation.
- Replace unconditional job payment-flag writes with a transaction-safe aggregate recomputation from authoritative milestone/quote/ledger states; define paid/funded/released semantics explicitly. Never infer aggregate paid from one milestone.
- Pass the exact `ledgerEntryId` returned by `releaseEscrowFunds` to the transfer executor; reject missing or mismatched entry and transition only that entry from its expected state.
- Validate Stripe transfer response identity and request facts (non-empty `tr_...` ID, amount, GBP currency, destination account, and metadata/release operation identity). A mismatch is conflict/manual reconciliation, not completed.
- Return and handle every transfer status exhaustively. Make the route/UI and `formatReleaseNotification` distinguish completed destination charge, completed transfer, failed preflight, ambiguous outcome, and non-production skip; never toast/label a skip as paid.
- Add regressions: stale failed operation versus newer release key; concurrent/other milestone aggregate preservation; already-paid job stays paid after one failure; exact ledger row updated; absent/malformed/mismatched Stripe transfer response; each skip state; destination-charge special case; ambiguous exception never unlocks.
- Preserve Firestore rules that deny client-side financial field mutation. Manual payment confirmation remains a separate server-authoritative, auditable action—not a rules relaxation or a Stripe-verified claim.

### Checkpoint / safety

- Integration branch head verified unchanged at `1811b23bd0cf6d11d7c09c28cb227762db6a83a5`; this audit made no application/test changes and did not run CI.
- The preceding CI run #895 is green for that exact snapshot, but it does not remediate these source-level findings.
- This remains a read-only audit. Implement release executor, route fencing, aggregate recomputation, UI/notification status handling and their tests together in the consolidated source/test batch; then run the agreed single full CI gate.


## Section 162 — FIN-04 driver payout caller and orchestration follow-through (11 November 2026)

### Verified branch and CI checkpoint

- Audited the existing branch only: `integration/pr-consolidation-20261109`.
- Branch head at this checkpoint: `4e27011d6acf8fecc93832c2107a7431aa797e32`.
- Compared with `main`: 493 commits ahead, 0 behind; merge base remains `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Latest branch workflow run #923 is `success` for this exact head. This is a CI result, not evidence that the read-only audit findings below are fixed.
- PR #5 remains open, draft and unmerged, targeting this integration branch.
- No application code, tests, production configuration, Firebase data, Stripe object, deployment, or workflow was changed in this audit.

### Additional source findings

Reviewed the branch versions of `server.ts`, `src/server/paymentLedger.ts`, and `src/server/driverPayoutOrchestration.ts`.

1. **Generic idempotency cleanup can erase an ambiguous payout claim.** `executeIdempotentOperation` conditionally deletes its claim after any executor error. In the driver payout route, Stripe `payouts.create` can succeed and the subsequent domain-event dispatch can fail. The helper then releases the claim even though the external payout may exist. A retry can create a second payout after Stripe's finite idempotency retention expires. The route needs a durable external-effect state/reconciliation boundary; post-Stripe event failure must not be treated as proof that no payout occurred.
2. **Stripe payout response is not independently validated.** The route returns the `payouts.create` object after event dispatch without checking that its ID is present and that amount, currency, destination/account context and status match the request. Validate response evidence before recording completion; mismatch or missing evidence must enter reconciliation, not success.
3. **Automated driver transfer finalization can become ambiguous after Stripe success.** The orchestration calls `transfers.create`, then performs a Firestore transaction. If the transaction fails after Stripe has created the transfer, the catch path can write `failed` and leave `payoutTransferred: false` when the worker still owns the claim. This is unsafe to retry as a definite failure. Any error after a confirmed Stripe transfer must preserve transfer ID and enter `reconciliation_required`; only failures proven to occur before the external request may be classified as retryable definite failures.
4. **Lease-loss handling is safer but incomplete as a durable recovery contract.** If the lease token is lost after transfer creation, the detail result correctly reports reconciliation required and avoids overwriting the successor's ride state. Ensure the transfer evidence is also durably discoverable by operation key/ride ID so that a successor/operator can reconcile it without issuing another transfer.
5. **Driver payout endpoint uses a stable Stripe idempotency key but still depends on the generic helper's unsafe failure cleanup.** The external key is `stripe_payout_<caller key>`; preserve it for already-attempted effects. Do not solve this by rotating the key or by blindly retrying after an ambiguous result.

### Required consolidated implementation batch

- Extend the idempotency helper contract so an executor can distinguish pre-effect definite failure from post-effect/ambiguous outcome. Do not delete or expire a claim that may represent an external Stripe effect; persist an explicit reconciliation-required state with operation binding and evidence.
- Update the driver payout route to validate the Stripe response and durably record the payout ID/status before dispatching downstream domain events, or use a transactional outbox so event-dispatch failure cannot release the financial operation.
- Update automated driver orchestration so post-Stripe Firestore finalization errors are always reconciliation-required, retaining the Stripe transfer ID and deterministic operation key. A retry must inspect/reconcile the existing transfer before any new create call.
- Add regression tests for: Stripe payout succeeds then domain event throws; Stripe payout response has missing ID or mismatched amount/currency; transfer succeeds then Firestore finalization throws; lease expires after Stripe success; stale worker cannot overwrite successor state; repeated calls never create a second external effect.
- Keep this work in one coherent helper/caller/test batch. Run focused local tests and a complete call-site search on the exact integration checkout before editing; run the consolidated full CI gate only after the batch.

### Verification status

This is a branch-specific read-only audit. The latest workflow run #923 is green for the branch head, but the above scenarios remain source-level risks until fixed and covered by regression tests. No local test command was run in this audit. Do not report FIN-04 complete. All writes remain restricted to `integration/pr-consolidation-20261109`; do not merge PR #5, update `main`, deploy, or alter production Firebase/Stripe.


## Section 163 — FIN-04 ambiguous transfer recovery gap and CI confirmation (11 November 2026)

### Verified checkpoint

- Branch: `integration/pr-consolidation-20261109`.
- Source snapshot audited: `45560833a49c31ae1e2850a71d4a8c0e1c82b1a7`.
- Branch remains 494 commits ahead of `main`, 0 behind; merge base is `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Workflow run #924 for this exact snapshot completed successfully. Security rules/emulator concurrency, unit/penetration tests, TypeScript/lint, production build and final release audit all passed.
- PR #5 remains open, draft and unmerged. No application code or tests were changed in this checkpoint.

### Confirmed implementation gap

A more exact pass over the helper, orchestration catch path and existing regression tests confirms two linked recovery defects:

1. **An expired generic idempotency claim is automatically executable again.** In `PaymentLedgerEngine.executeIdempotentOperation`, an existing `in_progress` record older than five minutes falls through to a new claim generation and runs the executor. The helper does not distinguish an expired worker that died before Stripe from one that completed the Stripe side effect and then died before persisting completion. This makes lease expiry itself an unsafe retry authorization for external financial effects.
2. **Post-transfer Firestore finalization errors can be recorded as definite failure.** The orchestration receives `transfer.id` from `stripeClient.transfers.create`, then attempts the Firestore success transaction. Its catch path writes `payoutStatus: "failed"` for any error other than the special `LEASE_TOKEN_LOST` message, provided the worker still owns the claim. A transient Firestore error after Stripe success therefore leaves `payoutTransferred: false` and a retryable failed state, despite the transfer already existing. The deterministic Stripe key is helpful but must not be the only recovery control because Stripe idempotency retention is finite.
3. **The existing lost-lease regression exposes a durability hole.** Test 20 in `tests/unit/driverPayoutOrchestration.test.ts` expects the result to contain `tr_ambiguous_456`, while also asserting the ride document's `stripeTransferId` remains undefined. The successor's state is correctly not overwritten, but the transfer evidence is only in the transient result and is not durably discoverable on the ride or a separate reconciliation record.
4. **Current tests cover the wrong failure boundary.** Test 11 verifies a Stripe request rejection followed by a retry using the same key. Test 20 covers a lost claim after a successful transfer. The missing regression is: Stripe resolves successfully, then the *success finalization transaction itself* throws while the original claim is still owned. That must persist reconciliation-required evidence and must not transition to ordinary `failed`.

### Required correction and acceptance criteria

- Treat an expired `in_progress` claim for a side-effecting operation as reconciliation-required unless durable evidence proves the external request was never attempted. Do not blindly replace it with a new executor claim.
- Persist an operation record before the Stripe call with deterministic operation identity, then persist the returned transfer ID and response facts immediately after success using a safe recovery write that does not overwrite a successor's ride state.
- Separate Stripe request rejection known to be pre-effect from ambiguous transport outcomes and from confirmed Stripe success followed by local persistence failure. Only a proven pre-effect failure may become retryable `failed`.
- On post-success finalization failure, preserve transfer ID, operation key, amount, currency, destination and ride binding in a durable reconciliation record; return `reconciliation_required` and reconcile before another `transfers.create`.
- Add tests for successful Stripe transfer followed by Firestore finalization rejection, expired generic in-progress claim after a possibly completed Stripe effect, durable transfer evidence after lease loss, and repeated invocation performing no second create.
- Keep stale-worker fencing: durable evidence must be written to a separately operation-bound record or with a compare-and-set that cannot overwrite successor ride state.
- Validate the response itself (non-empty transfer ID, amount, currency, destination and metadata binding) before treating it as a confirmed external effect.

### Scope and verification

This checkpoint is still a read-only source audit plus a documentation update. CI #924 is green for the documentation-only snapshot; it does not validate the missing failure-boundary regressions or remediate FIN-04. No local checkout or local test execution was available in this workflow, so no application patch is being made without the required focused test feedback. Continue only on `integration/pr-consolidation-20261109`; do not create branches, merge PR #5, modify `main`, deploy, or alter production Firebase/Stripe state.



## Section 164 — FIN-04 idempotency-helper call-site impact map (11 November 2026)

### Verified checkpoint

- Audited only `integration/pr-consolidation-20261109`, at branch head `3aae00a53ee7731c9d55f7e210d126837f5dc954`.
- Branch comparison: 495 commits ahead of `main`, 0 behind; merge base remains `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- Workflow run #925 for this exact documentation snapshot completed successfully: [run #925](https://github.com/Saanwar2002/AnyTrader/actions/runs/43071416777). Security rules/emulator concurrency, unit/penetration tests, TypeScript/lint, production build and final release audit passed.
- PR #5 remains open, draft and unmerged, with the integration branch as its base.
- This checkpoint changes documentation only. No application/test code, production configuration, Firebase data, Stripe object, deployment, or workflow was changed.

### Complete helper call-site map

A branch-wide source inspection found three production call sites for `PaymentLedgerEngine.executeIdempotentOperation`, in addition to its definition and unit-test uses:

1. `FUND_MILESTONE_ESCROW` in `src/server/paymentLedger.ts` (around line 166).
2. `RELEASE_MILESTONE` in `src/server/paymentLedger.ts` (around line 324).
3. `DRIVER_STRIPE_PAYOUT` in `server.ts` (around line 3647).

The helper's common catch path (around lines 126–138) deletes the current claim after *any* executor error. The five-minute stale-`in_progress` path (around lines 94–105) also replaces the claim and re-executes without knowing whether an external effect was attempted. A helper-contract change therefore cannot safely be designed around the driver payout route alone; each caller needs an explicit recovery policy.

### Caller-specific consequences

1. **Milestone funding:** the executor updates the milestone, writes a deterministic ledger entry, and then dispatches `MILESTONE_FUNDED`. A thrown event dispatch currently causes the helper to remove its claim after Firestore writes may already have committed. The funding caller's replay behavior and domain-event idempotency need to be preserved when changing helper semantics; do not turn this into an indiscriminate permanent lock.
2. **Milestone release:** the executor commits the quote/milestone transition and ledger row in a Firestore transaction, then dispatches `MILESTONE_RELEASED`. If dispatch throws, the generic helper deletes its claim even though the release transaction committed. On retry, the release transaction recognizes the same `releaseOperationId` as already committed and intentionally skips the event dispatch. This creates a concrete event-recovery gap: the retry can return success without repairing the missing event. The correction should use a durable event/outbox state or an idempotent event-repair path, while retaining the authoritative transaction's same-operation replay behavior.
3. **Driver Stripe payout:** `server.ts` calls `stripe.payouts.create` with the stable key `stripe_payout_<caller key>`, then dispatches `DRIVER_PAYOUT_INITIATED`. A dispatch error after Stripe success reaches the generic catch, which deletes the claim. A later retry can issue another payout create after Stripe's idempotency retention window. Persist and validate the Stripe payout evidence before event dispatch, and make the event independently repairable; never treat event failure as proof the payout did not happen.
4. **Automated ride transfer:** this flow does not call the generic helper; it has its own ride claim and post-Stripe Firestore finalization. The Section 163 finding remains separate and must be addressed in the same financial recovery design: confirmed transfer success followed by local finalization failure must leave durable reconciliation evidence, not ordinary `failed`.

### Implementation design constraints for the consolidated batch

- Replace the helper's implicit “delete claim on any exception” policy with an explicit, typed outcome contract that distinguishes: proven pre-effect rejection; ambiguous external request/transport outcome; confirmed external success with local persistence failure; and post-commit notification/event failure.
- Preserve caller-specific semantics. Funding and release are primarily Firestore-ledger transitions with post-commit domain events; driver payout and automated ride payout cross the Stripe external-effect boundary. A single generic retry rule must not conflate them.
- For release and funding, make post-commit event delivery recoverable (prefer a durable outbox/dispatch state with deterministic event identity) so an event exception cannot strand or silently omit an event after the ledger transition is committed.
- For driver payout, persist an operation record before the Stripe call, validate and persist the returned payout ID and request-binding facts immediately after success, then dispatch/repair the domain event independently. Replays must consult that durable record and never create a new payout merely because event dispatch failed.
- For expired `in_progress` records, do not authorize a new executor solely because five minutes elapsed. Require durable proof that the external request was never attempted, or mark the operation reconciliation-required.
- Add focused tests for each production call site: funding write + event failure recovery; release transaction committed + event failure recovery; payout success + event failure with no second Stripe create; expired possibly-attempted claim; and preservation of stale-claim fencing. Keep the Section 163 transfer-finalization regressions in the same coherent FIN-04 code/test batch.
- Before changing the shared helper, inspect and update every production call site and all helper tests in one batch. Run focused tests where a checkout is available, then run one full CI suite against the consolidated commit, wait for completion, fix failures, and rerun the full suite. Record the exact SHA/run/result.

### Verification and next gate

- The current helper test file covers successful replay, operation/binding conflicts and stale-executor fencing, but the inspected tests do not cover expired in-progress recovery or the caller-specific post-commit event-failure cases above.
- No local checkout/test runner is available in this workflow; no local tests are claimed.
- FIN-04 remains open. The green #925 run validates the documentation-only commit, not these unimplemented recovery requirements.
- Continue on `integration/pr-consolidation-20261109` only. Do not create another branch, merge PR #5, modify `main`, deploy, change production Firebase/Stripe state, or weaken security rules.


## Section 165 — Domain-event persistence versus handler-delivery recovery

### Verification checkpoint

- Reviewed the current integration-branch implementations of `src/server/domainEvents.ts` and `src/server/paymentLedger.ts` at the Section 164 follow-up snapshot.
- CI run #926 for commit `bf79d387c7013b65dbcfa3b3ae6a72fb0db32b28` completed successfully: [run #926](https://github.com/Saanwar2002/AnyTrader/actions/runs/43073817157). Firebase security/emulator concurrency, unit/penetration tests, TypeScript/lint, production build and final release audit all passed.
- This is still a documentation checkpoint. No application code, test code, production configuration, Firebase data, Stripe object, deployment, or workflow was changed. FIN-04 remains unresolved.

### Confirmed dispatcher behavior

1. Correlated events derive a deterministic ID from event type, aggregate ID and correlation ID: `evt_` plus the first 32 hexadecimal characters of the SHA-256 digest.
2. When Firestore transaction support is available, the dispatcher transactionally checks `domain_events/{eventId}`; if the document already exists it returns immediately, otherwise it writes the event.
3. A Firestore persistence error for a correlated event is rethrown to the caller. Therefore the caller can observe an event-persistence failure after its business-state transaction has already committed.
4. The existing-document path returns before registered handlers are invoked. Re-dispatching an already-persisted event does not retry its handlers.
5. Registered handlers are invoked sequentially only after a newly persisted event (or after the non-transactional path), but handler exceptions are caught and logged rather than propagated. The dispatcher therefore treats a persisted audit record as success even when one or more in-process handlers fail.
6. The current `tests/unit/domainEventIdempotency.test.ts` coverage is source-inspection/string-assertion based for key implementation details. It does not functionally simulate a failed persistence attempt followed by successful deterministic-ID recovery, nor a handler failure followed by a delivery retry.

### Required semantic distinction

The next implementation must not conflate these separate guarantees:

- **Business transition committed:** the authoritative ledger/milestone/quote or Stripe operation has a durable outcome.
- **Audit event persisted:** the deterministic domain-event document exists exactly once.
- **Event consumers processed:** each required downstream handler/consumer has durably completed its work, or is explicitly pending/retryable.

The present dispatcher provides a useful deterministic audit-record identity, but it does not provide durable per-handler delivery. A duplicate dispatch after the audit document exists currently short-circuits handlers; a handler exception is logged and forgotten. Consequently, “event document exists” cannot be used as proof that all event-driven work completed.

### Design direction for the consolidated FIN-04 batch

- Preserve the current deterministic event identity so event persistence retries cannot create duplicate audit records.
- Make the already-committed funding and release paths call an explicit event-repair operation on replay, rather than skipping dispatch solely because the business transition is already committed.
- Separate event-document creation from consumer delivery. If handlers perform required side effects, introduce a durable outbox/consumer-delivery record (or equivalent durable dispatch state) with stable event and consumer identities, attempt metadata, and retryable status. Consumer effects must themselves be idempotent.
- Do not simply invoke all handlers again whenever an existing event is encountered: that would risk duplicating non-idempotent side effects. The dispatcher needs per-consumer completion/idempotency semantics before redelivery is safe.
- Handler delivery failure must remain visible as pending/retryable operational work without rolling back or misclassifying an already-committed ledger transition or successful Stripe payout.
- Driver payout recovery must persist and validate Stripe payout evidence before event delivery; a missing/failed event delivery must never authorize a second payout create.
- Ride-transfer recovery from Sections 162–164 remains in scope: persist transfer evidence and reconciliation state independently of event delivery and preserve lease fencing.

### Required functional regression matrix

1. **Correlated event persistence failure:** force the first Firestore write/transaction to fail, retry the same event identity, assert one durable event document and no duplicate audit record.
2. **Committed release + event persistence failure:** commit release state, fail event persistence, replay the same release operation, and assert the missing event is repaired without a second ledger/release effect.
3. **Committed funding + event persistence failure:** commit funding state/ledger row, fail event persistence, replay, and assert deterministic event repair without duplicate funding/ledger effects.
4. **Existing event + failed consumer:** persist event, make one consumer fail, retry delivery, and assert that only the incomplete consumer is retried while completed consumers are not repeated.
5. **Consumer idempotency:** simulate worker restart/retry around a consumer side effect and prove the consumer's stable identity prevents duplicate effects.
6. **Stripe payout + event delivery failure:** confirm payout response/evidence is durably recorded, fail event persistence or consumer delivery, retry the operation, and assert no second Stripe payout create.
7. **Automated transfer + finalization failure:** assert transfer ID and binding evidence survive a Firestore finalization failure and a subsequent invocation reconciles rather than creating a second transfer.
8. **Expired possibly-attempted claim:** age an in-progress operation beyond the lease threshold and prove age alone cannot authorize re-execution of an external effect.
9. **Stale worker fencing:** prove a superseded worker cannot overwrite a successor's claim, financial state, event status or reconciliation evidence.

### Implementation gate and branch discipline

- Treat the typed idempotency outcome contract, durable operation evidence, event outbox/consumer-delivery semantics, all three generic-helper callers, automated ride-transfer recovery, and functional regressions as one coherent code/test batch.
- The current workflow does not provide a local checkout/test runner; do not claim local tests until a real checkout is available and the commands are executed.
- Once the full batch is ready, run focused tests where available, commit the complete batch to `integration/pr-consolidation-20261109` only, then run one full CI suite against that consolidated commit. Wait for completion, inspect every failed step, fix in a coherent follow-up batch and rerun full CI. Record exact SHA, run ID and result here.
- Do not create another branch, modify `main`, merge PR #5, deploy, touch production Firebase/Stripe state, or weaken security rules/tests.


## Section 166 — Post-Section-165 CI and integration-branch checkpoint

### Verified state

- Section 165 documentation commit: `d9acc7b5897120768a42383b781a1132224d7f66`.
- Full CI run #927 completed successfully for that commit: [run #927](https://github.com/Saanwar2002/AnyTrader/actions/runs/43076492674). All substantive gates passed: Firebase Security Rules and real Firestore emulator concurrency, unit and penetration tests, TypeScript/lint, production build, and final release audit.
- Integration branch comparison against `main`: 497 commits ahead, 0 behind; merge base `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- PR #5 remains open, draft and unmerged, with base `integration/pr-consolidation-20261109`. It has not been merged or modified by this work.
- This checkpoint makes no application/test changes and does not imply FIN-04 has been fixed.

### Next execution gate

The analysis has converged on a single coherent implementation batch rather than isolated patches. Before editing production code, the batch must include:

1. A durable operation-state model and typed outcomes for pre-effect definite failure, ambiguous external attempt, confirmed external success/local persistence failure, and post-commit event-delivery failure.
2. Safe stale-claim handling: elapsed time alone cannot authorize a second side effect; retain operation identity and reconcile possibly-attempted operations.
3. Funding and release replay paths that repair the deterministic audit event without repeating the committed ledger transition.
4. Durable, per-consumer event delivery state. Existing-event replay must not blindly rerun completed/non-idempotent handlers.
5. Driver Stripe payout response validation and durable evidence before event delivery; event failure must not release the claim or authorize another payout.
6. Automated ride-transfer evidence persistence and reconciliation-required handling after confirmed Stripe success, including lease-loss recovery.
7. Functional tests for every failure boundary listed in Section 165, while preserving current authorization, security rules and stale-worker fencing.

The available GitHub workflow can inspect and commit repository files, but this session has no verified local checkout/test runner. Therefore no application-code batch is being represented as tested or safe to merge at this checkpoint. Do not substitute source-text assertions for functional failure/retry tests. Obtain a real checkout/test execution path before implementation, then keep the complete code/test batch on this integration branch and run one full CI cycle after the consolidated commit.

Continue with the integration branch only. Do not create another branch, change `main`, merge PR #5, deploy, or touch production Firebase/Stripe state.


## Section 167 — Driver payout durable external-effect evidence (11 November 2026)

### Implementation checkpoint

The driver payout orchestrator now creates a deterministic Firestore operation record in `driver_payout_operations` before invoking Stripe. Its document ID is SHA-256 over the ride, assigned driver and exact integer transfer amount; the record captures those immutable facts, connected-account destination, GBP, deterministic Stripe idempotency key, claim token and preparation timestamp.

After Stripe returns a transfer, the orchestrator persists `status: stripe_succeeded`, transfer ID, amount, currency, destination and confirmation timestamp **before** attempting ride-document finalization. If transfer/finalization throws, it attempts to mark the operation `reconciliation_required` and retains the error. A later worker encountering any existing operation record is blocked from issuing a new transfer, writes a reconciliation-required ride status and surfaces any persisted transfer ID. This deliberately sacrifices automatic retry availability for protection against duplicate disbursement.

The operation record is an evidence barrier, not yet a complete reconciliation/resolution service: it does not automatically finalize a ride from a previously confirmed transfer, reconcile a prepared/ambiguous record against Stripe, or support authorized operator resolution. Firestore failure immediately after Stripe success can still prevent recording the transfer receipt; that outage boundary must be handled through Stripe-side metadata/idempotency-key lookup and manual reconciliation. No production Stripe or Firestore data was read or written.

### Regression coverage and verification

- Extended the existing successful-Stripe/lost-lease test to assert durable transfer evidence and that a subsequent orchestration invocation is blocked without a second Stripe call.
- The implementation and test changes are committed on `integration/pr-consolidation-20261109`; CI must pass before this checkpoint is treated as validated.
- Remaining FIN-04 and payout reconciliation work: reconcile prepared/ambiguous operations with complete Stripe transfer search, verify exact amount/currency/destination/metadata, operator-fenced finalization, and test Firestore write failure after Stripe success. Preserve `main`, production services and draft PR #5 unchanged.


## Section 168 — Payout replay-barrier regression tests corrected (11 November 2026)

CI run 43089809704 passed the Firebase Security Rules and real Firestore emulator concurrency gate but reported two failures in the payout orchestration test file (1,252 passing tests overall). Both were test expectation/setup defects rather than observed production-code regressions:

- The Stripe-rejection test asserted against `createdTransfers[0]` despite explicitly expecting zero successful transfer receipts. Removed the invalid dereference; the mock records only successful returns, and the test continues to assert no automatic replay, reconciliation-required state and no payout flag.
- The lost-lease test attempted a second orchestration while its simulated successor still held a processing ride, which is excluded by the completed-ride query. It now models the successor lease expiring and the ride re-entering the eligible queue; that invocation must hit the durable operation barrier and remain blocked before any second Stripe transfer.

This checkpoint is a test-only correction. No payout safety invariant is relaxed: an existing prepared/Stripe-success operation still prevents blind replay. Re-run the full CI gate and retain the Firestore emulator result.


## Section 169 — CI #938 mock receipt instrumentation mismatch (11 November 2026)

CI #938: Firebase Security Rules/Firestore emulator concurrency gate passed; unit suite had 1,253 passing and one failure. The remaining assertion in test 20 expected the shared `createdTransfers` array to contain the custom Stripe transfer. Its one-shot `mockImplementationOnce` intentionally replaces the default Stripe mock implementation, which is the only code that appends to that array. Therefore the actual mocked transfer returned successfully but bypassed the receipt recorder; the test's array count was not an external-call count.

Corrected the regression assertion to count calls on `mockStripe.transfers.create` (exactly one) and separately verify the default recorder remains empty. This keeps the intended invariant—one external attempt, zero replay—without altering production behavior or conflating mock return receipts with API invocation tracking.


## Section 170 — Validate Stripe payout transfer receipts before durable confirmation (11 November 2026)

The automated driver payout path now validates the Stripe Transfer response against the immutable request before writing `stripe_succeeded` evidence or finalizing the ride. Required receipt properties are a transfer ID with the Stripe transfer prefix, exact integer amount in pence, GBP currency, exact connected-account destination, and matching ride ID, driver ID and payout type in response metadata. A mismatch throws into the existing reconciliation-required/error path; it does not set `payoutTransferred` or authorize another transfer. The operation remains a replay barrier because the external request may already have succeeded despite a malformed response.

The shared Stripe test fixture and successful custom transfer fixtures now return currency and metadata. Added a regression for an amount-mismatched response: ride remains unpaid for payout purposes, the operation is reconciliation-required and only one Stripe call is made. Validation is pending the complete GitHub Actions gate. No production Stripe/Firestore state was touched.


## Section 171 — 11 November 2026 live branch and payout recovery review

### Live repository checkpoint

- Reconfirmed that `integration/pr-consolidation-20261109` exists.
- Before this checkpoint documentation commit, the comparison showed 519 commits ahead, 0 behind. After recording this checkpoint, the branch comparison is **520 commits ahead, 0 behind**. The common ancestor remains `4b7963c831acbb2ea6f3084f9f4d069fb772792a`.
- The checkpoint commit is `1566b7d918643bce8dd2786f0343606a3c37df58`, written to this integration branch. Its combined commit-status response currently contains no status entries; this is not evidence of a passing CI run. The available commit-workflow lookup only returns pull-request-triggered runs, so the push-triggered CI result still needs a reliable Actions run lookup.
- The comparison reports changes across the CI workflow, Firestore rules, server/payment code, payout orchestration, financial reconciliation, application components and regression tests. This is a broad integration candidate, not a narrow financial-only patch.
- The comparison endpoint did not expose the integration head SHA in its response. Do not infer a head SHA from the base commit, blob SHAs or historical notes; fetch the exact branch head before recording a commit-specific CI claim.
- The last recorded PR #5 state in the reconciliation history was draft and unmerged. The current PR search response did not expose a reliable state field, so re-fetch PR metadata before relying on that status. No merge or PR mutation was performed in this session.
- The saved plan and current source files were read from the integration branch. No local checkout/test runner is available in this session; no local test execution is claimed.

### Current payout implementation review

The integration version of `src/server/driverPayoutOrchestration.ts` now:

- Verifies a paid ride against a succeeded GBP PaymentIntent or an explicitly typed completed/captured `RIDE_PAYMENT` ledger receipt.
- Acquires a token-fenced ride lease before payout.
- Creates a deterministic `driver_payout_operations` record before calling Stripe.
- Validates the returned Transfer ID, amount, GBP currency, destination and ride/driver/type metadata.
- Persists the Stripe receipt before attempting ride finalization.
- Retains an existing operation as a replay barrier and surfaces reconciliation-required status rather than blindly creating another transfer.

### New finding — payout replay-barrier state write is not lease-fenced

In the existing-operation branch, after `priorOperation.exists` is detected, the code calls `rideDoc.ref.update({ payoutStatus: "reconciliation_required", ... })` directly. This write does not re-read and verify the current `payoutClaimToken` in a transaction.

A worker can therefore lose its lease after acquisition and then overwrite a successor's ride status when it encounters an existing operation record. This does not itself authorize a second Stripe transfer, but it violates the stale-worker state-ownership invariant and can overwrite newer operational state.

**Required correction and regression:**

1. Replace that direct update with a Firestore transaction that reads the ride and verifies the exact claim token before changing the ride status/error fields.
2. If the token no longer matches, leave the successor's ride state untouched and report the operation as reconciliation-required in the result only.
3. Add a functional concurrency regression that changes the stored token between operation lookup and the reconciliation-state write; assert the successor's status, token and error fields remain unchanged.
4. Keep the existing no-second-Stripe-call assertion for an existing operation.
5. Run the focused payout tests and the complete CI gate after the coherent payout recovery batch is committed.

### FIN-04 / domain-event recovery remains open

Reinspection of `src/server/domainEvents.ts` confirms the Section 165 concern:

- Correlated events use deterministic IDs and transactional create-if-absent persistence.
- If the event already exists, dispatch returns before invoking handlers.
- Handler failures are logged and swallowed; there is no durable per-consumer delivery status or retry record.
- `tests/unit/domainEventIdempotency.test.ts` currently checks source text rather than functionally simulating persistence failure, existing-event replay or consumer retry.

Do not treat event-document existence as proof that consumers completed. The next FIN-04 implementation batch still needs durable per-consumer delivery state, idempotent consumer effects, replay repair for committed funding/release operations, and payout/automated-transfer evidence recovery. Keep these changes together with their functional failure-boundary tests.

### FIN-02 / FIN-05 and validation status

- FIN-02 refund pagination is implemented in the integration workstream, but the financial plan explicitly recorded push-triggered CI as pending at its last pagination checkpoint. Re-fetch current Actions results against the exact branch head before marking it validated.
- FIN-05 read-only cross-operation reconciliation remains open. Implement the pure discrepancy evaluator and tests first; it must report missing, duplicate, orphaned, mismatched and over-allocated records without changing financial history or initiating money movement.
- The current CI workflow runs the Firebase Security Rules/emulator concurrency gate, unit/penetration suite, TypeScript/lint, production build and final release audit. A green run must be tied to the exact candidate SHA.
- No live Firebase/Stripe operation, deployment, AI Studio Pull/Push, merge, or `main` write was performed during this review.

### Next execution order

1. Obtain the exact integration head SHA and current Actions run/job state; do not rely on historical run numbers.
2. Correct and functionally test the payout replay-barrier lease-fencing finding.
3. Complete the coherent FIN-04 durable operation/event-delivery recovery batch, including the Section 165 failure matrix.
4. Implement FIN-05 as a read-only evaluator with discrepancy fixtures.
5. Re-run the full CI gate on the consolidated integration commit and record exact SHA, run ID, all job outcomes and evidence.
6. Keep the integration branch as the only write target. Do not merge PR #5, change `main`, deploy, or touch production Firebase/Stripe state.


## Section 172 — Lease-fenced existing-operation replay barrier (11 November 2026)

### Implementation

- Corrected `src/server/driverPayoutOrchestration.ts`: when a deterministic `driver_payout_operations` record already exists, the orchestrator now opens a Firestore transaction, re-reads the ride, and writes `reconciliation_required` only if the exact `payoutClaimToken` acquired by this worker is still current.
- If the claim token has changed, the transaction leaves the ride untouched and the result still reports `reconciliation_required` with the existing-operation reason. The durable operation remains a replay barrier; no new Stripe transfer is attempted.
- Added a functional regression in `tests/unit/driverPayoutOrchestration.test.ts`. The operation lookup hook changes the ride to a successor token/status and writes a successor-owned diagnostic before the transaction. Assertions require that token, status, diagnostic and unpaid flag remain unchanged, and that Stripe transfer creation is never called.

### Commits and CI

- Production-code correction: `d32a13a3685f27360d71fbbdd643f6b5a0f380b2`.
- Functional regression test: `6139a0abe3eb93c04a3346952ebaed6da89ffce5`.
- The integration branch head at this checkpoint is `6139a0abe3eb93c04a3346952ebaed6da89ffce5`; comparison against `main` is **523 ahead, 0 behind**.
- Push-triggered CI run **#953** (`43101354860`) is associated with the exact test commit SHA and was `in_progress` when inspected. Job `security-and-build-gate` was also `in_progress`.
- Earlier push-triggered run **#952** (`43101326715`) for the code-only commit was also `in_progress` at inspection. Neither run is recorded as passing.
- The commit combined-status endpoint returned an empty status list. This is not a green check.
- The regression has been committed but has **not** been executed locally in this session. Wait for CI and inspect the unit test step/logs before considering it validated.

### Remaining work

1. Inspect run #953 to completion and read failing step logs if it fails; fix only on this integration branch.
2. Complete FIN-04 durable per-consumer event delivery/retry and operation recovery with functional crash-boundary tests.
3. Implement FIN-05 read-only financial discrepancy evaluation and fixtures.
4. Re-run the full CI gate on the final consolidated candidate SHA and record all job outcomes.
5. Do not merge PR #5, modify `main`, deploy, or touch production Firebase/Stripe state.


## Section 173 — FIN-04 idempotency stop-state and key-path hardening (11 November 2026)

### Classification correction

The formal FIN-04 in `FINANCIAL_RECONCILIATION_PLAN.md` is **generic idempotency resource/payload binding**, not domain-event consumer delivery. Section 171's domain-event delivery/retry observation is retained as a supplementary reliability finding, but it does not replace or redefine FIN-04. FIN-04's binding/hash/claim implementation was already present on the integration branch; this checkpoint closes two additional gaps discovered in the final audit.

### Additional defects corrected

- `executeIdempotentOperation` previously changed an expired `in_progress` record to `reconciliation_required` and correctly rejected that same invocation, but a later invocation did not explicitly reject the persisted `reconciliation_required` state. It could fall through and replace the stop state with a fresh `in_progress` claim, potentially repeating an ambiguous external financial effect.
- The operation document used the caller-provided idempotency key directly as a Firestore document ID. Request-originated keys containing `/` could be interpreted as nested document paths; excessively long keys also lacked a bounded input contract.

### Changes committed

- `src/server/paymentLedger.ts`: persisted `reconciliation_required` records now remain a hard conflict on every subsequent retry. Unknown existing operation states fail closed and require reconciliation. Idempotency keys are rejected before Firestore access if they contain `/` or exceed 200 characters.
- `tests/unit/paymentLedger.test.ts`: the expired-claim test now retries after the first reconciliation-required transition and proves the executor remains uncalled and the original claim token/status remain intact. Added canonical key-order replay coverage, owner/resource mismatch conflicts, and slash/oversized-key rejection.
- Code commit: `d8784e5ad57ad170a69dde7b9d50c4e96298d6c3`.
- Regression commit: `bce37dd205ff58046057286c9fad6b3504afda62`.

### Verification

- These commits are on `integration/pr-consolidation-20261109` only.
- CI and focused test execution are pending. Do not mark FIN-04 verified until the exact-head Actions run completes successfully and the unit-test step confirms these cases.
- The Section 171 domain-event observation remains open as a supplementary item: deterministic event-document persistence currently does not establish durable per-consumer delivery/retry. It should be addressed as a separate event-outbox/recovery workstream, not by changing the FIN-04 identifier.


## Section 174 — Exact-head CI validation and FIN-05 handoff (11 November 2026)

### Exact-head verification

The integration branch head was re-fetched as `c6cddd4cef5b5aa93f4e92ca59a21f18e5f0e6bb`. Push-triggered GitHub Actions run **#958** (`43101671335`) for that exact SHA completed with conclusion **success**.

The single `security-and-build-gate` job completed successfully, including all of these steps:
- Firebase Security Rules and real Firestore emulator concurrency tests
- Unit and penetration-testing suite
- TypeScript/linter checks
- Production build
- Final release audit

This validates the committed payout lease-fencing regression and FIN-04 idempotency hardening as part of the full CI gate at the exact branch head. It does not establish live Stripe/Firebase production state, nor does it authorize deployment or merge.

### Updated financial workstream status

- **FIN-04:** generic idempotency binding and stop-state/key-path hardening have passed the exact-head full CI gate.
- **Payout orchestration:** existing-operation replay-barrier state writes are claim-token fenced; the functional stale-worker regression passed within run #958.
- **FIN-02:** refund pagination and Instant Match refund orchestration are included in the same green branch-head CI run. Production reconciliation remains read-only/unperformed.
- **FIN-01:** webhook lease fencing is implemented; route-level/concurrent stale-worker financial-side-effect tests remain an acceptance gap.
- **FIN-03:** escrow transfer identity/recovery controls are implemented; continue reviewing end-to-end recovery evidence and ambiguity boundaries.
- **FIN-05:** remains the next primary implementation workstream. Build a pure read-only cross-operation discrepancy evaluator and fixture matrix before wiring any runner.
- **Supplementary domain-event delivery:** per-consumer durable delivery/retry remains open and separate from formal FIN-04.

### Next execution

1. Design FIN-05 input contracts and invariant findings without coupling to Firestore or Stripe clients.
2. Add deterministic fixtures for missing, duplicate, orphaned, mismatched and over-allocated financial records.
3. Prove evaluator purity: no writes, no Stripe calls, no mutation of input snapshots.
4. Separately close FIN-01 route-level stale-worker tests and supplementary domain-event consumer delivery.
5. Keep all writes on `integration/pr-consolidation-20261109`; no merge, deployment, production mutation, or AI Studio Pull/Push.


## Section 175 — FIN-05 pure evaluator started; working memory checkpoint (11 November 2026)

### Durable current state

- Repository: `Saanwar2002/AnyTrader`.
- Sole write target: `integration/pr-consolidation-20261109`. Never write `main`, create a branch, merge PR #5, deploy, mutate production Firebase/Stripe, or use AI Studio Pull/Push.
- Branch head before this FIN-05 batch: `686875b1775a5026f04339fc049bd7cfcacfc223`; both documentation CI runs #959 and #960 completed successfully.
- Exact code-level CI evidence immediately before FIN-05: run #958 at `c6cddd4cef5b5aa93f4e92ca59a21f18e5f0e6bb` succeeded across emulator/security, unit/penetration, type/lint, production build and release audit. Do not transfer that green status to later commits.

### FIN-05 implementation in progress

Added `src/server/financialReconciliation.ts`, a pure snapshot-based evaluator with no Firestore/Stripe/network dependencies. It returns deterministic, sorted findings and counts for:
- duplicate ledger IDs;
- missing/mismatched capture ledger amount/currency;
- duplicate/orphaned/mismatched succeeded refunds and cumulative refund totals over capture;
- payout operation vs Stripe transfer amount/currency/destination mismatches and missing Stripe evidence;
- released escrow lacking a transfer identity or referencing absent/mismatched transfer evidence;
- orphan Stripe transfers;
- payout destination allocations exceeding an explicitly supplied authorised cap (never inferred).

Added `tests/unit/financialReconciliation.test.ts` covering balanced lifecycle, missing/duplicate/mismatch cases, orphan and over-refund cases, escrow/payout/transfer mismatch, explicit payout cap, input immutability and deterministic output.

Commits:
- evaluator: `638dc4ab112d3303b10ad90add8fbba05e53ebcc`
- initial tests: `051c3e42c3a441945f81e9c4b0e4dc9701a55a2d`
- typed cap refinement: `0a80f0e752b5010ca95cc17e7ba156c7e81b900a`
- allocation-cap regression: `1466f8e5852ffe4aa7d2c75fc5f9c1c0af9bcc75`

### Verification / immediate next actions

- This is a new unvalidated code batch. Check latest branch head and Actions run; wait for exact-head CI. No local test execution is claimed.
- Review typecheck/test output carefully; fix any issues only on this integration branch.
- Evaluator is not wired to a scheduled/admin endpoint; it only processes caller-supplied snapshots. Any future runner must be separately authorized, read-only, bounded/paginated, and must not auto-repair or initiate money movement.
- Continue FIN-05 acceptance tests and review assumptions around duplicate IDs, multiple capture ledger entries, and transfer linkage before declaring complete.
- FIN-01 stale webhook route-level tests and supplementary durable domain-event consumer delivery remain open.


## Section 176 — FIN-05 cross-link hardening (12 November 2026)

- Evaluator now reports duplicate Stripe transfer IDs as critical and flags refund ledger entries linked to a different PaymentIntent than the Stripe refund snapshot.
- Added regression coverage for both cross-link defects.
- Commits: `88e545b7f05375d332313b61582f3ed88816d31e` (evaluator), `692e9cf6a0ead3a035b2fb67b2432fd6dca9c6d1` (tests).
- CI run #968 (SHA `692e9cf6a0ead3a035b2fb67b2432fd6dca9c6d1`) is pending; prior FIN-05 runs were still in progress. Do not call FIN-05 validated until exact-head full gate passes.
- FIN-05 remains snapshot-only; source data collection/pagination and an operator-controlled read-only report are not implemented. No auto-repair or money movement.
- Next: exact-head CI, then add the read-only bounded snapshot collector and audit/report integration only after schema mapping and permission review. FIN-01 route-level stale-worker test and durable domain-event consumer delivery remain outstanding.


## Section 177 — FIN-05 CI syntax failure identified and repaired (12 November 2026)

- Exact test commit `692e9cf` failed the Unit & Pen-Testing stage because the FIN-05 test file contained a literal escaped newline sequence before the immutability test (esbuild syntax error at line 91). The evaluator code itself passed the earlier run #967 at `88e545b`.
- Corrected the test source; new commit `723475d38860444911554ead29b3d27d60c5705d`. Confirmed source now has a real newline and the test block parses structurally.
- New exact-head CI is pending. Do not consider FIN-05 accepted until it passes unit suite, TypeScript/lint, build and final audit.
- All prior runs #968–#970 failed solely at the same FIN-05 test syntax parse; 1,264 existing tests passed, with the new test suite unable to load. Fix is on integration only.


## Section 178 — FIN-05 bounded collector implemented and exact-head CI green (12 November 2026)

- Added `src/server/financialReconciliationCollector.ts`: read-only bounded Firestore scans for ledger, payout operations, PaymentIntent registry, refund totals/operations/records, jobs and nested quotes; Stripe PaymentIntent retrieval plus fully paginated refunds/transfers.
- Collector rejects malformed identities/pages, non-advancing cursors and exhausted document/lookup/page budgets rather than returning a truncated report. It has no write/create/update/capture/refund/transfer calls.
- Cross-check inputs include Stripe-authoritative destination-charge detection (`transfer_data.destination`), released milestone-to-ledger link presence, escrow net payout amount, and refunds sourced even if ledger evidence is absent. Evaluator flags missing escrow ledger evidence and reconciliation-required payouts without transfer IDs.
- Added collector fixtures for pagination, balanced reconciliation, orphan refund, absent release ledger, destination charge and budget failure.
- Exact current integration HEAD `acd6834e2591829be2ace6f238206711b404922e` passed Actions run #983 (`43131521528`) end-to-end: emulator/security, unit & pen-testing, TypeScript/lint, production build, release audit.
- FIN-05 now has a bounded read-only collector + evaluator, but is **not yet operationally run against production**; no report, production read, or money movement was performed here. Schema coverage and source completeness still need review (including refund-record variants and historical milestone schemas).
- Next: document operator invocation/credentials and a safe dry-run/report entry point (no automated endpoint/cron yet); test stale FIN-01 route/webhook worker; durable domain-event consumer retry remains separate.


## Section 179 — FIN-01 Stripe webhook stale-lease terminal-write fencing (12 November 2026)

- Extracted claim-owner-checked terminal transitions into `completeStripeWebhookClaim` and `failStripeWebhookClaimIfOwned` in `src/server/stripeWebhookIdempotency.ts`; production webhook completion/failure handlers now use these helpers.
- Regression tests cover owner completion, stale worker unable to complete a successor lease, stale worker unable to mark successor failed, and current owner failure.
- Exact integration HEAD `1cde50b25ea8de0d9c901f34871febac747d1bd1` passed full CI run #986 (Firebase emulator/security, unit/pen-testing, TypeScript/lint, production build, final audit).
- This closes the claim-token terminal-write race at helper/handler level. Route-level concurrency/integration coverage (two actual webhook handler executions with lease takeover) remains a follow-up; do not equate this with full end-to-end webhook race verification.
- Next: finish FIN-05 source schema audit and prepare a strictly operator-only dry-run report interface; then route-level stale payout/webhook integration tests and durable domain-event delivery retry.


## Section 180 — FIN-05 source-schema audit (12 November 2026)

Cross-checked the collector's assumptions against current writers:
- `payment_ledger` entries carry `entryId`, `transactionId`, `amount`, `netPayout`, `type`, `status`, `jobId`, `quoteId`, `milestoneId`; release entries use immutable `escrowReleaseLedgerId` on the quote milestone and Stripe transfer metadata `jobId/quoteId/milestoneId/releaseOperationId/operationType=ANYTRADER_ESCROW_RELEASE`.
- Refund records are keyed by Stripe refund ID and persist PaymentIntent in `transactionId`, `stripeRefundId`, amount/currency/status; refund operations persist `paymentIntentId/requestedAmountPence/status/stripeRefundId`; aggregate uses `refundedAmountPence` and `paymentIntentId`.
- Checkout PaymentIntent registry uses an internal `intentId` doc key and persists external `paymentIntentId` separately; collector correctly reads the external ID field rather than treating doc ID as a Stripe ID.
- Release milestone state is stored in `jobs/{jobId}/quotes/{quoteId}.milestones[]`; release transaction writes matching ledger row atomically. Stripe transfer amount is `netPayoutPence` (minor units), not gross milestone amount.
- Stripe transfer metadata and payout operation shape are aligned with evaluator fields; destination charge release correctly avoids platform transfer expectation.

Still not a live audit: legacy/partial historical records can omit linkage, which intentionally surfaces findings or manual-review exceptions. Production data and credentials were not accessed.


## Section 181 — Reconciliation candidate and Gemini hand-off readiness (12 November 2026)

- Integration HEAD 38b417309fa8b44ed0cbd3c2724a05dea10b6768 is exact-head CI green: Actions run #990 (43177128010) completed successfully, including security/emulator, unit/pen-testing, TypeScript/lint, production build and release audit.
- Financial remediation is substantially implemented across FIN-01 through FIN-05. Detailed acceptance matrix and residuals are in FINANCIAL_RECONCILIATION_PLAN.md; remaining work is explicit (route-level concurrency test, historical-source coverage, operator-only FIN-05 report path/live read-only audit, and separate domain-event delivery reliability).
- Added GEMINI_AI_STUDIO_RECONCILIATION_HANDOFF.md for safe branch sync: compare workspace first, preserve AI Studio-only changes, pull this branch only after backup/diff review, and push Gemini edits to integration—not main—then validate exact SHA CI.
- No AI Studio Pull/Push was executed; no production Firebase/Stripe access or money movement occurred. Main/PR #5 remain untouched.
