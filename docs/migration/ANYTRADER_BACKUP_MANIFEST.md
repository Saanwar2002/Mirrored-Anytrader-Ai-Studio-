# AnyTrader Pre-Migration Backup & Verification Manifest

**Generated:** 14 November 2026  
**Workspace Root:** `/app/applet`  
**Scope:** AnyTrader-only pre-migration backup preparation & FIN-01 integration verification. No destructive actions, no pushes, no live Firebase/Stripe mutations performed.

---

## 1. Workspace Inventory Summary (Verified on Disk)

| Category | Count / Reference | Notes |
|---|---|---|
| Total source files (`src/`) | `338` files | `177` components (`src/components/`), `58` services (`src/services/`), `40+` backend modules (`src/server/` + `intelligence/`) |
| Backend entry / workers | `server.ts` (`7,852` lines), `instantMatchWorker.ts` | Single-process Express + Vite/static SPA |
| Unit & Emulator test files (`tests/`) | `101` files under `tests/unit/` | Split between `npm test` (unit/integration) & `npm run test:security-rules` (21 emulator suites) |
| Root markdown docs | `67` files (`*.md`) + `docs/` | Includes `AGENTS.md`, `DEVELOPMENT.md`, `FINANCIAL_RECONCILIATION_PLAN.md`, `GEMINI_AI_STUDIO_RECONCILIATION_HANDOFF.md` |
| Migration docs (`docs/migration/`) | `12` files | Newly created complete preservation & migration suite |
| Utility scripts (`scripts/`) | `3` scripts | `final-release-audit.mjs`, `set-admin-claim.ts`, `debugStorageRulesApi.ts` |
| Public web/PWA assets (`public/`) | `8` files | `manifest.json`, icons, `robots.txt`, `llms.txt` (`public/assets/aistudio/` cleanly absent) |
| Native mobile configs | `android/`, `ios/`, `capacitor.config.json` | App ID `com.anytrader.app`; includes `google-services.json` & `GoogleService-Info.plist` |
| Backup archives (`_workspace_backup/`) | `3` `.tar.gz` files (~10.5 MB) | Ignored by `.gitignore`; SHA-256 checksums recorded in `ANYTRADER_AI_STUDIO_WORKSPACE_PRESERVATION.md` |
| Live `.env*` secret files on disk | `0` (`None`) | `.env`, `.env.local`, `.env.production` absent |
| `.git` directory inside sandbox | **ABSENT** | `NOT VERIFIED` locally via git CLI; requires offline ZIP export + workstation git verification |

---

## 2. Preserved Task-616 Financial Reconciliation Files (`11 / 11` Verified Intact)

1. `src/server/stripeWebhookHandler.ts`
2. `src/server/escrowRecovery.ts`
3. `src/server/reconciliationReport.ts`
4. `server.ts`
5. `tests/unit/task6StripeWebhookTakeover.test.ts` *(extended with 3 deterministic two-worker concurrent integration tests -> 8 tests total)*
6. `tests/unit/task6EscrowRecoveryEvidence.test.ts` *(7 tests)*
7. `tests/unit/task6ReconciliationReport.test.ts` *(10 tests)*
8. `tests/unit/task6ReconciliationReportRoute.test.ts` *(4 tests)*
9. `DEVELOPMENT.md`
10. `FINANCIAL_RECONCILIATION_PLAN.md` *(updated with 14 Nov 2026 FIN-01 verification evidence)*
11. `GEMINI_AI_STUDIO_RECONCILIATION_HANDOFF.md` *(updated with 14 Nov 2026 FIN-01 closure in mocked integration)*

---

## 3. External & Console Checks Status

| Dependency | Verification Status | Reason / Required Action |
|---|---|---|
| Local codebase, configs, `.env.example`, `docs/migration/*` | **VERIFIED** | Directly inspected & audited on disk in `/app/applet` |
| Unit / Pen-testing / FIN-01 concurrent tests / TS lint / Build / Release audit | **Executed in Validation Gate** | Results recorded in final migration report |
| Firebase Emulator Security Rules (`npm run test:security-rules`) | **NOT VERIFIED in sandbox** | `java` runtime missing in AI Studio container; execute in Java 21 workstation / GitHub Actions |
| Live GitHub repo (`Saanwar2002/AnyTrader`) branches/PRs/CI secrets | **REQUIRES MANUAL ACTION** | `.git` absent locally & repo is private (`HTTP 404` unauthenticated); inspect from authenticated workstation |
| Live Firebase (`anytradercombined` Firestore named DB + `(default)`, Auth, Storage, App Check) | **REQUIRES MANUAL ACTION** | No production GCP/Firebase CLI credentials in sandbox; export backups manually before migration |
| Live Stripe Dashboard / Secret Manager / Cloud Run env vars | **REQUIRES MANUAL ACTION** | Store/verify secrets safely outside Git before disconnecting AI Studio repo |
