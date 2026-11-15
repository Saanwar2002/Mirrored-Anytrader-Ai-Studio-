# AnyTrader Disaster Recovery & Operational Runbook

**Prepared:** 14 November 2026

---

## 1. Scenario 1 — Application / Container Down or Failing Health Check
1. Check `GET /api/health`:
   - `200 { status: "ok", bootstrapReady: true }`: Healthy.
   - `200 { status: "degraded", bootstrapReady: false }`: Express is serving SPA, but Firebase Admin bootstrap or Firestore readiness check failed. Check Cloud Run IAM/ADC permissions for `anytradercombined` and named database `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`.
   - Process exited immediately: Check whether `STRICT_PREFLIGHT_EXIT=true` terminated startup due to missing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `APP_URL`, or invalid `ALLOWED_ORIGINS`.
2. Verify `PORT=3000` is bound cleanly and no stale process is holding port 3000.

## 2. Scenario 2 — Corrupted / Regressed Code After Git Push or AI Studio Sync
1. Halt deployments immediately.
2. Restore from the last green commit SHA (e.g. backup repo `protected-baseline` tag or `integration/pr-consolidation-20261109` SHA `38b417309fa8b44ed0cbd3c2724a05dea10b6768`).
3. Re-run `npm ci --legacy-peer-deps && npm run test:security-rules && npm test && npm run lint && npm run build && npm run audit:release`.
4. Never deploy without exact-SHA CI green.

## 3. Scenario 3 — Stuck / Duplicate / Disputed Stripe Webhook or Escrow State (FIN-01 / FIN-03 / FIN-05)
1. **Stuck Webhook (`processed_stripe_events/{eventId}`)**:
   - Events in `status: "processing"` older than 5 minutes (`STALE_LEASE_THRESHOLD_MS`) are automatically reclaimable on retry using a fresh `workerId` + `claimToken`. Never manually edit `claimToken` to match a dead worker.
   - Events in `status: "failed"` are immediately retryable via Stripe Dashboard "Resend webhook".
2. **Ambiguous Escrow Transfer (`reconciliation_required`)**:
   - NEVER manually clear `releaseOperationId` or call `stripe.transfers.create` without evidence verification.
   - Run `EscrowRecoveryEngine.inspectTransferEvidence()` (read-only) to inspect Stripe transfers against the deterministic key `release:${jobId}:${quoteId}:${milestoneId}:${idempotencyKey}`.
3. **Read-Only Audit Snapshot**:
   - Authenticated admin queries `GET /api/admin/financial-reconciliation/report?limit=100&offset=0` (`reconciliationReport.ts`). Confirm read-only status before taking any corrective action.

## 4. Scenario 4 — Secret Exposure / Credential Leak
1. Immediately rotate the exposed secret at the provider (Stripe Dashboard -> Roll API key / Webhook signing secret; Google AI Studio -> Regenerate `GEMINI_API_KEY`; update `JWT_SECRET` / `CRON_SECRET`; roll Twilio auth token).
2. Update Secret Manager / Cloud Run / AI Studio env settings — never put secrets into `.env.example` or Git.
3. If `server.cjs.map` or `public/assets/aistudio/*` was ever served prior to the `server.ts` path guard, confirm live HTTP `404` on `/server.cjs`, `/server.cjs.map`, and `*.map`.

## 5. Scenario 5 — Firestore / Auth / Storage Corruption
1. Pause incoming mutating webhooks (`maintenance mode` / pause Stripe delivery temporarily) to stop new ledger divergence.
2. Restore Firestore export (`gcloud firestore import ... --database='ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a'`) into an **isolated recovery project/database first** to verify integrity before cutting over or selectively repairing production documents.
3. Re-deploy verified `firestore.rules`, `storage.rules`, and `firestore.indexes.json` using `firebase deploy --only firestore:rules,firestore:indexes,storage --project anytradercombined`.
