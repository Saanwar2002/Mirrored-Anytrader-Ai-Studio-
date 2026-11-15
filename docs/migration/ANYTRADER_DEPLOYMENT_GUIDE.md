# AnyTrader Deployment Guide

**Prepared:** 14 November 2026  
**Targets:** Node/Express Unified Web App (Cloud Run / AI Studio Hosting), Firebase Rules & Indexes, and Capacitor Native (Android / iOS)

---

## 1. Unified Web & API Production Build

### Verified Commands (`package.json`)
```bash
# 1. Install exact lockfile dependencies
npm ci --legacy-peer-deps

# 2. Build Vite frontend into dist/ AND bundle server.ts into dist/server.cjs
npm run build
# Runs: vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

# 3. Start production server on 0.0.0.0:${PORT:-3000}
npm start
# Runs: node dist/server.cjs
```

### Build Artifact Notes
- Frontend bundles land in `dist/assets/` plus `dist/index.html`, `dist/manifest.webmanifest`, and Workbox `dist/sw.js`.
- Backend compiles to `dist/server.cjs` (with `dist/server.cjs.map`).
- `server.ts` production middleware explicitly blocks HTTP downloads of `/server.cjs`, `/server.cjs.map`, `*.map`, and `/assets/aistudio/*` with `404`.
- All `VITE_*` variables are baked into `dist/` at **`npm run build` time** and must be set during the build step.

---

## 2. Cloud Run / Node Production Deployment Settings

1. **Runtime**: Node.js 22 LTS (`v22.x`).
2. **Port**: `3000` (set `PORT=3000`).
3. **IAM / Credentials**: Attach service account with roles required to access Firestore named DB `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`, Firebase Auth verification, and Storage bucket `anytradercombined.firebasestorage.app`.
4. **Environment Variables**:
   - `NODE_ENV=production`
   - `APP_URL=https://<your-live-domain>`
   - `ALLOWED_ORIGINS=https://<your-live-domain>,https://www.<your-live-domain>`
   - `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, `CRON_SECRET`
   - `ALLOW_MOCK_PAYMENTS=false` and `ALLOW_DEGRADED_AUTH=false`
   - `DISABLE_IN_PROCESS_CRON=true` if deploying >1 Cloud Run instance, and trigger `POST /api/cron/:jobName` from Google Cloud Scheduler with `X-Cron-Secret`.
5. **Pre-Flight Check Behavior**:
   - At server listen, `runProductionChecks(process.env, db)` evaluates all required keys, entropy, HTTPS `APP_URL`, strict `ALLOWED_ORIGINS`, `ALLOW_MOCK_PAYMENTS !== "true"`, and Firestore connectivity.
   - Set `STRICT_PREFLIGHT_EXIT=true` on staging/prod if you require fail-fast container exit on `NO_GO`.

---

## 3. Firebase Rules & Indexes Deployment

Because `.firebaserc` is absent, pass `--project anytradercombined` explicitly:
```bash
# Deploy Firestore rules & indexes to BOTH targets configured in firebase.json
# (ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a and (default))
firebase deploy --only firestore:rules,firestore:indexes --project anytradercombined

# Deploy Firebase Storage rules
firebase deploy --only storage --project anytradercombined
```
> Always run `npm run test:security-rules` (with Java 21 installed) before deploying rule or index modifications.

---

## 4. Stripe Webhook Endpoint Configuration

Configure the live Stripe Dashboard webhook to deliver events to:
`https://<your-live-domain>/api/webhook`

Minimum subscribed events verified in `server.ts`:
- `checkout.session.completed`
- `charge.refunded`
- `refund.updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
- `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.paid`

Copy the generated endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## 5. Capacitor Native Builds (Android & iOS)

```bash
# Build web bundle with Android/iOS VITE_* keys loaded
npm run build

# Sync web assets into native projects
npx cap sync android
npx cap sync ios
```
- **Android**: Requires Java / Android Studio / Gradle (`android/app/build.gradle`, `android/app/google-services.json`, `com.anytrader.app`).
- **iOS**: Requires macOS Xcode (`ios/App/`, `GoogleService-Info.plist`).
- **App Check & Maps**: Ensure `VITE_GOOGLE_MAPS_API_KEY_ANDROID` and Play Integrity / App Attest are configured for release builds.

---

## 6. Post-Deploy Smoke Checks

1. `GET /api/health` returns `200` with `"status": "ok"`, `"bootstrapReady": true`.
2. `GET /server.cjs` and `GET /server.cjs.map` return `404`.
3. `GET /api/admin/financial-reconciliation/report` without token returns `401`.
4. Built frontend asset `/assets/index-*.js` returns `200`.
