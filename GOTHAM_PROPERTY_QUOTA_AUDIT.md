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

The current integration branch contains three direct client-side property creation paths:

1. `src/components/PropertyManager.tsx` — `addDoc(collection(db, "properties"), ...)`
2. `src/components/Portfolio.tsx` — `addDoc(collection(db, "properties"), ...)`
3. `src/components/HomeHealthWidget.tsx` — Property Passport creation via `addDoc(collection(db, "properties"), ...)`

The Gotham portal component (`src/components/anytrader/GothamHousingPortal.tsx`) currently handles subscription calculation/checkout and displays the purchased door count; it does not itself create `/properties` documents.

The first two paths serve landlord/property portfolio workflows. The Home Health path also serves ordinary homeowners. **Do not apply Gotham quotas to non-Gotham homeowners or unrelated users.** Any server-side command must distinguish an active Gotham subscription from ordinary property ownership.

The existing direct update/delete and transfer workflows are separate from creation and must retain their current ownership and transfer protections.

## Subscription lifecycle dependency

Checkout fulfillment marks the Gotham subscription active. Cancellation routes record `gothamCancelAtPeriodEnd` and the current period end. The current server audit did not find dedicated Stripe webhook handling for `customer.subscription.updated` / `customer.subscription.deleted` that reliably refreshes `gothamSubscriptionStatus`, the paid-through period, and the purchased door allowance after renewals, payment failures, cancellation, or reactivation.

This is a prerequisite for safe quota enforcement: do not treat a stale `isGothamSubscriber` flag as proof of current entitlement. Reconcile the subscription lifecycle (or perform a verified live Stripe status check) before deciding whether new Gotham doors may be added. A cancellation scheduled for period end should retain access through the paid-through date; an expired/canceled/unpaid subscription must not retain an unlimited creation path.

## Required remediation design

1. **Canonical server command:** add an authenticated endpoint for property creation. Derive the owner UID from verified auth; never accept owner/tenant/manager IDs or subscription/allowance/usage fields from the client.
2. **Strict payload validation:** allow only property business fields needed by the three existing forms; reject protected ownership, transfer, billing, verification, and usage fields.
3. **Entitlement check:** read the server-owned `users/{uid}` Gotham subscription record and verify the matching subscription is entitled at the request time. Keep ordinary non-Gotham homeowner/property creation available under the existing product rules.
4. **Concurrency-safe reservation:** reserve one door and create the property atomically in a Firestore transaction. Serialize on the user entitlement/usage document so concurrent requests cannot overshoot. Use a server-maintained usage counter with a controlled legacy backfill/reconciliation; do not trust a client count. Make retries idempotent.
5. **Rules hardening:** remove ordinary client create permission on `/properties`; permit trusted server/Admin SDK creation and preserve existing owner updates, reads, deletes, and transfer flows. Emulator tests must prove a signed-in owner cannot bypass the command with direct Firestore writes.
6. **Migrate all three call sites** to the canonical command. Keep edits to existing properties on their current authorized update path.
7. **Regression tests:** non-Gotham homeowner creation remains allowed through the intended path; active Gotham users can create up to but not beyond the purchased count; cancellation-at-period-end behavior is correct; expired/inactive subscription is denied; forged owner/usage fields are rejected; duplicate retries do not double-reserve; concurrent requests at the quota boundary cannot exceed it; direct client Firestore create is denied.
8. Run unit, Firestore emulator/security, TypeScript/lint, production build, release audit, and full CI. Do not merge or deploy based only on a local/static pass.

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
