# AnyTrader Architecture Overview

**Prepared:** 14 November 2026  
**Workspace Root:** `/app/applet`  
**Product Scope:** AnyTrader primary marketplace & TradeOS (Note: shared multi-portal runtime also hosts legacy/preserved AnyRoller routes — out of scope for modification).

---

## 1. High-Level System Architecture

AnyTrader is a full-stack TypeScript web and mobile application combining:
- **Frontend SPA**: React 19 + Vite 6 + Tailwind CSS v4 + Framer Motion (`motion`) + React Router v7 (`src/App.tsx`, `177` files in `src/components/`, `58` files in `src/services/`).
- **Authoritative Backend Server**: Single-process Express 4 server (`server.ts`, `7,852` lines) compiled to CommonJS (`dist/server.cjs`) via `esbuild`, serving both API endpoints (`/api/*`) and static SPA assets (`dist/`) in production, or Vite middleware in development (`tsx server.ts`).
- **Modular Domain & Security Layer (`src/server/`)**: `40` top-level TypeScript modules plus `src/server/intelligence/` covering RBAC/BOLA authorization, state-machine enforcement, Stripe Connect double-entry ledger & idempotency, transactional webhook lease fencing, escrow recovery inspection, financial reconciliation, rate limiting/abuse defense, and V8.1–V8.3 Property/Data Intelligence engines.
- **Database, Auth & Object Storage**: Firebase project `anytradercombined`, named Firestore database `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a` (with `(default)` secondary rules/index target), Firebase Auth, Firebase App Check, and Firebase Storage (`anytradercombined.firebasestorage.app`). **There is no `functions/` directory**; background scheduling and privileged mutations execute inside `server.ts` rather than Firebase Cloud Functions.
- **Native Mobile & PWA Targets**: Capacitor 8 (`com.anytrader.app`) wrapping `dist/` for Android (`android/`) and iOS (`ios/`), plus Workbox PWA (`vite-plugin-pwa`, `public/manifest.json`).

---

## 2. Backend Module & Server Topology

```
                  ┌──────────────────────────────────────────────┐
                  │   Web SPA / PWA / Capacitor (Android & iOS)  │
                  └──────────────┬──────────────────┬────────────┘
                                 │                  │
        Firebase Client SDK      │                  │ HTTPS / REST + Bearer ID Token
   (Auth, Firestore, Storage,    │                  │ + X-Firebase-AppCheck + Stripe Sig
          App Check)             ▼                  ▼
                  ┌──────────────────┐   ┌────────────────────────────────┐
                  │  Firebase Cloud   │   │  Express Server (server.ts)    │
                  │  anytradercombined│◄──┤  - Port 3000 (0.0.0.0)         │
                  │  - Named DB +     │   │  - Raw body /api/webhook       │
                  │    (default) DB   │   │  - Auth / Admin / Cron Guards  │
                  │  - Storage Bucket │   │  - Rate Limiters (express-rl)  │
                  └──────────────────┘   │  - Gemini Server Proxy         │
                                         │  - Stripe Connect & Billing    │
                                         │  - Projection Sync & Workers   │
                                         │  - Intelligence Task Queue     │
                                         └────────────────────────────────┘
```

### Core `src/server/` Modules
- **Auth & Access Control**: `identity.ts`, `authorization.ts`, `reviewAuthorization.ts`, `accountBootstrap.ts`, `ssoClaimIntegrity.ts`, `driverAuthorization.ts`, `httpErrors.ts`.
- **Marketplace & Job Lifecycle**: `createJobCommand.ts`, `quoteCommands.ts`, `jobLifecycleCommands.ts`, `stateMachine.ts`, `projectionSync.ts`, `gothamPropertyQuota.ts`, `tripPaymentAuthorization.ts`.
- **Financial & Stripe Security**:
  - `paymentLedger.ts` — Double-entry escrow ledger, 12% fee math, canonical FIN-04 `executeIdempotentOperation` binding, `executeStripeEscrowTransfer`.
  - `paymentVerification.ts`, `pricingCatalog.ts`, `checkoutIntentIntegrity.ts`, `mediationStake.ts`.
  - `stripeWebhookHandler.ts` & `stripeWebhookIdempotency.ts` — FIN-01 transactional lease fencing (`claimToken` + `workerId`, 5-minute stale lease threshold).
  - `stripeRefundPagination.ts`, `refundReconciliation.ts`, `instantMatchRefundReconciliation.ts` — FIN-02 complete cursor pagination & durable refund coordination.
  - `escrowRecovery.ts` — FIN-03 strictly read-only Stripe transfer evidence inspector.
  - `financialReconciliation.ts`, `financialReconciliationCollector.ts`, `reconciliationReport.ts` — FIN-05 invariant evaluator, bounded collector, and sanitized `/api/admin/financial-reconciliation/report` endpoint.
  - `driverPayoutOrchestration.ts`, `subscriptionLifecycle.ts`, `stripeSubscriptionGuards.ts`.
