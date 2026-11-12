# AnyTrader — Master Build Plan
**Single source of truth for development, remediation, feature delivery and release readiness**

Last reconciled: 8 November 2026  

> **Owner-confirmed scope (8 Nov 2026): AnyTrader ONLY. AnyRoller is out of scope. No AnyRoller feature work or behavior changes; shared infrastructure changes must preserve AnyRoller compatibility and require an explicit scope decision if unavoidable.**
Repository: [Saanwar2002/AnyTrader](https://github.com/Saanwar2002/AnyTrader) · Branch: `main`

> **Authority:** This document replaces scattered implementation checklists and phase roadmaps. Update this file whenever a task changes state. `DEVELOPMENT.md` remains the detailed architecture/change-history guide; `AGENTS.md` remains mandatory agent instructions. Technical specifications and completed audit reports remain supporting evidence, not competing plans.

## 1. Operating rules (mandatory)
0. **Pre-code environment gate:** Before any code change, complete [AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md](AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md): verify AI Studio ↔ GitHub parity, Firebase project/named database, deployed rules/indexes, Auth/Storage/App Check, IAM/secrets, emulator/build baseline and staging. If workspace divergence or Firebase target uncertainty exists, STOP and reconcile; never blindly overwrite.

1. Read `AGENTS.md` and the relevant sections of `DEVELOPMENT.md` before work. For shared services, Firebase schema/blueprint, Firestore rules or Storage rules, read DEVELOPMENT first.
2. Work in dependency order. Do not start a downstream task while its prerequisite is failing.
3. Treat browser/mobile clients and all submitted fields as untrusted. Authorization, identity, prices, roles, lifecycle transitions and payment outcomes must be server-authoritative.
4. For each change: define acceptance criteria → implement smallest safe change → add/update tests → run targeted tests → run full relevant suite → typecheck/build/release audit → review diff → update this plan and DEVELOPMENT.md.
5. Never mark a task complete based only on an old report or a claimed test count. Record the latest CI run/commit and observed result.
6. No production release while CI is red, a P0/P1 security issue is open, production configuration is unverified, or rollback/monitoring is missing.
7. Do not commit credentials, live customer data, test dumps, generated build output, or secrets. Use environment examples with placeholders.
8. Keep changes scoped. Do not delete code, configuration, data, audit evidence or technical specs merely because they look old; prove they are unused first.

## 2. AI Studio / Firebase pre-change gate (mandatory)
- [ ] Confirm AI Studio project/repository/branch and working tree match GitHub; reconcile any drift before editing.
- [ ] Verify `anytradercombined`, named database ID and whether default database is intentionally active; compare deployed rules/indexes to repo.
- [ ] Verify Auth providers/domains/verification, Storage bucket/rules, App Check, service-account IAM, server secrets and API restrictions.
- [ ] Confirm client/Admin SDK database selection and all fallback authorization invariants.
- [ ] Run baseline npm + emulator + AI Studio compile/preview; record current CI and applet revision.
- [ ] Review service-worker Firebase Storage cache behavior and private-media account-switch/logout behavior.
- [ ] Establish staging deployment, rollback and monitoring before production changes.

**Exit gate:** AI Studio/GitHub parity is known, Firebase targets/settings verified, baseline green (or failures documented), and deployment rollback exists. See [AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md](AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md).

## 3. Current verified baseline and release posture

**Current GitHub main baseline:** commit `4b7963c831acbb2ea6f3084f9f4d069fb772792a` (8 Nov 2026). Remediation work is isolated in draft PR branches; neither PR has been merged.

- Product scope: AnyTrader only (Home/Trades, Business/Consultancy, Properties and related AnyTrader workflows). AnyRoller passenger/driver/ride work is excluded. Shared infrastructure is considered only where required for AnyTrader and must not change AnyRoller behavior.
- Stack: React 19 + TypeScript + Vite; Node/Express API; Firebase Auth, Firestore and Storage; Stripe Connect; Gemini; Capacitor Android/iOS.
- Security/domain modules exist for authorization, identity, driver/trip eligibility, payment ledger, pricing catalog and state machines; adversarial, emulator and unit tests are substantial.
- Large maintenance hotspots: `server.ts` (~271 KB), `AnyTraderAdmin` (~413 KB), `JobDetails` (~333 KB), `PassengerBooking` (~317 KB), `DriverTerminal` (~319 KB). Refactor only behind behavior tests.
- TypeScript currently uses permissive options (`strict:false`, `noImplicitAny:false`, `skipLibCheck:true`, `allowJs:true`). `npm run lint` is currently typecheck, not a dedicated ESLint ruleset.
- Current CI evidence (8 Nov 2026): draft PR #2 payment-security branch passed the complete release gate in run #279 (589/589 emulator/security tests; 1,074/1,074 unit/penetration tests; typecheck/lint, build and release audit). Draft PR #1 now passes the complete release gate on head `48c38a3033d73de48bc4bd71eaba8c23a17e7cd4` in run #42512924453: 589/589 emulator/security tests, 1,069/1,069 unit tests, typecheck/lint, build and release audit. The release audit reported 0 critical failures and 7 non-critical warnings; CI also reports deprecated GitHub Actions/Node runtime notices. Diagnostic PR #4 independently passed the same PL-08 test and complete suite in run #42512098364. Documentation PR #3 passed run #42483461173. All remediation branches remain draft/unmerged; do not treat branch CI as proof that `main` or production is updated.
- Live Google AI Studio workspace parity, deployed Firestore rules/indexes for both named and default databases, Firebase Auth/Storage/App Check, IAM, production secrets, Stripe/Cloud Run and app-store state are **not independently verified**. The Firebase connector is available but has not yet been connected; no live settings or deployments were changed.

**Status vocabulary:** `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `PASS`, `FAIL`, `VERIFIED`. A task is `VERIFIED` only with evidence linked below.

## 4. Critical path — work in this order

### Phase 0 — Establish a truthful baseline (P0)
- [x] Capture current GitHub `main` HEAD SHA and current draft-PR CI results; retain exact failing test/run evidence.
- [x] Run the complete CI validation chain on the payment-security draft branch: `npm ci`, Firebase emulator/security/concurrency suite, unit/penetration suite, typecheck/lint, production build and release audit (run #279).
- [x] Run/confirm the complete validation chain on the invitation-security branch after PL-08 remediation; run #42512924453 passed the emulator/security suite (589/589), unit suite (1,069/1,069), typecheck/lint, build and release audit. This validates the draft branch only; merge review and live AI Studio/Firebase gates remain outstanding.
- [ ] Reconcile counts and status claims in docs against actual results; distinguish historic test results from current.
- [ ] Create a clean baseline commit/branch before remediation.

**Exit gate:** reproducible baseline and one canonical list of failures.

### Phase 1 — Close security and CI blockers (P0/P1)
- [ ] **PL-08 invitation recipient verification:** implementation and full regression coverage are in draft PR #1. Recipient direct reads require verified matching email; recipient list queries use exact email equality; acceptance is restricted to pending → accepted with server timestamp and only `status`/`acceptedAt` changes. Inviter/admin management paths are preserved. CI run #42512924453 passed all 589 emulator/security tests and 1,069 unit tests, including acceptance and protected-field tampering; diagnostic PR #4 run #42512098364 independently passed. Earlier failures were traced to the test fixture: the admin-claims assertions mutated the same invitation used by the recipient acceptance test. Admin assertions now use a separate invitation document; no security assertions were removed and no rule restrictions were weakened. Keep the task open until PR review/merge and the live AI Studio/Firebase pre-change gate are complete.
- [ ] Run all Firestore + Storage emulator suites and adversarial authorization tests; inspect failures, not just summary counts.
- [ ] Fix any additional current CI failures; do not bypass or weaken assertions to make CI green.
- [ ] Review invitation onboarding fallback and query semantics for data leakage/privilege escalation. Follow-up found: `BusinessTeamManagement.tsx` creates `type: business_team`, `role: member` invitations, while `Onboarding.tsx` currently treats any matching invitation as an admin-role selection and later rejects non-custom-claim users. Define the intended team-member role/permission/businessId flow before changing it; not modified in PR #1.
- [x] Verify Stripe webhook dependency fail-closed behavior, server-calculated membership metadata/prices, job ownership and lifecycle authorization for boost/mediation checkout, and payment regression coverage on draft PR #2; full CI run #279 passed. [PR #2](https://github.com/Saanwar2002/AnyTrader/pull/2)
- [ ] Independently verify live Stripe secrets, webhook endpoint/signing secret, Connect settings and staging payment flows before release.
- [ ] Verify ride/job lifecycle and driver eligibility checks against cross-user and race-condition cases.

**Exit gate:** all CI jobs green; no open P0/P1 findings; regression tests demonstrate intended denial and allowed paths.

### Phase 2 — Reliability, privacy and quality foundations (P1/P2)
- [ ] Review Workbox caching of Firebase Storage media. Confirm private/protected content is not cached across accounts; use network-only or safe strategy where appropriate and purge user-scoped caches on logout.
- [ ] Add/verify dependency vulnerability scanning, Dependabot, secret scanning, license/SBOM policy and a documented lockfile strategy. CI uses `npm ci`; decide whether `bun.lock` is supported or remove it only after confirming no Bun workflow relies on it.
- [ ] Replace shallow release-audit checks with focused static/security checks; keep emulator tests as source of truth for Firebase rules.
- [ ] Improve API validation, rate limits, payload limits, sanitized errors, observability/correlation IDs and health checks.
- [ ] Introduce dedicated linting and incremental TypeScript strictness (`strict`, `noImplicitAny`, `unknown` boundaries) by module, not a risky global flip.
- [ ] Add backup/restore evidence, retention/deletion verification, monitoring alerts and incident/rollback runbooks.

**Exit gate:** quality checks are automated and privacy/recovery controls have evidence.

### Phase 3 — Architecture and maintainability (P2; incremental)
- [ ] Decompose `server.ts` into domain routers/services with explicit dependency boundaries; preserve API contracts.
- [ ] Split oversized admin, job, passenger and driver screens into route/view/domain components; avoid behavior changes during extraction.
- [ ] Define shared portal contracts, canonical role/capability model, data ownership and migration/versioning policy.
- [ ] Add API contract tests and staging end-to-end flows for auth, job creation, quote/accept, payment/refund/dispute, ride booking/dispatch/completion, notifications and AI.
- [ ] Reduce stale docs/version drift (TradeQuote / MyLocalTraders / AnyTrader; V6/V7/V8 release assertions) while retaining useful historical reports.

**Exit gate:** architecture changes are behavior-preserving, documented, tested and independently reviewable.

### Phase 4 — Feature roadmap (prioritise only after gates 1–2)
Keep feature delivery behind stable security and CI. Select one bounded feature at a time, confirm scope and acceptance criteria, then add tests and update this plan.

#### 4A. Consultancy / projects / professional bidding
- [ ] Project budget and role requirements; project bids data model.
- [ ] Schedule-aware availability and professional matching.
- [ ] Project-scoped shortlists/favourites.
- [ ] Broadcast roles, professional project board, bid submission and accept/reject.
- [ ] Calendar/timeline integration and notifications.
- [ ] Keep internal budgets/financials creator-only; enforce invitation/bidder access.

#### 4B. AnyRoller / passenger / driver — OUT OF SCOPE
- No AnyRoller feature, UX, dispatch, passenger/driver, ride-admin, or native ride workflow tasks under this plan.
- Preserve existing AnyRoller code/data/configuration and shared-service compatibility. Revisit only with explicit owner authorization.

#### 4C. AI, discovery and matching
- [ ] Maintain explicit Gemini function allowlists and validated inputs; AI cannot mutate roles, authorization or money.
- [ ] Validate recommendations/search/matching for privacy, fairness, quality, cost/rate limits and abuse.
- [ ] Complete any still-open AI roadmap items only after product acceptance criteria and telemetry exist.

#### 4D. Financial reporting and integrations
- [ ] Validate provider earnings/reporting and CSV exports against authoritative ledger data.
- [ ] Calendar OAuth/token custody and event sync; secrets server-side.
- [ ] Stripe subscriptions, Connect onboarding, webhooks, refunds/disputes and tax/accounting reconciliation in staging.

**Exit gate per feature:** requirements approved, implementation/tests/docs complete, CI green, no regressions.

### Phase 5 — Staging and release readiness (P0 for launch)
- [ ] Configure Cloud Run, custom domain, Firebase authorized domains, deployed Firestore/Storage rules and indexes; record environment/project IDs safely.
- [ ] Configure production secrets in secret manager (never repository); verify Stripe webhook endpoints/signing secret, Connect settings, Gemini/Maps/Twilio as used.
- [ ] Run staging E2E across portals and critical user/payment/ride flows with synthetic accounts/data.
- [ ] Validate admin claims/RBAC, onboarding/invites, email verification, rate limits, abuse handling and data-rights requests.
- [ ] Verify backup restore, monitoring/logging, alert routing, incident response and rollback.
- [ ] Clear only confirmed test/demo data using an approved, reversible procedure; preserve audit logs/legal records.
- [ ] Test Android/iOS release builds, deep links, permissions, crash reporting, privacy disclosures and store compliance.
- [ ] Conduct independent security review/penetration test; document residual risks and sign-off.

**Release gate:** no P0/P1 open; CI green; staging checklist signed; production configuration verified; rollback and monitoring operational; owner approval recorded.

## 7. Portal and domain acceptance checklist
For AnyTrader roles/portals only (homeowner, tradesperson, business/consultancy, property/estate manager, and AnyTrader support/admin); exclude AnyRoller passenger/driver roles:
- [ ] Sign-up, verification, onboarding, role/capability assignment and recovery.
- [ ] Ownership/tenant isolation and least-privilege reads/writes.
- [ ] Core workflows and state transitions; invalid transitions rejected.
- [ ] Notifications and error/offline/loading/empty states.
- [ ] Accessible, responsive web and mobile behavior.
- [ ] Audit trail and data-rights/privacy controls where applicable.
- [ ] Unit, emulator/rules, integration and E2E coverage.
- [ ] Support/admin actions guarded and logged.

## 8. Documentation governance (single plan)
- **This file:** status, priorities, dependencies, task checkboxes, next action and release gates.
- **`AGENTS.md`:** mandatory contributor/agent rules; not a roadmap.
- **`DEVELOPMENT.md`:** detailed architecture, implementation history, schema/service changes and technical decisions. Update it after shared architecture/schema/security work.
- **Technical specs:** `DRIVER_UI_SPEC.md`, `ECOSYSTEM.md`, `security_spec.md`, `CALENDAR_INTEGRATION.md`, `CAPACITOR_PRECHECK.md`, `FINANCIAL_REPORTING_FEATURES.md` remain domain references.
- **Audit/verification reports and mission test logs:** retain as immutable historical evidence; link them here when relevant. Do not use their old “GO” status as current release evidence.
- **README:** short product overview + link to this master plan and DEVELOPMENT guide.

## 9. Evidence and decision log
| Date | Commit / CI run | Decision / result | Evidence |
|---|---|---|---|
| 2026-11-06 | `50bf91088921013bea271f2b813d6ee7a7c528e9` | Historical repository audit baseline; CI run #231 failed PL-08; release NO-GO | [Actions run #231](https://github.com/Saanwar2002/AnyTrader/actions/runs/42204388896) |
| 2026-11-08 | `4b7963c831acbb2ea6f3084f9f4d069fb772792a` | Current GitHub main baseline captured. Live AI Studio/Firebase parity remains unverified. | [Master plan](MASTER_BUILD_PLAN.md) · [Pre-change review](AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md) |
| 2026-11-08 | PR #2 head `b0278c374fdefa547649d8df971d477cef418022` · CI #279 | Payment security changes passed all CI gates; draft, unmerged. Six non-critical CI environment warnings remain. | [PR #2](https://github.com/Saanwar2002/AnyTrader/pull/2) · [Actions run #279](https://github.com/Saanwar2002/AnyTrader/actions/runs/42477284058) |
| 2026-11-08 | PR #1 head `b2b780595002c8ead0d82ff6dd3502154771bff1` · CI #283 | PL-08 still failed (588/589 security/concurrency tests); evaluation errors occurred in recipient/inviter/admin update grants. | [PR #1](https://github.com/Saanwar2002/AnyTrader/pull/1) · [Actions run #283](https://github.com/Saanwar2002/AnyTrader/actions/runs/42477980688) |
| 2026-11-08 | PR #1 head `f20ef36df3e111c4c3d17eaec5b5a9c01447ddbd` · CI #285 | Exact-email acceptance predicate did not resolve PL-08; 588/589 security/concurrency tests passed. | [Actions run #285](https://github.com/Saanwar2002/AnyTrader/actions/runs/42479435827) |
| 2026-11-08 | PR #1 head `48c38a3033d73de48bc4bd71eaba8c23a17e7cd4` · CI #42512924453 | PL-08 and complete CI passed: 589/589 emulator/security tests; 1,069/1,069 unit tests; lint/typecheck/build; release audit 0 critical failures, 7 warnings. Draft/unmerged. | [PR #1](https://github.com/Saanwar2002/AnyTrader/pull/1) · [Actions run #42512924453](https://github.com/Saanwar2002/AnyTrader/actions/runs/42512924453) |
| 2026-11-08 | PR #4 head `9a3eb40dbff8d9a74e3420838e7750b0fe49ebba` · CI #42512098364 | Diagnostic reproduction passed 589/589 emulator/security tests and 1,069/1,069 unit tests with full tampering assertions enabled; draft/unmerged duplicate of PR #1 fix. | [PR #4](https://github.com/Saanwar2002/AnyTrader/pull/4) · [Actions run #42512098364](https://github.com/Saanwar2002/AnyTrader/actions/runs/42512098364) |
| 2026-11-08 | PR #3 docs head `ade6729fbbcac298d7e23d10614f6145acb7329e` · CI #290 | Latest documentation-only commit passed all CI gates; confirms docs branch only, not app-code remediation or live config. | [Actions run #290](https://github.com/Saanwar2002/AnyTrader/actions/runs/42481290544) |
| 2026-11-08 | PR #3 docs head `73deaf6278969c56842c90eed024e80e72279984` · CI #284 | Documentation-only branch passed all CI gates; this does not validate PR #1 or PR #2. | [PR #3](https://github.com/Saanwar2002/AnyTrader/pull/3) · [Actions run #284](https://github.com/Saanwar2002/AnyTrader/actions/runs/42478433490) |

## 10. Immediate next task

**Active reconciliation task (2026-11-10):** continue validation and close the Gotham subscription/property quota remediation on `integration/pr-consolidation-20261109`.

1. Complete review of Stripe lifecycle handling, especially live status/period-end semantics and failure behavior.
2. Finish quota boundary tests: ordinary homeowner unaffected; active Gotham user can create exactly to purchased allowance; inactive/expired denied; cancellation-at-period-end retains entitlement only through the paid-through period.
3. Add server-command tests for forged fields/ownership, idempotency replay, deletion counter decrement, legacy backfill, and concurrent create/delete at the quota boundary.
4. Run emulator security rules, full unit/penetration suite, TypeScript typecheck, production build, release audit, and inspect CI results.
5. Review all diffs and verify no property creation/deletion bypasses remain. Keep PR #5 draft/unmerged until reconciliation and parity gates pass.

**Implementation already committed on integration:** Stripe Gotham lifecycle refresh and cancellation/reactivation hardening; authenticated property create/delete commands; strict property payload allowlist; per-user usage counter with first-use legacy backfill and transactional create/delete; all three property-creation UI call sites migrated; both existing UI delete call sites migrated; transfer-code verification and ownership claim moved server-side with prior/new Gotham counter adjustment; direct client create/delete and client ownership-claim updates denied in Firestore rules; direct-create/delete/transfer emulator bypass tests added. See [Gotham Property Door-Quota Reconciliation Audit](GOTHAM_PROPERTY_QUOTA_AUDIT.md) and the November 10 section in `DEVELOPMENT.md`.

**CI verification:** workflow run [42796203967](https://github.com/Saanwar2002/AnyTrader/actions/runs/42796203967) passed on code commit `111aad93e15b948ba6393d0ee24df14bf68dafea`: Firestore emulator/security/concurrency 21 files / 592 tests; unit/penetration 65 files / 1,071 tests; TypeScript/lint; production build; and release audit (0 critical failures, 7 warnings, “GO WITH EXPLICIT ACCEPTED RISKS”). CI audit warnings include missing environment values for Stripe/Gemini/JWT/app URL/allowed origins and no server Firestore client in the audit environment; confirm live environment settings separately.

**Verification still outstanding:** API-level Gotham quota boundary/forged-payload/idempotency/concurrency tests; counter reconciliation for transfer/delete races; `assertCanModifyProperty` and its simulation test are now aligned with server-only ownership claims (latest follow-up CI attempt did not obtain a runner); live AI Studio/Firebase parity; named Firestore database deployed rules/indexes; staging smoke test; and actual production secret/IAM configuration. Do not merge or deploy.

**Safeguards:** keep `main`, AI Studio, and production untouched; do not modify AnyRoller/taxi behavior; do not weaken security tests/rules; do not merge or deploy without complete green CI and owner approval.
