# Gotham Property Door-Quota Reconciliation Audit

Date: 2026-11-10  
Repository: `Saanwar2002/AnyTrader`  
Working branch: `integration/pr-consolidation-20261109`

## Scope and current finding

The Gotham SaaS checkout calculates a purchased door allowance and Stripe checkout metadata carries `gothamDoorsCount`. Stripe checkout fulfillment writes the authoritative subscription fields to `users/{uid}`, including:

- `isGothamSubscriber`
- `subscriptionType: "gotham_saas"`
- `gothamSubscriptionId`
- `gothamSubscriptionStatus: "active"`
- `gothamDoorsCount`
- `gothamTierName`
- `gothamBillingCycle`
- `gothamCancelAtPeriodEnd`

The pricing tiers currently defined in `src/server/pricingCatalog.ts` are £4.50/door for 1–100, £3.50/door for 101–1,000, and £2.50/door for 1,001+; annual billing receives a 15% discount.

**Critical gap:** `firestore.rules` currently permits an authenticated owner to create documents directly in `/properties`. A client can therefore add property documents without any server-side check against `gothamDoorsCount`.

## Complete direct-create call graph found

The initial audit found three direct client-side property creation paths. A broader repository search subsequently confirmed these were the three active `addDoc(collection(db, "properties"), ...)` call sites; other search hits were unrelated collections or unused imports:

1. `src/components/PropertyManager.tsx`
2. `src/components/Portfolio.tsx`
3. `src/components/HomeHealthWidget.tsx`

All three have now been migrated to `src/services/propertyCommandService.ts`, which calls the authenticated `POST /api/properties` command. Existing-property edits remain on their existing update paths. The Gotham portal component (`src/components/anytrader/GothamHousingPortal.tsx`) handles subscription calculation/checkout and displays the purchased door count; it does not itself create `/properties` documents.

The first two paths serve landlord/property portfolio workflows. The Home Health path also serves ordinary homeowners. **Do not apply Gotham quotas to non-Gotham homeowners or unrelated users.** Any server-side command must distinguish an active Gotham subscription from ordinary property ownership.

The existing direct update/delete and transfer workflows are separate from creation and must retain their current ownership and transfer protections.

## Subscription lifecycle dependency

Checkout fulfillment marks the Gotham subscription active. Cancellation routes record `gothamCancelAtPeriodEnd` and the current period end. The current server audit did not find dedicated Stripe webhook handling for `customer.subscription.updated` / `customer.subscription.deleted` that reliably refreshes `gothamSubscriptionStatus`, the paid-through period, and the purchased door allowance after renewals, payment failures, cancellation, or reactivation.

This is a prerequisite for safe quota enforcement: do not treat a stale `isGothamSubscriber` flag as proof of current entitlement. Reconcile the subscription lifecycle (or perform a verified live Stripe status check) before deciding whether new Gotham doors may be added. A cancellation scheduled for period end should retain access through the paid-through date; an expired/canceled/unpaid subscription must not retain an unlimited creation path.

## Remediation implementation status (2026-11-10)

Implemented on `integration/pr-consolidation-20261109`:

- `server.ts`: authenticated `POST /api/properties`; derives owner identity from verified auth, validates an explicit business-field allowlist, rejects protected/unknown fields, verifies live Stripe subscription status for real Gotham subscriptions, checks the purchased allowance, performs a one-time legacy property-count backfill, serializes reservations on a per-user usage document, and supports idempotent replay. `DELETE /api/properties/:id` preserves owner/admin deletion through the server and decrements or initializes the same usage counter atomically. `GET /api/properties/transfer/:code` exposes a rate-limited minimal transfer preview; `POST /api/properties/claim-transfer` verifies entitlement and atomically moves quota between previous/new Gotham owners while claiming the property.
- `src/services/propertyCommandService.ts`: authenticated client command with an idempotency header.
- `PropertyManager.tsx`, `Portfolio.tsx`, `HomeHealthWidget.tsx`: migrated all three direct creation flows; existing-property updates remain unchanged.
- `firestore.rules`: `/properties` direct client create and delete are denied, and the special client-side ownership-transfer update exception is removed. Existing owner edits and transfer initiation/cancellation fields remain available; ownership claims use the server command. The two existing UI deletion call sites use the quota-aware server deletion command.
- `tests/unit/firebaseEmulatorSecurityRules.test.ts`: added signed-in owner direct-create, direct-delete, and transfer-recipient ownership-change bypass regression tests.
- Stripe lifecycle work: added live subscription refresh for Gotham subscription/invoice lifecycle events and hardened cancellation/reactivation against missing subscription IDs and Stripe configuration failures. Stripe's Gotham product is one aggregate subscription line item with quantity 1; therefore lifecycle sync deliberately preserves the separately stored purchased door allowance rather than replacing it with Stripe item quantity.

