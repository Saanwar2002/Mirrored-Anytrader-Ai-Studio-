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
- Current CI evidence (8 Nov 2026): draft PR #2 payment-security branch passed the complete release gate in run #279 (589/589 emulator/security tests; 1,074/1,074 unit/penetration tests; typecheck/lint, build and release audit all passed). The release audit reported six non-critical CI environment warnings for missing Stripe, Gemini, JWT and URL/origin variables. Draft PR #1 invitation-security branch still has a PL-08 failure; the latest restructuring is under validation in run #283. Do not treat historical run #231 or any draft-branch pass as proof that `main` or production is updated.
- Live Google AI Studio workspace parity, deployed Firestore rules/indexes for both named and default databases, Firebase Auth/Storage/App Check, IAM, production secrets, Stripe/Cloud Run and app-store state are **not independently verified**. The Firebase connector is available but has not yet been connected; no live settings or deployments were changed.

**Status vocabulary:** `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `PASS`, `FAIL`, `VERIFIED`. A task is `VERIFIED` only with evidence linked below.

## 4. Critical path — work in this order

### Phase 0 — Establish a truthful baseline (P0)
- [x] Capture current GitHub `main` HEAD SHA and current draft-PR CI results; retain exact failing test/run evidence.
- [x] Run the complete CI validation chain on the payment-security draft branch: `npm ci`, Firebase emulator/security/concurrency suite, unit/penetration suite, typecheck/lint, production build and release audit (run #279).
- [ ] Run/confirm the same complete validation chain on the invitation-security branch after PL-08 passes; run #283 is the current attempt.
- [ ] Reconcile counts and status claims in docs against actual results; distinguish historic test results from current.
- [ ] Create a clean baseline commit/branch before remediation.

**Exit gate:** reproducible baseline and one canonical list of failures.

### Phase 1 — Close security and CI blockers (P0/P1)
- [ ] **PL-08 invitation recipient verification:** implementation and regression tests are in draft PR #1. Recipient direct reads require verified matching email; recipient list queries use exact email equality; acceptance is restricted to pending → accepted with server timestamp and only `status`/`acceptedAt` changes. Inviter/admin update grants are separate. CI runs #255, #266, #273, #278, #280 and #281 did not pass PL-08; run #283 validates the latest separated-grant rules. Keep this blocker open until all gates pass.
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
| 2026-11-08 | PR #1 head `46fba09818a57d9b24555dd3226455a882c479f3` · CI #288 | Recipient, inviter and admin update authorization consolidated into one short-circuiting rule; validation queued. | [Actions run #288](https://github.com/Saanwar2002/AnyTrader/actions/runs/42481244881) |
| 2026-11-08 | PR #3 docs head `73deaf6278969c56842c90eed024e80e72279984` · CI #284 | Documentation-only branch passed all CI gates; this does not validate PR #1 or PR #2. | [PR #3](https://github.com/Saanwar2002/AnyTrader/pull/3) · [Actions run #284](https://github.com/Saanwar2002/AnyTrader/actions/runs/42478433490) |

## 10. Immediate next task
**Immediate next task (AnyTrader scope):** complete run #288 and fix PL-08 without weakening tests; then run the full gate. Keep PRs draft/unmerged until CI is green and the AI Studio/Firebase pre-change gates are verified. Connect the Firebase integration and verify live project/database/rules/indexes/IAM/secrets; reconcile the actual AI Studio workspace SHA with GitHub before merge/deploy. Separately define the intended business-team invitation onboarding flow. Preserve AnyRoller behavior.
