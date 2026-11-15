# AnyTrader Local Development Guide

**Prepared:** 14 November 2026  
**Workspace Root:** `/app/applet`

---

## 1. Prerequisites

| Tool | Recommended Version | Purpose |
|---|---|---|
| Node.js | **v22.x LTS** (tested with `v22.23.2` in sandbox & `22` in CI) | Runtime for `server.ts`, Vite, Vitest, esbuild |
| npm | **v10.x** (tested with `10.9.8`) | Package installation (`--legacy-peer-deps` per `.github/workflows/ci.yml`) |
| Java JDK | **Temurin 21** (required for emulators; **NOT installed** in AI Studio sandbox) | Runs Firebase Firestore & Storage Emulators (`npm run test:security-rules`) |
| Firebase CLI | Latest (`firebase-tools ^15.30.0` in `devDependencies`) | Local emulator execution and rules deployment |
| Stripe CLI | Optional | Local webhook forwarding to `http://localhost:3000/api/webhook` |

---

## 2. Initial Setup on a Fresh Workstation

```bash
# 1. Clone the repository and switch to working branch
git clone https://github.com/Saanwar2002/AnyTrader.git
cd AnyTrader
git checkout integration/pr-consolidation-20261109   # or main once reconciled

# 2. Install dependencies cleanly
npm ci --legacy-peer-deps

# 3. Create local .env from template (NEVER commit .env)
cp .env.example .env
# Populate local test keys: GEMINI_API_KEY, STRIPE_SECRET_KEY (sk_test_), STRIPE_WEBHOOK_SECRET (whsec_), etc.
```

---

## 3. Running Locally

### Option A: Standard Dev Mode (Express + Vite Middleware on Port 3000)
```bash
npm run dev
# Executes: tsx server.ts
```
- Binds `http://localhost:3000`.
- Uses `firebase-applet-config.json` to identify project `anytradercombined` and named database `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`.
- If Google ADC (`GOOGLE_APPLICATION_CREDENTIALS` / `gcloud auth application-default login`) is not configured locally, Firebase Admin initialization degrades cleanly for SPA/mock development while logging a bootstrap notice (`GET /api/health` returns `status: "degraded"`).

### Option B: Local Firebase Emulators (Recommended for Full-Stack Dev & Security Tests)
1. Ensure Java 21 is installed (`java -version`).
2. Start emulators via `firebase.json` ports (Firestore `127.0.0.1:8088`, Storage `127.0.0.1:9199`, demo project `demo-anytrader`):
   ```bash
   npx firebase emulators:start --project demo-anytrader --only firestore,storage
   ```
3. Point backend Admin SDK to emulators in `.env`:
   ```ini
   FIRESTORE_EMULATOR_HOST="127.0.0.1:8088"
   FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"
   ```

### Option C: Local Stripe Webhook Forwarding
```bash
stripe listen --forward-to http://localhost:3000/api/webhook
# Copy the printed whsec_... signing secret into STRIPE_WEBHOOK_SECRET in .env
```

---

## 4. Production Simulation Locally

```bash
npm run build
NODE_ENV=production APP_URL=http://localhost:3000 ALLOWED_ORIGINS=http://localhost:3000 npm start
```
Verify:
- `GET http://localhost:3000/api/health` -> `200`
- `GET http://localhost:3000/server.cjs` -> `404`
- `GET http://localhost:3000/server.cjs.map` -> `404`