- **Resilience & Security**: `bootstrap.ts` (ordered fail-closed startup hooks), `productionChecks.ts`, `concurrencyLock.ts`, `abuseDefense.ts`, `businessLogicDefense.ts`, `domainEvents.ts`, `taskQueue.ts`, `notificationEngine.ts`.
- **Intelligence Engine (`src/server/intelligence/`)**: Property condition lifecycle, risk analytics, predictive maintenance, property passport, buyer intelligence, contractor archive rights, data classification, AI training controls, retention/deletion (`V8.1–V8.3`).

---

## 3. Express API Surface & Middleware Ordering

`server.ts` configures middleware in strict security order:
1. **`trust proxy = 1`** (single Cloud Run / Nginx ingress hop).
2. **CORS Middleware** (`defaultAllowedOrigins` + `ALLOWED_ORIGINS` + strict `.run.app` / `.google.com` / `.aistudio.google.com` HTTPS check; exact localhost in non-prod).
3. **Global Security Headers**: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
4. **Rate Limiters (`express-rate-limit`)**: `generalLimiter` (`/api/`, 1000/min), `aiLimiter` (50/min), `paymentLimiter` (50/min), `postcodeLimiter` (30/min), `handshakeLimiter` (5/15m), `reviewLimiter` (10/min), plus `/api/` `no-store` Cache-Control headers.
5. **Pre-JSON Raw Webhook**: `POST /api/webhook` mounted with `express.raw({ type: "application/json" })` **before** `express.json()` so Stripe HMAC signature verification (`stripe.webhooks.constructEvent`) operates on the exact raw byte buffer.
6. **JSON Body Parsers**: `/api/gemini/call` (`10mb`), global `express.json({ limit: "1mb" })`.
7. **Domain Routes** (`/api/health`, billing/subscriptions, Stripe Connect, escrow release, jobs/quotes/lifecycle, properties/transfers, postcode lookup, Gemini AI calls, notifications, cron `/api/cron/:jobName`, admin audit/reconciliation, and `/api/intelligence/*`).
8. **Unmatched `/api/*` 404 JSON Guard**: Prevents SPA `index.html` fallback for unknown API routes.
9. **Static Asset Protection & Serving (Production)**: Decoded POSIX-normalized path blocker returning `404` for `/server.cjs`, `/server.cjs.map`, `*.map`, and `/assets/aistudio/*`, followed by `express.static("dist")` (`no-cache` for `sw.js`, `manifest.json`, `index.html`) and SPA catch-all.

---

## 4. Startup & Degraded Ingress Behavior

`bootstrap()` in `server.ts` executes `runBootstrapSequence(hooks)`:
1. Initializes Firebase Admin (`initializeFirebaseAdminAsync`) for `anytradercombined` and named DB `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a` (falling back to `(default)` if needed).
2. Verifies Firestore readiness (`verifyFirestoreReadiness`, 3000ms timeout), registers and starts `intelligenceTaskQueue`, starts projection sync workers (`instantMatchWorker`, category sync, `public_job_cards`, `public_properties`), cron schedulers (unless `DISABLE_IN_PROCESS_CRON === "true"`), matching system, and Express listener on `0.0.0.0:PORT` (`3000`).
3. If background/Firebase ADC bootstrap fails (e.g., local container without service account credentials), `server.ts` logs a warning and still binds HTTP port `3000` so `/api/health` (`status: "degraded"`) and client SPA assets remain reachable, while `STRICT_PREFLIGHT_EXIT=true` forces hard exit on production `NO_GO` preflight checks.
