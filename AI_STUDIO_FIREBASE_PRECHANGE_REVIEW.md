# AI Studio + Firebase Pre-Code Change Readiness Review

Date: 8 November 2026  
**Product scope: AnyTrader only; AnyRoller explicitly excluded.**
Repository: `Saanwar2002/AnyTrader` (`main`)  
Review type: Static repository configuration and architecture review. **No application code, Firebase project settings or live data were changed.**

## Executive conclusion

The repository is intentionally structured for a Google AI Studio (Firebase App Hosting / applet-style) workflow with Firebase Auth, Firestore and Storage. This review applies to **AnyTrader only**; AnyRoller is out of scope. It has explicit AI Studio ↔ GitHub synchronization instructions and a dedicated Firebase applet configuration. **Do not begin code changes until the live AI Studio workspace and Firebase project are reconciled with GitHub.**

This review can verify committed configuration and source conventions. It cannot inspect the user's live Google AI Studio session, Firebase Console IAM, deployed rules/indexes, secrets, actual Firestore documents, Cloud Run revision, or runtime project access. Those require a connected authorized environment / Console verification.

## Verified repository configuration

| Area | Observed configuration | Pre-change implication |
|---|---|---|
| Firebase app config | `firebase-applet-config.json` points to project `anytradercombined`, bucket `anytradercombined.firebasestorage.app`, and named database ID `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`. | Keep project/database IDs consistent across AI Studio, client SDK, Admin SDK, rules, indexes and deployment. Firebase web API key is client-visible by design; security comes from rules, App Check/quotas and restrictions—not hiding it. |
| Firestore deployment | `firebase.json` deploys the same rules/index file to both the named database and `(default)`. | Confirm both database targets are intentional and deployed; avoid accidental schema/rules divergence. |
| Emulator | Firestore emulator `127.0.0.1:8088`, Storage `127.0.0.1:9199`, UI disabled, single-project mode. Tests use `demo-anytrader`. | Continue using isolated demo project IDs and real emulator rules tests. Never point destructive tests at production. |
| Firestore rules | `firestore.rules` contains global default deny and helpers for owner, admin, job/property participants; broad multi-domain rule set. | Any rule/schema edit requires reading DEVELOPMENT.md, emulator regression tests, query/rule compatibility review and named DB deployment verification. |
| Storage rules | `storage.rules` uses Firebase Auth and Firestore-backed authorization checks. | Verify cross-service Firestore lookups, database path and role/ownership conditions in emulator; ensure upload/download paths agree with client code. |
| Data blueprint | `firebase-blueprint.json` is the shared AI Studio/data model reference (large, ~112 KB). | Treat as canonical schema guidance; review collection fields, ownership and migration/backfill before changing entities. Avoid uncoordinated manual edits in AI Studio and GitHub. |
| Build | Vite React + Tailwind; server bundle via esbuild. `npm run build` = `vite build && esbuild server.ts...`. | Preserve Vite/AI Studio assumptions and server/client boundary. `dist` is generated output, not source. |
| AI Studio HMR | Vite config disables HMR only when `DISABLE_HMR=true`; comment says this is required in AI Studio to prevent agent-edit flicker. | Do not remove/change this without testing the actual AI Studio editing/preview behavior. |
| Scripts | `lint` is `tsc --noEmit`; unit and Firebase emulator/security suites are separately scripted; release audit script exists. | CI must run the actual emulator suite, not rely on `lint` or unit-only tests. Confirm the real supported AI Studio compile command separately. |
| Capacitor | `webDir: dist`, app ID `com.anytrader.app`, custom `anytrader` deep link, Firebase Authentication plugin configured. | Build web output before native sync; verify plugin/redirect/deep-link behavior on devices. |
| Environment | `.env.example` includes Gemini, Stripe, Maps, JWT, cron and API URL placeholders; Firebase config comes from applet JSON. | No real secrets should be committed. Confirm server secrets are supplied through secret manager/AI Studio environment, not client VITE variables. |
| Governance | `AGENTS.md` explicitly describes GitHub → AI Studio synchronization, one task at a time, emulator verification and stop-on-divergence behavior. | Follow it exactly. GitHub is not assumed to be the active AI Studio copy until compared. |

## Findings / required gates before any code edit

### Gate A — AI Studio ↔ GitHub source of truth (BLOCKING)
- [ ] Open the actual AI Studio project/workspace and identify its linked GitHub repo/branch.
- [ ] Compare AI Studio working tree/current applet revision with GitHub `main` (including uncommitted agent changes).
- [ ] Verify `AGENTS.md`, `DEVELOPMENT.md`, `MASTER_BUILD_PLAN.md`, `firebase-applet-config.json` and critical rules/config files match.
- [ ] If divergence exists, stop and reconcile explicitly; never overwrite either copy blindly.
- [ ] Confirm current applet compilation/preview baseline before changes.

