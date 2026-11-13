# AnyTrader AI Studio ↔ GitHub reconciliation checklist
Date: 9 November 2026

## Scope and safety
- Scope: AnyTrader only.
- Source baseline: user-confirmed latest AI Studio backup `anytrader (Full Code Backup)_112216(1).zip`.
- Target: `integration/pr-consolidation-20261109`.
- Do not merge to `main`, deploy Firebase, or alter production.
- Keep taxi/AnyRoller unchanged; taxi findings remain deferred in `MASTER_BUILD_PLAN.md`.

## Verified snapshot parity (backup vs integration SHA `e0653deb65657c91a17d1f9355662d67f4b70231`)
Exact byte-identical:
- `server.ts` — Git blob `0e935945b0cb7a3e6009030884aa620cc5dba175`
- `package.json` — `973603b055a65607106d2afac29b248d0b915b27`
- `firebase.json` — `64ea2d94c5ae7ae149a6c897624b71b3f1d293d1`
- `firestore.indexes.json` — `7ba42a1c5f715f2a11d07b6768939f30bf60064b`
- `storage.rules` — `b2a628977784f6bc3189c9d4592e4e40d590e8f1`
- `instantMatchWorker.ts` — `118f2cbd0ee3eb7986b9885dd5706b8897118875`

## Reconcile carefully (do not overwrite wholesale)
- `firestore.rules`: backup 76,059 bytes; integration 77,835 bytes. Preserve AI Studio PL-01–PL-15 protections; manually add/reconcile GitHub invitation/payment rule changes and run emulator rules suite.
- `DEVELOPMENT.md`: backup 875,746 bytes; integration 881,417 bytes. Combine additively; retain AI Studio Tasks 31–34 and PL-01–15 history plus GitHub PR/reconciliation entries.
- `.github/workflows/ci.yml`: retain integration's corrected `integration/**` pull-request target filter.
- Preserve GitHub `MASTER_BUILD_PLAN.md` and `AI_STUDIO_FIREBASE_PRECHANGE_REVIEW.md` (not in backup).
- Preserve AI Studio `firebase-applet-config.json` exactly; do not replace with defaults.
- Preserve all AI Studio-only source, tests (reported 1,069 passing), docs, and workspace archive.

## PR #5 status / caution
- PR #5 is open, draft, unmerged, based on integration; candidate consolidated replacement for PR #2 (do not merge both).
- Head SHA: `6af712f7833f5e60759c87f00f2bc798305210a6`.
- CI run #455 reported success; that is a GitHub gate result, not proof of live Firebase state or AI Studio parity.
- PR currently reports 102 commits ahead and 1 behind integration (base has moved). Re-check/rebase or refresh comparison before handoff.
- Review still requires route-level coverage for concurrent stake-intent requests, retry after ambiguous Stripe timeout, and duplicate success webhook; CI green alone does not settle those design/test concerns.

## Safe handoff sequence
1. Keep a read-only copy of the current AI Studio workspace and its backup.
2. Pull integration into a separate staging workspace/branch—not over the active AI Studio project.
3. Compare files; merge only reviewed deltas listed above.
4. Run AI Studio compile/lint/tests and GitHub CI; verify exact resulting commit and diff.
5. Confirm Firebase live rules/indexes/Auth/Storage/App Check/IAM/secrets independently (configuration files are not deployment evidence).
6. Gemini pushes reconciled code to a dedicated branch; review diff and CI before any later merge/deploy authorization.
