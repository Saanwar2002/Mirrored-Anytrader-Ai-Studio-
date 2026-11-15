# AnyTrader Configuration Files Inventory

**Prepared:** 14 November 2026  
**Workspace Root:** `/app/applet`

---

## 1. Root & Build Configuration Files

| File | Tracked Intent | Purpose & Key Contents |
|---|---|---|
| `package.json` | Commit | Scripts (`dev`, `start`, `build`, `lint`, `test`, `test:emulator`, `test:security-rules`, `audit:release`), React 19, Vite 6, Firebase v11 / Admin v13.7, Stripe v17.7, Capacitor v8, Vitest v4.1 |
| `package-lock.json` & `bun.lock` | Commit lockfile (verify CI uses `npm ci --legacy-peer-deps`) | Deterministic Node dependency resolution |
| `tsconfig.json` | Commit | ES2022 target, `bundler` moduleResolution, `@/*` path alias, `noEmit: true` (`npm run lint`) |
| `vite.config.ts` | Commit | React + Tailwind v4 Vite plugin, `vite-plugin-pwa` Workbox rules (`/api/.*` NetworkOnly), chunk splitting, `DISABLE_HMR` toggle, Vitest excludes |
| `.gitignore` | Commit | Excludes `node_modules/`, `dist/`, `.env*` (except `!.env.example`), `.jdk21/`, mobile synced web bundles, `_workspace_backup/`, `public/assets/aistudio/` |
| `.env.example` | Commit | Updated clean placeholder template covering all backend & `VITE_*` env vars |
| `.npmrc` | Commit | Workspace npm behavior settings |
| `metadata.json` | Commit | AI Studio applet name (`AnyTrader`), description, permissions (`camera`, `microphone`, `geolocation`), capability (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) |
| `index.html` | Commit | SEO/JSON-LD schema, CSP meta tag, `window.fetch` overwrite guard, manifest & app icon links |

---

## 2. Firebase & Security Configuration Files

| File | Tracked Intent | Purpose & Key Contents |
|---|---|---|
| `firebase-applet-config.json` | Commit (public web config + IDs) | `projectId`: `anytradercombined`, `firestoreDatabaseId`: `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`, `storageBucket`: `anytradercombined.firebasestorage.app`, `authDomain`, `appId`, `messagingSenderId`, `oAuthClientId` |
| `firebase.json` | Commit | Multi-database Firestore deployment (`ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a` + `(default)`), Storage rules target, local emulators (`127.0.0.1:8088` & `127.0.0.1:9199`) |
| `.firebaserc` | **Absent in workspace** | Not present on disk; pass `--project anytradercombined` to Firebase CLI commands or generate via `firebase use --add` locally |
| `firestore.rules` | Commit | 1,650 lines — default deny, RBAC helpers (`isAdmin`, `isJobParticipant`, `isJobDeletableByOwner`, `isPropertyOwnerOrLandlord`), field-level protected key checks, intelligence collection rules |
| `storage.rules` | Commit | 360 lines — scoped upload/read rules for jobs, public media, properties, avatars, portfolio, verifications, chats, disputes, rides, vehicles, Tier B intelligence |
| `firestore.indexes.json` | Commit | Composite and collection-group indexes across jobs, quotes, messages, properties, intelligence collections |
| `firebase-blueprint.json` | Commit | Canonical ~112 KB entity/collection data model reference for AI Studio & backend alignment |

---

## 3. CI/CD, Mobile & Public Assets

| File / Directory | Tracked Intent | Notes |
|---|---|---|
| `.github/workflows/ci.yml` | Commit | GitHub Actions workflow (`ubuntu-latest`, Node 22, Java 21 Temurin): `npm ci --legacy-peer-deps` -> `test:security-rules` -> `npm test` -> `npm run lint` -> `npm run build` -> `npm run audit:release` |
| `capacitor.config.json` | Commit | `appId: com.anytrader.app`, `webDir: dist`, `androidScheme: https`, `anytrader://` deep linking, Google FirebaseAuth provider |
| `android/` | Commit (source) | Android Gradle project (`android/app/build.gradle`, `android/app/google-services.json` present — Firebase Android client config, verify before open-sourcing) |
| `ios/` | Commit (source) | Xcode workspace (`ios/App/App/Info.plist`, `GoogleService-Info.plist` present) |
| `public/` | Commit | `manifest.json`, `app-icon.jpg`, `apple-touch-icon.jpg`, `pwa-192.jpg`, `pwa-512.jpg`, `mask-icon.svg`, `robots.txt`, `llms.txt` (`public/assets/aistudio/` was deleted & gitignored) |
| `scripts/` | Commit | `final-release-audit.mjs`, `set-admin-claim.ts`, `debugStorageRulesApi.ts` |

---

## 4. Workspace-Local / Legacy Artifacts Requiring Attention Before Git Commit

| Path | Recommendation | Reason |
|---|---|---|
| `_workspace_backup/` (3 `.tar.gz` files, ~10.5 MB total) | **Keep gitignored / store offline** | Excluded by `.gitignore`; keep safe local/cloud copies outside Git history |
| `app/applet/` & `workspace/` | **Audit / Exclude or Clean in future PR** | Historical refactor helper scripts (`replace*.cjs`, `script*.js`, `cleanupStyling.ts`, `CONSULTANCY_BUILD.md`, `TASK_15_END_TO_END_VERIFICATION_REPORT.md`); preserve in backup repo first, review before pushing to primary dev repo |
| `dist/` & `node_modules/` | **Never commit** | Generated build & package directories ignored by `.gitignore` |
