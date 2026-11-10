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
