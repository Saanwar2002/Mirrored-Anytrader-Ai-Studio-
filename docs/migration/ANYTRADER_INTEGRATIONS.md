# AnyTrader External & Internal Integrations Inventory

**Prepared:** 14 November 2026  
**Security Rule:** Secret values, private keys, signing secrets, and internal credentials are intentionally excluded.

---

## 1. Firebase Ecosystem

- **Project ID**: `anytradercombined` (`messagingSenderId`: `426882121063`, `authDomain`: `anytradercombined.firebaseapp.com`).
- **Firestore**:
  - Primary named database: `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`.
  - Secondary database target in `firebase.json`: `(default)`.
  - Client SDK (`src/firebase.ts`): `initializeFirestore` with `experimentalForceLongPolling: true`, `useFetchStreams: false`, and `enableMultiTabIndexedDbPersistence`.
  - Admin SDK (`server.ts`): `firebase-admin` v13.7.0 initialized via `initializeFirebaseAdminAsync()` using Google Application Default Credentials (ADC).
- **Firebase Authentication**:
  - Web & native providers (Google OAuth, Email/Password, Phone Auth + reCAPTCHA, anonymous fallback where permitted by rules).
  - Native plugin: `@capacitor-firebase/authentication` (`capacitor.config.json`).
  - Admin claim helper: `scripts/set-admin-claim.ts` (`admin: true` custom claim + `admins/{uid}` document).
- **Firebase App Check**:
  - Web: `ReCaptchaV3Provider` via `VITE_RECAPTCHA_SITE_KEY` (automatically bypassed inside AI Studio preview iframe or when key is unset).
  - Native Capacitor: `@capacitor-firebase/app-check` dynamically loaded for Play Integrity (Android) / App Attest (iOS).
- **Firebase Storage**:
  - Bucket: `anytradercombined.firebasestorage.app` (overridable via `FIREBASE_STORAGE_BUCKET`).
  - Scoped security rules (`storage.rules`, 360 lines) across `jobs/`, `public_job_media/`, `properties/`, `users/`, `avatars/`, `portfolio/`, `verifications/`, `chats/`, `disputes/`, `rides/`, `vehicles/`, `intelligence_raw/`, `intelligence_evidence/`.
- **Firebase Performance**: Dynamically initialized in browser (`src/firebase.ts`) with defensive attribute sanitization.
- **Cloud Functions**: **None** (`functions/` directory does not exist; all backend APIs and background jobs run in `server.ts`).

---

## 2. Stripe Payments & Connect (`stripe` v17.7.0)

- **Architecture Model**: Marketplace platform charges strictly platform fees/subscriptions; all escrow milestones and ride fares route via **Stripe Connect Express** (`transfer_data.destination` / `stripe.transfers.create`), never held long-term as platform funds.
- **Key Integration Flows**:
  - Checkout Sessions (`/api/create-checkout-session`) & Setup Sessions (`/api/create-setup-session`) backed by authoritative `payment_intents/{intentId}` records (`checkoutIntentIntegrity.ts`) and `SERVER_PRICING_CATALOG` (`src/server/pricingCatalog.ts`).
  - Subscriptions (`/api/cancel-subscription`, `/api/reactivate-subscription`, `/api/create-customer-portal-session`) synced via `subscriptionLifecycle.ts`: `membership`, `driver_gold`, `exclusive_leads`, `video_pro`, `gotham_saas`.
  - Dispute Mediation Stake (`/api/disputes/create-stake-intent`, £25.00 GBP `mediationStake.ts`).
  - Escrow Milestone Release (`/api/release-milestone` -> `PaymentLedgerEngine.releaseEscrowFunds` & `executeStripeEscrowTransfer`).
  - Refunds: Embedded Instant Match expiry/exhaustion (`instantMatchRefundReconciliation.ts`) and `charge.refunded` / `refund.updated` exhaustive cursor pagination (`stripeRefundPagination.ts`, `refundReconciliation.ts`).
  - Webhooks (`/api/webhook` + `src/server/stripeWebhookHandler.ts`): Verified via `STRIPE_WEBHOOK_SECRET`, protected by transactional `processed_stripe_events/{eventId}` 5-minute lease + `workerId`/`claimToken` fencing (`ownsStripeWebhookClaim`).

