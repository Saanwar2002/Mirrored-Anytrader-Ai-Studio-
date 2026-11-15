# AnyTrader Repository Migration Plan (Backup + Primary Dev Split)

**Prepared:** 14 November 2026  
**Original Primary Dev Repository:** `Saanwar2002/AnyTrader` (remains primary development repo for ChatGPT-assisted work, reconciliation, bug fixes & features)  
**New Target AI Studio Connection:** Brand-new **private** protected backup repository (e.g., `Saanwar2002/AnyTrader-ai-studio-backup`)  
**Rule:** Do **NOT** rewrite or force-push Git history. Perform all steps carefully with verified snapshots on disk first.

---

## Step-by-Step Safe Execution Order

### Phase A — Pre-Disconnect Safeguards (Manual Offline / Console Actions)
1. **Export AI Studio Source ZIP**: Use Google AI Studio's Download/Export ZIP feature to save a full local snapshot of `/app/applet` before touching GitHub connections.
2. **Preserve External Infrastructure**: Run the Firestore + Auth + Storage export commands in `ANYTRADER_DATABASE_BACKUP_AND_RECOVERY.md` against project `anytradercombined`. Record AI Studio environment variables safely in your password/secret manager.
3. **Sync Primary Repo Backup Locally**: On an authenticated workstation:
   ```bash
   git clone --mirror https://github.com/Saanwar2002/AnyTrader.git AnyTrader-git-mirror.git
   ```
   (Preserves every branch, tag, and PR commit untouched before anything changes.)

### Phase B — Create & Configure the Protected Backup Repository
1. On GitHub, create a **new PRIVATE repository** (e.g., `Saanwar2002/AnyTrader-ai-studio-backup`) owned by the same organization/account so AI Studio OAuth can access it. Do **NOT** initialize with README/license (empty repo).
2. Extract the exported AI Studio ZIP into a clean working folder, verify `.gitignore` excludes `_workspace_backup/`, `public/assets/aistudio/`, `.env*`, `node_modules/`, and `dist/`.
3. Verify zero sensitive files or secrets are staged:
   ```bash
   git init -b main
   git status --ignored
   # Confirm _workspace_backup/, .env*, dist/, node_modules/ are NOT untracked/staged
   ```
4. Commit and push cleanly to the backup repo (`main` + optional `protected-baseline` branch/tag):
   ```bash
   git add .
   git commit -m "chore(backup): preserve reconciled AnyTrader AI Studio workspace baseline (2026-11-14)"
   git remote add backup https://github.com/<owner>/AnyTrader-ai-studio-backup.git
   git push -u backup main
   ```
5. Enable **GitHub Branch Protection** on `main` in the backup repository:
   - Require pull request before merging (or restrict pushes to owner)
   - Block force-pushes and branch deletion
   - Require CI status check (`security-and-build-gate`) to pass if Actions are enabled

### Phase C — Reconnect Google AI Studio to the New Protected Backup Repo
1. Inside Google AI Studio settings, click **Disconnect** from `Saanwar2002/AnyTrader`.
2. **Wait / Verify** that the workspace UI and files (`server.ts`, `src/`, `docs/migration/`) remain intact (re-import from your Phase A ZIP if AI Studio prompts for workspace initialization).
3. Connect Google AI Studio to the new **private** backup repo (`Saanwar2002/AnyTrader-ai-studio-backup`, branch `main`).
4. Pull/verify status shows synchronized with zero unexpected overwrites, and confirm `compile_applet` / dev preview on port 3000 remains green.

### Phase D — Sync Latest Reconciled State into Primary Dev Repo (`Saanwar2002/AnyTrader`)
Do **NOT** touch `Saanwar2002/AnyTrader` `main` directly via blind overwrite. On your workstation clone of `Saanwar2002/AnyTrader`:
```bash
cd AnyTrader
git checkout -b reconciliation/aistudio-workspace-sync-20261114 integration/pr-consolidation-20261109
# Copy verified unified changes (FIN-01 concurrent tests, .gitignore, server.ts static guard, docs/migration/, .env.example)
git diff --stat
npm ci --legacy-peer-deps
npm run test:security-rules   # Java 21 Firebase Emulator
npm test && npm run lint && npm run build && npm run audit:release
git commit -m "test(fin-01): add concurrent webhook lease takeover verification and migration docs"
git push origin reconciliation/aistudio-workspace-sync-20261114
```
Open a PR in `Saanwar2002/AnyTrader`, wait for GitHub Actions `security-and-build-gate` green on the exact commit SHA, and merge only after owner review.

---

## Rollback Plan During Migration
- If AI Studio reconnect overwrites any workspace file: restore immediately from the Phase A exported ZIP or re-pull from the `AnyTrader-ai-studio-backup` `protected-baseline` branch/tag.
- If `Saanwar2002/AnyTrader` ever encounters a bad merge: `integration/pr-consolidation-20261109` (`38b41730...`) and the Phase A `--mirror` clone remain intact for instant recovery.
