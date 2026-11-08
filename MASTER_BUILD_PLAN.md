# AnyTrader — Master Build Plan
**Single source of truth for development, remediation, feature delivery and release readiness**

Last reconciled: 8 November 2026  
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

**Baseline reviewed:** commit `50bf91088921013bea271f2b813d6ee7a7c528e9` (6 Nov 2026). Re-check HEAD/CI before execution.

- Product: multi-portal AnyTrader ecosystem (Home/Trades, Business/Consultancy, Properties, Rides/AnyRoller, passenger and driver experiences) sharing Firebase identity/data.
- Stack: React 19 + TypeScript + Vite; Node/Express API; Firebase Auth, Firestore and Storage; Stripe Connect; Gemini; Capacitor Android/iOS.
- Security/domain modules exist for authorization, identity, driver/trip eligibility, payment ledger, pricing catalog and state machines; adversarial, emulator and unit tests are substantial.
- Large maintenance hotspots: `server.ts` (~271 KB), `AnyTraderAdmin` (~413 KB), `JobDetails` (~333 KB), `PassengerBooking` (~317 KB), `DriverTerminal` (~319 KB). Refactor only behind behavior tests.
- TypeScript currently uses permissive options (`strict:false`, `noImplicitAny:false`, `skipLibCheck:true`, `allowJs:true`). `npm run lint` is currently typecheck, not a dedicated ESLint ruleset.
- CI evidence at audit time: latest workflow run #231 failed (588 pass / 1 fail); seven consecutive failures (#225–#231). The invitation security regression PL-08 is a release blocker. Confirm current status from GitHub Actions before proceeding.
- Production deployment/configuration and live Firebase/Stripe/Cloud Run/app-store state are **not proven by repository files alone**.

**Status vocabulary:** `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `PASS`, `FAIL`, `VERIFIED`. A task is `VERIFIED` only with evidence linked below.

## 4. Critical path — work in this order

### Phase 0 — Establish a truthful baseline (P0)
- [ ] Capture current HEAD SHA, latest CI run, failing jobs/tests and branch protection.
- [ ] Run locally/CI: `npm ci`, `npm run test:security-rules`, `npm test`, `npm run lint`, `npm run build`, `npm run audit:release` (use repository scripts as defined in package.json).
- [ ] Reconcile counts and status claims in docs against actual results; distinguish historic test results from current.
- [ ] Create a clean baseline commit/branch before remediation.

**Exit gate:** reproducible baseline and one canonical list of failures.

### Phase 1 — Close security and CI blockers (P0/P1)
- [ ] **PL-08 invitation recipient verification:** enforce verified-email requirements for recipient access/claim paths in Firestore rules and server acceptance flow; retain authorized inviter/admin paths. Test unverified recipient denied; verified exact/lowercase match allowed; unrelated user denied; inviter/admin behavior retained.
- [ ] Run all Firestore + Storage emulator suites and adversarial authorization tests; inspect failures, not just summary counts.
- [ ] Fix any additional current CI failures; do not bypass or weaken assertions to make CI green.
- [ ] Review invitation onboarding fallback and query semantics for data leakage/privilege escalation.
- [ ] Verify Stripe webhook signature fail-closed behavior, idempotency, server-calculated prices, Connect destination and payout authorization with tests.
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

#### 4B. AnyRoller / passenger / driver
- [ ] Validate driver UX against `DRIVER_UI_SPEC.md` (earnings-first, safe one-thumb interaction, fare transparency).
- [ ] Validate passenger booking/history/receipt/support/account/payment/saved places journeys.
- [ ] End-to-end dispatch, location permissions, background tracking privacy, SOS and compliance/document expiry.
- [ ] Reconcile rides admin functions with central Master Admin/RBAC; no duplicate admin authority.
- [ ] Native mobile: speech, camera, geolocation/background location, push, network/offline, keyboard/safe areas and payment wallet integration; verify iOS/Android permission declarations and store requirements.

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
For each role/portal (homeowner, tradesperson, business/consultancy, property/estate manager, passenger, driver, support/admin):
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
| 2026-11-06 | `50bf91088921013bea271f2b813d6ee7a7c528e9` | Repository audit baseline; CI run #231 failed PL-08; release NO-GO | [Actions run #231](https://github.com/Saanwar2002/AnyTrader/actions/runs/42204388896) |
| 2026-11-08 | TBD | Master plan consolidated; current CI still must be rechecked | Update after Phase 0 |

## 10. Immediate next task
**Phase 0, task 1:** inspect the latest GitHub Actions run and current branch HEAD; reproduce the invitation PL-08 failure and confirm the exact current rules/acceptance code before changing it. Do not start new feature development until Phase 1 exits.