**Commits:** `5377e19`, `966766b`, `5584f91`, `a65f4c1`, `d13c542`, `0bd25a0`, `f4764c7`, `3d62b44`, `d2abed2`, `e0ca4ae`, `b7f4b77`, `18da5f2`, `40e45d5`, `a06015c`, `45d7512`, `4fbdb1f`, `1e12ad2`, `34a9b15`, `e5f9dbd`, `fb93671`, `b23e3af`, `b8121dc`, `4401145`, `a00dc53`, plus the earlier audit/plan documentation commits.

## CI verification (2026-11-10)

The complete GitHub Actions gate passed on commit `111aad93e15b948ba6393d0ee24df14bf68dafea`:

- Workflow: [CI & Security Rules Release Gate, run 42796203967](https://github.com/Saanwar2002/AnyTrader/actions/runs/42796203967) — **success**.
- Firebase Security Rules + Firestore emulator/concurrency suite: **21 test files, 592 tests passed**.
- Unit and penetration suite: **65 test files, 1,071 tests passed**.
- TypeScript/lint: passed.
- Production build: passed.
- Release audit: **0 critical failures, 7 warnings**; the audit returned “GO WITH EXPLICIT ACCEPTED RISKS”.

The seven CI release-audit warnings include unset CI environment values for `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `JWT_SECRET`, `APP_URL`, and `ALLOWED_ORIGINS`, plus the server Firestore client not being initialized in the audit environment. These are not proof that live deployment secrets are missing; verify the actual AI Studio/Cloud Run environment before release.

**Still outstanding before release:** API-level tests for Gotham quota boundaries, inactive/expired and cancellation-at-period-end entitlement, forged payloads, idempotency replay, deletion/transfer counter reconciliation, and concurrent create/delete/transfer races. `src/server/authorization.ts` and `tests/unit/propertySecurityRules.test.ts` have since been aligned: pending transfer recipients retain preview/read access but cannot mutate ownership through the generic property-modification helper. The follow-up CI attempt for this small change did not start a runner (GitHub job completed with `runner_id: 0` and no steps), so this latest helper/test adjustment still needs a successful rerun. Live AI Studio/Firebase parity, deployed named-database rules/indexes, staging smoke tests, and production environment verification remain unconfirmed. Do not treat a green CI run as release approval.

## Release and branch safeguards

- Work only on `integration/pr-consolidation-20261109`.
- Keep `main`, AI Studio, and production untouched.
- Keep PR #5 draft/unmerged until reconciliation and all verification gates pass.
- Do not modify AnyRoller/taxi behavior.
- Do not weaken existing security tests or rules to obtain a green CI result.

## Next execution order

1. Complete the Stripe Gotham subscription lifecycle audit and add authoritative status synchronization.
2. Define/backfill the server-side Gotham door-usage counter from existing owned property records, with explicit treatment of legacy records.
3. Implement the transactional property-create command and strict Firestore create denial.
4. Migrate the three client creation paths.
5. Add concurrency, idempotency, subscription-state, and emulator bypass tests.
6. Run and inspect the complete CI suite; update this report with commit and run evidence.