### Gate B — Firebase project/database alignment (BLOCKING for Firebase work)
- [ ] In Firebase Console verify project `anytradercombined` is the intended environment and correct billing/region/ownership.
- [ ] Confirm the named Firestore database ID exists and is the active data store; confirm whether `(default)` is intentionally used too.
- [ ] Inspect live Firestore rules and indexes for both targets against repository files; capture deployed version/time.
- [ ] Verify Firebase Auth providers, authorized domains, email verification, OAuth redirect URIs and App Check configuration.
- [ ] Verify Storage bucket, deployed rules, CORS (if applicable), lifecycle/retention and protected-media access.
- [ ] Confirm service-account IAM for Cloud Run/AI Studio server/Admin SDK can access the named database; least privilege only.
- [ ] Confirm backup/PITR/restore and production vs staging isolation.

### Gate C — Security and query semantics (BLOCKING)
- [ ] Run `npm ci`, `npm test`, `npm run test:security-rules`, `npm run lint`, `npm run build`, `npm run audit:release` on the reconciled baseline (use AI Studio's supported compile action too).
- [ ] Review invitation email-verification/recipient access and latest CI failure before feature work.
- [ ] Check every client Firestore query can be satisfied by its rules (rules are not filters); check composite indexes and collection-group queries.
- [ ] Verify all Admin SDK writes perform server authorization; no fallback path bypasses invariants.
- [ ] Verify server/client SDK initialization uses the same project/database; inspect explicit `getFirestore(app, databaseId)` and Admin SDK database selection.
- [ ] Check Storage download URLs, caching, logout/account switching and private media retention.
- [ ] Confirm Stripe/Gemini/Maps credentials remain server-side when privileged; check App Check, rate limits and API-key restrictions.

### Gate D — AI Studio and deployment settings (BLOCKING for release)
- [ ] Confirm AI Studio environment variables/secrets and app preview/runtime settings.
- [ ] Confirm deployment target (Cloud Run / Firebase App Hosting / other) and actual build/start commands.
- [ ] Verify `APP_URL`, `VITE_API_URL`, allowed CORS origins, OAuth callbacks, webhook URLs and deep links per environment.
- [ ] Verify Firebase CLI deploy target/aliases and ensure rules/indexes deploy to the named database as intended.
- [ ] Confirm CI branch, protections, required checks and latest run are green.
- [ ] Test a staging deploy, smoke tests, logs, monitoring and rollback before production.

## Specific risks to investigate (not changed)

1. **Service Worker caches Firebase Storage responses with CacheFirst for up to 30 days** (`vite.config.ts`, cache name `firebase-storage-cache-v1`). If any URLs/data are user-private or tokenized, test account switching/logout and cache persistence. Default recommendation: private/protected media should be NetworkOnly or carefully scoped; do not blindly cache sensitive responses.
2. **Two Firestore databases are configured for rules/index deployment** (named database + default). Verify actual application reads/writes and both live targets; rules deployment can fail or leave inconsistent targets if a database is absent/misconfigured.
3. **Server Firestore permission fallback behavior is documented in DEVELOPMENT.md.** Validate every fallback against server-owned fields and authorization, not just IAM failure; client fallback must not permit privilege/financial/ownership mutation.
4. **AI Studio compile and standard npm build are distinct validation paths.** Keep both in the pre-change baseline when the workspace supports applet compilation.
5. **Historical test counts/status in AGENTS.md and DEVELOPMENT.md are dated snapshots.** Use current CI/emulator output as truth; reconcile documentation after actual verification.

## Product boundary (mandatory)
- Verify AI Studio workspace and Firebase configuration specifically for AnyTrader experiences and data flows.
- Do not change AnyRoller screens, ride/passenger/driver workflows, or AnyRoller-specific configuration.
- Shared Auth/Firestore/Storage/server/rules/index changes must be checked for AnyRoller impact and preserve its behavior. If safe isolation is impossible, stop and request explicit approval.
- Scope acceptance criteria and test plans to AnyTrader; run shared regression suites where needed to prove no cross-product regression.

## Safe change protocol (required for future tasks)

1. Read `AGENTS.md` and relevant `DEVELOPMENT.md` sections.
2. State the target files, data/rule impact, AI Studio impact, Firebase target/database and rollback.
3. Confirm AI Studio/GitHub parity and clean baseline.
4. Implement one bounded change.
5. Run targeted unit tests and actual Firestore/Storage emulator tests; no weakening assertions.
6. Run typecheck, production build, AI Studio compile and release audit.
7. Review full diff, verify no secrets/generated artifacts, and update DEVELOPMENT + MASTER_BUILD_PLAN.
8. Commit to GitHub; synchronize AI Studio; confirm exact SHA/parity before next task.
9. For Firebase rules/index/schema changes, deploy only to staging first, verify live target, then approved production rollout with rollback.

## Review disposition

**Status: PRE-CODE REVIEW REQUIRED / STATIC REVIEW COMPLETE.** Repository configuration is coherent in intent, but live AI Studio parity, Firebase Console configuration, IAM, deployed rules/indexes, secrets and runtime access are not independently verified here. No application code was modified by this review.
