# AnyTrader CI/CD Pipeline & Testing Architecture

**Prepared:** 14 November 2026  
**CI Config:** `.github/workflows/ci.yml` (`CI & Security Rules Release Gate`)

---

## 1. GitHub Actions CI Pipeline (`.github/workflows/ci.yml`)

Triggered on `push` and `pull_request` to `main`, `master`, and `integration/**`, plus `workflow_dispatch`:
1. **`actions/checkout@v4`**
2. **`actions/setup-node@v4`** (`node-version: 22`, `cache: 'npm'`)
3. **`actions/setup-java@v4`** (`distribution: 'temurin'`, `java-version: '21'`) — **required for Firebase Emulator**
4. **`npm ci --legacy-peer-deps`**
5. **`npm run test:security-rules`** (21 emulator-backed security & concurrency test suites against `demo-anytrader`)
6. **`npm test`** (unit, integration, state-machine, financial & penetration suites excluding emulator tests)
7. **`npm run lint`** (`tsc --noEmit`)
8. **`npm run build`** (`vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`)
9. **`npm run audit:release`** (`node scripts/final-release-audit.mjs`)

---

## 2. Test Suite Organization (`101` files under `tests/unit/`)

### A. Unit & Integration Suite (`npm test`)
Runs Vitest across non-emulator unit, command, authorization, penetration, and financial tests, including all **Task-616** & FIN-01–FIN-05 suites:
- `tests/unit/task6StripeWebhookTakeover.test.ts` (FIN-01 lease takeover, two-worker concurrent barrier & clock-expiry fencing, transient failure retryability)
- `tests/unit/task6EscrowRecoveryEvidence.test.ts` (FIN-03 strictly read-only transfer evidence inspection)
- `tests/unit/task6ReconciliationReport.test.ts` & `tests/unit/task6ReconciliationReportRoute.test.ts` (FIN-05 admin report validation & route RBAC)
- `tests/unit/financialReconciliation.test.ts` & `tests/unit/financialReconciliationCollector.test.ts`
- `tests/unit/stripeRefundPagination.test.ts`, `tests/unit/refundReconciliation.test.ts`, `tests/unit/instantMatchRefundReconciliation.test.ts`
- `tests/unit/mediationStake.test.ts`, `tests/unit/checkoutIntentIntegrity.test.ts`, `tests/unit/paymentLedger.test.ts`
- `tests/unit/unauthenticatedAttackerMission1.test.ts` through `mission5StateMachinePenetration.test.ts`
- `tests/unit/adversarialPlatformSecurity.test.ts`, `adversarialRedTeam.test.ts`, `gothamPropertyQuota.test.ts`, `subscriptionLifecycle.test.ts`

### B. Firebase Emulator Security Rules & Concurrency Suite (`npm run test:security-rules` / `npm run test:emulator`)
Executes `--no-file-parallelism` inside `firebase emulators:exec --project demo-anytrader --only firestore,storage`:
- `firebaseEmulatorSecurityRules.test.ts`, `firebaseEmulatorIntelligenceV81.test.ts`
- `task5FirestoreConcurrency.test.ts`, `task6FirestoreConcurrency.test.ts`, `task7FirestoreConcurrency.test.ts`, `task35EFirestoreConcurrency.test.ts`
- `task16TierBStorage.test.ts`, `task17PropertySecurity.test.ts`, `task19–25`, `task27–32`
> **Sandbox Constraint (Honest Verification Note):** `java` is not installed in the Google AI Studio runtime container, so emulator suites cannot run inside AI Studio and are marked `NOT VERIFIED locally — must execute in Java-21 workstation / GitHub Actions CI` prior to production merges.

---

## 3. Release Gate Script (`scripts/final-release-audit.mjs`)

- Verifies presence of `17` mandatory security, server, rules, and core test files.
- Scans `storage.rules` and `firestore.rules` for unsafe `allow read, write: if true` wildcards.
- Executes `runProductionChecks(process.env)` checking secret presence/entropy (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `JWT_SECRET`, `APP_URL`, `ALLOWED_ORIGINS`), `ALLOW_MOCK_PAYMENTS`, HTTPS/CORS, and server DB readiness.
- Exits `0` cleanly when `criticalFailures === 0` (emitting `GO` or `GO WITH EXPLICIT ACCEPTED RISKS` when dev env vars are intentionally absent locally).

---

## 4. Verification Protocol Before Merging or Pushing

1. `npm test` — All unit & mocked integration tests passing.
2. `npm run lint` (`npx tsc --noEmit`) — Zero TypeScript errors.
3. `npm run build` — Both Vite SPA & `esbuild` CJS server bundles compile cleanly.
4. `npm run audit:release` — 0 critical failures.
5. **In GitHub Actions / local Java 21 workstation**: `npm run test:security-rules` (all 21 emulator suites passing).
