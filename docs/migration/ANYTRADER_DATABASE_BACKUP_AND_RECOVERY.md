# AnyTrader Database, Storage & Live Data Backup Strategy

**Prepared:** 14 November 2026  
**Firebase Project:** `anytradercombined`  
**Important Verification Status:** **CONTAINS REQUIRES MANUAL ACTION / NOT VERIFIED ITEMS** — This AI Studio sandbox does not hold authenticated production GCP/Firebase CLI credentials (`gcloud` / interactive `firebase login`) or Stripe Dashboard access, so live production backups could NOT be executed or inspected from inside the container.

---

## 1. Critical Clarification: GitHub vs Live Production Data

Disconnecting or migrating the GitHub repository in Google AI Studio **does NOT back up Firestore documents, Firebase Auth users, Firebase Storage files, Stripe Connect accounts, or Secret Manager secrets**. Repository backups preserve source code, rules, schemas (`firebase-blueprint.json`), and index definitions (`firestore.indexes.json`) only.

---

## 2. Database & Storage Scope to Protect

1. **Primary Named Firestore Database**: `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`
2. **Secondary `(default)` Firestore Database**: Mapped in `firebase.json` — verify in Firebase Console whether live documents exist here too.
3. **Key Collections (Verify complete list in `firebase-blueprint.json` & `firestore.rules`)**:
   - Identity & RBAC: `users`, `admins`, `audit_logs`, `ai_agent_audit_logs`
   - Marketplace & Messaging: `jobs`, `jobs/{id}/quotes`, `public_job_cards`, `conversations`, `conversations/{id}/messages`, `reviews`, `instant_matches`, `notifications`, `sms_queue`
   - Properties & Passports: `properties`, `public_properties`, `property_transfers`, `tenant_reports`
   - Financial & Reconciliation: `payment_intents`, `payment_ledger`, `processed_stripe_events`, `idempotency_keys`, `driver_payouts`, `refund_operations`, `refund_records`, `disputes`
   - Rides / AnyRoller (Preserve untouched): `rides`, `vehicles`, `demand_zones`
   - Intelligence & Provenance (`V8.1–V8.3`): `job_intelligence`, `property_intelligence`, `intelligence_evidence`, `intelligence_tasks`, `contractor_archives`, `data_classification`, `ai_training_controls`, `data_retention_policies`, `deletion_requests`, `platform_categories`, `dynamic_search_synonyms`
4. **Firebase Storage Bucket**: `gs://anytradercombined.firebasestorage.app` (`verifications/`, `chats/`, `disputes/`, `jobs/`, `properties/`, `intelligence_raw/`, `intelligence_evidence/`, etc.).
5. **Firebase Authentication**: User UIDs, custom claims (`admin`, `role`), email/phone/OAuth provider bindings.

---

## 3. Mandatory Manual Pre-Migration Export Procedures

Perform these from an authorized operator workstation (`gcloud auth login` / `firebase login`) into a dedicated **GCS backup bucket** (e.g., `gs://anytradercombined-backups-<region>` with uniform bucket-level access and versioning enabled):

### A. Export Both Firestore Databases
```bash
# 1. Primary named database
gcloud firestore export gs://anytradercombined-backups/firestore/$(date +%Y%m%d)/named-db \
  --project=anytradercombined \
  --database='ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a'

# 2. Check and export (default) database if used
gcloud firestore export gs://anytradercombined-backups/firestore/$(date +%Y%m%d)/default-db \
  --project=anytradercombined \
  --database='(default)'
```
Also verify **Firestore PITR (Point-in-Time Recovery)** and scheduled daily exports are enabled in GCP Console for `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`.

### B. Export Firebase Authentication Users
```bash
firebase auth:export auth-users-$(date +%Y%m%d).json \
  --format=JSON \
  --project=anytradercombined
# Encrypt/store offline or in restricted GCS; contains password hashes & UIDs — NEVER put in Git!
```

### C. Mirror Firebase Storage Bucket
```bash
gcloud storage rsync -r \
  gs://anytradercombined.firebasestorage.app \
  gs://anytradercombined-backups/storage/$(date +%Y%m%d) \
  --project=anytradercombined
```

### D. Record Live Rules, Indexes, and Financial Snapshot
- Capture deployed rules & indexes via Firebase Console or CLI (`firestore:indexes` export) to confirm parity with repo `firestore.rules`, `storage.rules`, and `firestore.indexes.json`.
- Record Stripe Dashboard account state, active webhook endpoints (`/api/webhook`), and run a read-only `GET /api/admin/financial-reconciliation/report` snapshot before any major deployment.

---

## 4. Recovery Principles

- Restoring into a **staging database or clean project** is always preferred before touching production `ai-studio-anytrader-44dab8b3-bbc9-4352-b725-2cbe7a1dfd2a`.
- Never allow automated test suites (`tests/unit/*`) to run against production (`FIRESTORE_EMULATOR_HOST` must isolate emulator runs with `--project demo-anytrader`).
- If restoring Firestore financial collections (`payment_ledger`, `processed_stripe_events`, `payment_intents`), temporarily pause `/api/webhook` or put app in maintenance mode to prevent split-brain writes against live Stripe events.
