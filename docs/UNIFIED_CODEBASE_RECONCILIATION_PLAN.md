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
