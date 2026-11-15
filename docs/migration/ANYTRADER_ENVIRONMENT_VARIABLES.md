# AnyTrader Environment Variables Reference

**Prepared:** 14 November 2026  
**Source Verification:** All variables below were verified by static scan across `server.ts`, `src/`, `scripts/`, `vite.config.ts`, `.github/workflows/ci.yml`, and `.env.example`.

> **Security Warning:** Never place server-only secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `JWT_SECRET`, `CRON_SECRET`, `TWILIO_*`) in `VITE_*` variables. Any `VITE_*` variable is compiled into the public frontend JavaScript bundle.

---

## 1. Backend Server Variables (`process.env.*`)

| Variable | Required in Prod | Default / Fallback | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes (`production`) | `"development"` | Enables production static serving, strict HTTPS/CORS/preflight checks, and error redaction |
| `PORT` | Recommended | `3000` | HTTP server listen port (`server.ts` requires port `3000` in AI Studio / Cloud Run unless overridden) |
| `APP_URL` | **Yes** (NO_GO if missing) | Platform fallback / localhost | Authoritative origin for Stripe Checkout redirects, deep links, and SSR/callback URLs (`getAuthoritativeAppUrl`) |
| `ALLOWED_ORIGINS` | **Yes** (NO_GO if missing/`*`) | Dev localhost + `.run.app`/`.google.com` | Comma-separated strict CORS allowlist (must use HTTPS in production; no wildcards) |
| `GEMINI_API_KEY` | **Yes** (NO_GO if missing) | Fails AI calls | Google Gemini SDK server-side API key (`@google/genai`) |
| `STRIPE_SECRET_KEY` | **Yes** (NO_GO if missing) | Fails Stripe calls | Stripe server secret/restricted key (`sk_live_...` / `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | **Yes** (NO_GO if missing) | Rejects `/api/webhook` (400) | Stripe webhook endpoint signing secret (`whsec_...`) |
| `STRIPE_PRICE_ID_STARTER` | Optional | Empty | Legacy/optional Stripe Price ID override (`pricingCatalog.ts` holds authoritative pence catalog) |
| `STRIPE_PRICE_ID_PRO` | Optional | Empty | Legacy/optional Stripe Price ID override |
| `STRIPE_PRICE_ID_ENTERPRISE` | Optional | Empty | Legacy/optional Stripe Price ID override |
| `JWT_SECRET` | Recommended | Ephemeral / WARN if missing | Signing secret for internal/SSO JWT tokens (`jsonwebtoken`) |
| `CRON_SECRET` | Recommended in Prod | Empty | Shared secret verified by `requireCronOrAdmin` for `POST /api/cron/:jobName` & `GET /api/cron/status` |
| `ADMIN_ALERT_EMAIL` | Optional | Empty | Destination email recorded/used by admin security alert dispatching |
| `FIREBASE_STORAGE_BUCKET` | Optional | `firebase-applet-config.json` value | Overrides Firebase Storage bucket (`anytradercombined.firebasestorage.app`) |
| `TWILIO_ACCOUNT_SID` | Optional (SMS mocks if unset) | Unset | Twilio account SID for `processSmsQueue` |
| `TWILIO_AUTH_TOKEN` | Optional (SMS mocks if unset) | Unset | Twilio auth token for `processSmsQueue` |
| `TWILIO_PHONE_NUMBER` | Optional | `"AnyTrader"` | Twilio sender number or alphanumeric sender ID |
| `DISABLE_HMR` | AI Studio / Dev | `"false"` | Set `"true"` in AI Studio to disable Vite WebSocket HMR (`vite.config.ts`) |
| `DISABLE_IN_PROCESS_CRON` | Multi-instance Prod | `"false"` | Set `"true"` on Cloud Run when using external Cloud Scheduler hitting `/api/cron/:jobName` |
| `STRICT_PREFLIGHT_EXIT` | Optional | `"false"` | If `"true"` in production, terminates server process on `NO_GO` preflight failures |
| `ALLOW_DEGRADED_AUTH` | **MUST be `"false"` in Prod** | `"false"` | Development-only override when Firebase Admin Auth cannot initialize |
| `ALLOW_MOCK_PAYMENTS` | **MUST be `"false"` in Prod** | `"false"` | Explicitly blocked by `productionChecks.ts` in production; allows mock Stripe bypass only in dev tests |
| `FIRESTORE_EMULATOR_HOST` | Test/Emulator only | Unset | E.g. `127.0.0.1:8088` when running Firebase Emulator tests |
| `FIREBASE_STORAGE_EMULATOR_HOST` | Test/Emulator only | Unset | E.g. `127.0.0.1:9199` when running Firebase Storage Emulator tests |
| `K_SERVICE`, `K_REVISION`, `HOSTNAME` | Read-only runtime metadata | Set by Cloud Run / OS | Detected by `server.ts` for environment logging and Cloud Run awareness |

---

## 2. Frontend / Vite Build-Time Variables (`VITE_*`)

| Variable | Required | Used In | Purpose |
|---|---|---|---|
| `VITE_API_URL` | Recommended for Capacitor/split origins | `src/lib/apiUrl.ts` | Base API origin prepended to `/api/*` fetches (defaults to relative `/` on same-origin web) |
| `VITE_APP_URL` | Optional | Frontend links | Canonical frontend web URL |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Recommended for Stripe Elements | `.env.example` / client billing | Stripe public publishable key (`pk_live_...` / `pk_test_...`) |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional (falls back to Leaflet) | `src/lib/capacitor.ts` | Browser-restricted Google Maps JS API key |
| `VITE_GOOGLE_MAPS_API_KEY_ANDROID` | For Android Capacitor builds | `src/lib/capacitor.ts` | Android/native-restricted Maps key prioritized when `Capacitor.isNativePlatform()` is true |
| `VITE_RECAPTCHA_SITE_KEY` | Required for Web App Check | `src/firebase.ts` | reCAPTCHA v3 site key for Firebase App Check (bypassed inside AI Studio iframe) |

---

## 3. Secrets Migration Checklist

- [ ] No real `.env`, `.env.local`, or `.env.production` file exists in `/app/applet` (verified absent during audit).
- [ ] `.gitignore` excludes `.env*` while keeping `!.env.example` tracked.
- [ ] All production secrets (`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, `CRON_SECRET`, `TWILIO_*`) must be stored in your Cloud Run / secret manager / AI Studio environment panel — **never committed to Git**.
- [ ] Google Cloud IAM Application Default Credentials (ADC) or Workload Identity must be attached to the runtime service account so `firebase-admin` initializes without committing a JSON service account key file.
