# Gemini execution prompt — AnyTrader reconciliation continuation

**Workspace/repository:** AnyTrader — `Saanwar2002/AnyTrader`  
**Required source branch:** `integration/pr-consolidation-20261109`  
**Known prepared baseline:** `38b417309fa8b44ed0cbd3c2724a05dea10b6768` (later docs commits may advance it; fetch the live branch HEAD before pulling)  
**Primary plan:** `FINANCIAL_RECONCILIATION_PLAN.md`  
**Unified plan:** `docs/UNIFIED_CODEBASE_RECONCILIATION_PLAN.md`  
**Sync guide:** `GEMINI_AI_STUDIO_RECONCILIATION_HANDOFF.md`

## Role and goal
Act as the implementation and verification agent for the AnyTrader financial reconciliation plan. Continue from the integration branch; do not restart or replace completed work. Your goal is to close outstanding acceptance criteria with small, reviewable, tested commits and durable plan updates.

## Mandatory safety and repository rules
1. Work ONLY in `integration/pr-consolidation-20261109`. Never commit/push to `main`, merge PR #5, create a new branch, deploy, or force-push.
2. Product scope is AnyTrader only. AnyRoller is out of scope; preserve shared behavior.
3. Before changing shared services, database schema/blueprint, Firestore rules or Storage rules, read `DEVELOPMENT.md` and `AGENTS.md`; update `DEVELOPMENT.md` for architecture/schema changes.
4. First fetch current GitHub branch HEAD and verify the AI Studio workspace is linked to the correct repository/branch. Save a backup and compare local AI Studio source with remote integration. Preserve unique AI Studio edits. If divergence cannot be safely resolved, STOP and report it—do not overwrite.
5. Never perform production Firebase reads/writes, deploy, Stripe capture/refund/transfer, or money movement. Do not expose secrets or add credentials to files/logs. No AI Studio Pull/Push until the user has compared and authorized the sync.
6. Keep changes narrow. Inspect existing implementation/tests before editing; avoid duplicate helpers or speculative refactors. Use deterministic fixtures/emulators, not production data.
7. Do not claim a test ran unless its output or GitHub Actions proves it. CI evidence must be for the exact resulting HEAD SHA, with all required jobs/stages completed successfully.

## Pull/reconcile procedure
- Fetch latest remote integration HEAD (it may be newer than the baseline above due to plan documentation commits).
- Confirm remote is `Saanwar2002/AnyTrader`, branch exactly `integration/pr-consolidation-20261109`.
- Backup/export current AI Studio source, inventory uncommitted changes, compare divergent files and reconcile intentionally.
- Pull/sync integration branch only after the diff is understood. If UI only offers main/default branch, cancel rather than overwrite.
- After each task, commit and push to integration branch only; record commit SHA. Never push to main.

## Work queue (follow in order; update both plans after each meaningful milestone)

### A. FIN-01 — webhook lease takeover route-level regression
- Existing: `completeStripeWebhookClaim` and `failStripeWebhookClaimIfOwned` enforce owner-checked terminal writes; unit tests cover stale owner versus successor; production handler uses helpers.
- Gap: no full route-level two-execution lease-takeover integration proof.
- Inspect `server.ts` webhook route, test harness, Firebase emulator setup and test scripts. Build a deterministic integration test only if it can safely exercise two actual handler executions and lease takeover without live Stripe or production Firebase. Mock Stripe/network and use emulator/isolated test dependencies.
- Prove stale execution cannot complete/fail successor claim; prove current owner can finish. Do not loosen lease logic just to make test pass.
- If route testing requires risky server refactor or unsupported harness, document exact blocker and retain helper tests; do not label route-level gap closed.

### B. FIN-03 — read-only escrow recovery evidence
- Inspect escrow release/recovery implementation and operation state machine.
- Add safe, read-only transfer lookup/reconciliation for ambiguous or legacy outcomes if existing interfaces permit: zero/multiple candidates must stay unresolved/manual review; a unique exact metadata/amount/currency match may be recorded as evidence through an explicit authorized workflow only.
- Never create a replacement transfer, retry a financial effect, or mutate production during reconciliation. Test zero, one exact, multiple, mismatch, legacy metadata and pagination/error cases with mocks.
- If safe evidence-only design cannot be established, document blocker and acceptance boundary rather than inventing recovery.

### C. FIN-05 — safe operator-only report path + historical schema coverage
- Existing: `src/server/financialReconciliationCollector.ts` (bounded read-only Firestore/Stripe collection), `src/server/financialReconciliation.ts` (pure evaluator), focused unit tests, current-writer schema audit.
- Inspect current Admin SDK/database initialization, scripts, environment conventions and access controls. Prefer an explicit local/operator CLI or protected administrative invocation over a public HTTP endpoint, cron, or automatic execution.
- Report path must be read-only, bounded, fail closed on malformed pagination/budget exhaustion, redact sensitive identifiers by default, never write/repair/send money, and clearly distinguish evidence, discrepancy, missing historical data and inconclusive scans.
- Add fixture coverage for known legacy/historical field variants and missing links only when source code/schema evidence supports them. Unknown schemas should produce review findings—not guessed mappings.
- Do not execute against production. Provide documented dry-run/mock invocation and explicit operator preconditions for any future authorized live read-only run.

### D. Supplementary domain-event consumer reliability (separate from FIN acceptance)
- Inspect dispatcher/consumer semantics, retries, ack ordering, idempotency and dead-letter behavior. Do not conflate this with FIN-01…FIN-05 acceptance.
- Implement durable per-consumer delivery/retry only if existing architecture supports safe idempotency and bounded backoff; add tests for transient failure, process interruption, duplicate delivery, poison event and recovery. Avoid broad redesign.

## Verification and documentation
- Run relevant focused tests, then the repo's prescribed full sequence as feasible: `npm ci`, `npm test`, `npm run test:security-rules`, `npm run lint`, `npm run build`, `npm run audit:release`. Preserve emulator isolation and AnyTrader scope.
- Update `FINANCIAL_RECONCILIATION_PLAN.md` and `docs/UNIFIED_CODEBASE_RECONCILIATION_PLAN.md` with: changed files, commit SHA, exact tests/results, open gaps, safety boundaries and next step. Update `DEVELOPMENT.md` if architecture/schema changes.
- Commit/push each coherent increment to integration. Wait for full GitHub Actions gate on exact pushed SHA. Fix failures on integration and rerun. No green claim based on ancestor SHA.
- Finish with a concise report: current branch/HEAD, tasks closed vs open, test/CI evidence, AI Studio sync status, and explicit statement that main/deployment/production financial actions remain untouched.

## Immediate first action
Fetch the current integration branch HEAD and reconcile/backup the AI Studio workspace before any pull. Then inspect the current FIN plan and code to choose the smallest safe outstanding acceptance test. Do not start unrelated product features.