---

## 3. Google Gemini AI (`@google/genai` v1.50.1)

- **Server-Side Execution Only**: Client calls `/api/gemini/call`, `/api/gemini/stream`, `/api/job/procure-materials`, `/api/job/extract-bom`, `/api/analytics/profitability`, `/api/driver/analytics-pulse`; `server.ts` / `src/services/geminiServer.ts` / `src/server/intelligence/geminiProvider.ts` execute requests using `GEMINI_API_KEY`.
- **AI Studio Capability Declaration**: `metadata.json` includes `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` and frame permissions `camera`, `microphone`, `geolocation`.
- **Dynamic Prompt Layer**: `startCategoryRegistrySyncWorker` in `server.ts` streams Firestore `platform_categories` and `dynamic_search_synonyms` into `geminiServer.syncCategoryRegistryServer()`.
- **Models Referenced in Source**: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-flash-live-preview`, `gemini-2.5-pro`, `gemini-3`, `gemini-3.1-pro-preview`, `gemini-3.8-flash` (verify model availability against Google AI API deprecations in target account).

---

## 4. Google Maps & Geolocation

- **Libraries**: `@react-google-maps/api` v2.20.8 (`places`, `geometry`), plus `leaflet` v1.9.4 / `react-leaflet` v5.0.0 and `ngeohash` v0.6.3.
- **Key Selection (`src/lib/capacitor.ts`)**: Uses `VITE_GOOGLE_MAPS_API_KEY_ANDROID` when running in native Capacitor container, falling back to `VITE_GOOGLE_MAPS_API_KEY` on Web.

---

## 5. Twilio SMS & Admin Alerts

- **Twilio SDK**: `twilio` v6.0.2 in `server.ts` (`processSmsQueue`). Reads Firestore `sms_queue` (`status == "pending"`), sends via `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (`"AnyTrader"` default). Falls back to dev mock logging (`mockStatus: true`) if credentials are absent.
- **Email Alerts**: `/api/admin/send-email-alert` queues alert payloads referencing `ADMIN_ALERT_EMAIL`.

---

## 6. Google Workspace Client-Side OAuth (GIS)

- **Library / Pattern**: Browser-side Google Identity Services (`https://accounts.google.com/gsi/client`). Tokens remain strictly in-memory (no `localStorage` persistence).
- **Services**:
  - `src/services/googleCalendarService.ts` (Calendar API sync).
  - `src/services/googleDriveDocsService.ts` (`drive.file` and `documents` scopes for contracts/certificates).
  - `src/services/googleSheetsService.ts` (`spreadsheets` scope for bookkeeping exports).
- **Note**: Uses OAuth client ID configured in client services (`437256678397-applet-client.apps.googleusercontent.com` / `firebase-applet-config.json`); update OAuth authorized origins if hosting domains change.

---

## 7. Additional APIs, Native Plugins & Push

- **UK Postcode Lookup**: `src/services/postcodeService.ts` queries backend proxy `GET /api/postcode/:postcode` (rate-limited), falling back to direct `https://api.postcodes.io/postcodes/:postcode`.
- **Push & Native Device APIs (Capacitor 8)**: `@capacitor/push-notifications`, `@capacitor/local-notifications`, `@capacitor/geolocation`, `@capacitor/camera`, `@capacitor/haptics`, `@capacitor/keyboard`, `capacitor-biometric-auth`, `@capacitor-community/speech-recognition`, `@capacitor-community/text-to-speech`, `@capacitor-firebase/crashlytics`.
- **WhatsApp Strategy 1 Privacy Bridge**: Client constructs `wa.me` share links containing tokenized app routes without exposing private phone/email contact details.
- **External Cloud Scheduler / Cron**: `/api/cron/:jobName` & `/api/cron/status` gated by `requireCronOrAdmin` (`X-Cron-Secret` matching `CRON_SECRET` or Admin Firebase ID token). Set `DISABLE_IN_PROCESS_CRON="true"` on Cloud Run multi-instance deployments.
