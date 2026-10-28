# Landing handoff: `e2e-tests-coverage` → `main`

This is the state of the work to move `e2e-tests-coverage` onto `main` in reviewable batches, written so any agent can pick it up cold. **Update it at the end of every step, and before stopping.** The file-level truth is the generated [landing-ledger.md](./landing-ledger.md). This doc carries what git can't: what's in flight, what's next and why.

## Now

- **Batch**: B0, step 3 in progress. One commit (`05cee518c`) on `e2e-land/b0-infra`, in worktree `/Users/sg/ens/worktrees/e2e-land-b0`, on `origin/main` at `ae8849020`. **Pushed (force-pushed 2026-10-28 after trimming and rewording).** No PR is open yet. 95 files, ~13.6k lines.
- **Trimmed on the user's request (2026-10-28)**: the coverage ledger and the planning docs were taken out of B0 and the commit rewritten, so main's history never carries them. They stay on this branch as **B10**: `e2e/coverage/**` (reconciler, scenarios, invariants, baseline, handoff), `e2e/matrix/{ids,scenarios}.ts`, and `e2e/docs/` `e2e-{build-goal,coverage,defects,gap-analysis,master-test-plan,spec-audit,test-catalogue}.md` plus `{bigname-harness,portal-bigname}-handoff.md`. `e2e/matrix/{run,assert,expectations,render-docs}.ts` moved to B7. B0 also drops the `coverage` / `e2e:coverage` scripts, the README's Coverage Ledger section and one handoff link in `local-e2e-stack.md`.
- **Local results (2026-10-28)**:

  | Check | Result |
  |---|---|
  | typecheck | clean (re-run after the trim) |
  | Biome | warnings only (re-run after the trim) |
  | `check-address-literals` | pass (re-run after the trim) |
  | `v1-name-shapes` unit tests | 11/11 (re-run after the trim) |
  | Harness, portal config | 12/12 (before the trim; still lists 12 after) |
  | Harness, manager config | 6/6 (before the trim; still lists 6 after) |
  | Main's portal suite | 23 passed, 9 skipped (before the trim) |
  | Main's manager suite | 24 passed, 3 skipped (before the trim) |

  All run in CI's mode: `E2E_MOCK_BIGNAME=true`, with the `.env.ci` templates. The trim only removed files nothing in B0 imports, so the Playwright runs were not repeated.
- **Comments reworded (2026-10-28, the user's call)**: every B0 citation of a B10 doc is reworded to stand alone: file links, "rule 5/6/7", "§5.C"-style plan sections, "plan item H1–H8" and "iteration N". The harness-manager test titles say "read-back" / "app-visible" instead of "rule 5" / "rule 6", the address gate prints "address-literal gate", the README loses its "Smoke vs. nightly" section (it documents B1a's scripts), and `.gitignore` loses the `!e2e/coverage/` exception. These files are `incremental` B0 rows; B10 brings back the branch's wording. The only remaining doc citation is `AUTH_PLAN.md`, which is on main. Re-checked: typecheck, address gate, Biome (warnings only), `v1-name-shapes` 11/11, harness lists 12 + 6.

## Next action

1. On the user's go: open the PR from `e2e-land/b0-infra` (step 3). The body summarises the batch and has the results table above, with no attribution. Then record `pr:` for B0 in `landing/batches.ts`.

## Waiting on

- The user's go-ahead to open the B0 PR. The branch is already pushed; the split question is moot after the trim.

- **Security, for the user**: rotate the Mailinator API key, and update the `MAILINATOR_API_KEY` GitHub secret. The raw key is in `e2e/.env` on this branch, which has been pushed to a **public** repo, so dropping the file from main doesn't un-leak it.
- **Local checkout**: the user's local `e2e-tests-coverage` is behind origin by the sync merge. A fast-forward is blocked by uncommitted WIP in `e2e/package.json`, `pnpm-lock.yaml`, `e2e-coverage.md` and `e2e-defects.md`, and the user decides how to bring it forward.

## Open questions for the user

1. **B9 exploratory suites** (`migration-matrix`, `parity`, `replacement`, ~151 files): land, or drop? This can wait until B9.
2. **Worktrees**: which ones to fold in or abandon (see Worktree triage).
3. **B10 coverage ledger and planning docs**: when (or whether) they go to main. Until then, batches don't run the reconciler on main.

## Standing rules

- **No Claude attribution anywhere**: no `Co-Authored-By: Claude`, no "Generated with Claude Code", in commits, PR bodies, PR comments, code or docs.
- **Push, open a PR or comment on GitHub only after the user says go.**
- **Never remove a worktree or delete a branch without the user confirming that specific one.**
- **Main wins on every conflict.** When merging main back into this branch, take main's version of a landed file.
- **Freeze after B0 merges.** New tests are written on main, and this branch only receives `merge origin/main` plus tracker commits. Point the `pr-verify` and `e2e-goal` skills at main at that point.
- **Keep PRs reviewable**: under ~5k lines each. Split a batch if a peer can't review it in one sitting.

## Per-batch procedure

| # | Step | Who |
|---|---|---|
| 1 | Branch `e2e-land/<batch>` from `origin/main`, check out the batch's paths (`landing --batch <id> --paths`), and set the `@smoke` tags to match the ledger's smoke checklist | agent |
| 2 | Run Biome on the batch files, `pnpm typecheck` in `e2e/` and in any touched app, `pnpm --filter @ens-apps/e2e check:addresses`, and the batch's own Playwright configs on the local stack. Report the pass/fail table | agent |
| 3 | Push and open a PR to main. The body summarises the batch and includes the local run table, with no attribution. Record `pr:` in `landing/batches.ts` | agent, after the user says go |
| 4 | Watch CI and fix failures on the batch branch. Once nightly is on main, run `e2e-nightly.yml` manually on the branch for that batch's project | agent |
| 5 | Request peer review and merge | user |
| 6 | Set `merged: true` in `batches.ts`, merge `origin/main` into `e2e-tests-coverage` (main wins), regenerate the ledger and commit | agent |

**Step 1 details** (learned on B0):
- **Imports must close.** After the checkout, look for relative imports that point at files missing from the tree. If a batch file imports a later batch's file, move that file into the earlier batch in `batches.ts`, rather than shipping a broken import.
- **`package.json` files**: start from main's version and add only the scripts and deps this batch's files need. Never copy the branch's version wholesale. Then run `pnpm install` to update `pnpm-lock.yaml` from main's lockfile.
- **Coverage ledger (B10)**: main has no reconciler, `baseline.json` or `e2e-defects.md` until B10 lands, so batches before it skip the defect-row filter and the ratchet. When B10 is prepared: restore the branch's `e2e-defects.md`, delete every row the reconciler reports as "filed with no test proving it" (`for id in $(pnpm exec tsx coverage/reconcile.ts 2>&1 | grep -oE "defect (E2E-[0-9]+(, )?)+ filed" | grep -oE "E2E-[0-9]+" | sort -u); do grep -v "^| $id |" docs/e2e-defects.md > docs/.d && mv docs/.d docs/e2e-defects.md; done`), reset `baseline.json` to what is on main, and run `reconcile.ts --update`.
- **A spec that no config runs** fails the reconciler (once B10 lands). It goes in the batch that lands its config (e.g. `harness-manager-4ld.spec.ts` is in B1b).

**Step 2 details** (local run):
- Mirror CI's env in the batch worktree: `cp apps/{manager,portal}/.env.ci apps/{manager,portal}/.env`, then `set -a; . e2e/.env.ci; set +a`. The apps' `.env` files are tracked, so restore them (`git checkout -- apps/*/.env`) before committing.
- Ports 3000/3001 are usually held by another session's servers, which you must not kill. Start manager, then portal, one after the other; vite falls through to the next free ports. Check each listener's cwd (`lsof -p <pid> -a -d cwd`), then export `MANAGER_APP_URL` / `PORTAL_APP_URL`.
- The harness `time` test warps the **shared** anvil clock by 30 days. Other sessions on the same stack will see it.
- Also run main's existing manager and portal suites against the batch, because CI's path filter runs them whenever fixtures or helpers change.

**Pipelining**: B0 must merge before any other batch. After that, each batch depends only on B0, so prepare N+1 from main while N is in review. B8 (unit tests) can go up any time, even before B0.

## Batch status

| Batch | Scope | Status |
|---|---|---|
| B0 | Infra: stack, helpers, fixtures, harness, matrix seeding libs, address gate (95 files, ~13.7k lines) | local-green. Pushed as `e2e-land/b0-infra`, no PR yet |
| B1a | Smoke: Explorer specs + CI (sharded `@smoke` gate, nightly) | not started |
| B1b | Smoke: Manager specs | not started |
| B1c | Smoke gaps, written on main (see below) | not started |
| B2 | CCIP rest. `e2e/offchain-main` is merged into this branch. Fold in what's left on `e2e/offchain-ccip` (8 orphaned) and `e2e/offchain-1577` (3 orphaned) first | not started |
| B3 | Migration rest. Fold in `test/migration-scenario-seeder` (23) if the user keeps it | not started |
| B4 | Transfer, fuses, 4LD rest | not started |
| B5 | Registration, renewal, roles rest (includes the 5 `@smoke` tests in `roles.spec.ts`) | not started |
| B6 | Display, history, metadata service | not started |
| B7 | V1 shape matrix. Needs B10 first (`render-docs.ts` imports `matrix/ids.ts`) | not started |
| B8 | Unit tests in apps/ and packages/ | not started |
| B9 | Exploratory suites: land or drop | not started |
| B10 | Coverage ledger and planning docs, held back from B0 by the user. Stays on this branch for now | held |

**Smoke gaps (B1c)**, to be written as new tests on main after B0:
- Manager: add a banner (header) record.
- Explorer: create a V1 3LD and 4LD. Port an allowed case from `parity/v1-subname.spec.ts` into `portal/subnames`.
- Explorer: set a primary name, for a V2 name and a V2 subname.
- Explorer: a direct My Names test.
- Explorer: change a name's registry.
- Explorer: a positive transaction-history test (register / transfer / records).

When one is written, replace its `gap` entry in `landing/batches.ts` with `spec`, `title` and `mainOnly: true`.

**Smoke budget**: about 35–40 tests, against the old ~5 min gate. Expect 15–20 min, so shard the smoke job 2–3 ways in `e2e.yml` and measure it in B1a.

## Decisions log

- **2026-10-28**: Land in batches, not via #1175. Priority is Smoke → CCIP → Migration → the rest, with B0 infra first.
- **2026-10-28**: The tracker lives on this branch only, not on main.
- **2026-10-28**: Freeze after B0 merges.
- **2026-10-28**: The CI switch (per-PR smoke plus nightly full suite) lands with B1a, not B0.
- **2026-10-28**: Smoke is defined by the user's flow list (`smoke` in `landing/batches.ts`), plus the existing `@smoke` security regressions in portal registration and transfer. The `roles.spec.ts` smoke tests move to B5.
- **2026-10-28**: DROP covers only files nothing kept refers to: `qa2-*.mjs`, `docs/testing-campaigns/**`, `e2e/docs/archive/**`, 4 unreferenced `probe-*` scripts, and `readNamePages.ts` (dead code). Process notes that specs or configs cite (`e2e-build-goal.md`, `coverage/handoff.md`, …) are kept (now in B10).
- **2026-10-28**: Explorer can create V1 subnames (the user confirmed). It's a smoke gap, not N/A.
- **2026-10-28**: The Mailinator key stays a secret. `e2e/.env` never lands, and CI already reads `secrets.MAILINATOR_API_KEY`. The key still needs rotating (see Waiting on).
- **2026-10-28**: The user OK'd the push. The tracker was pushed after merging `origin/e2e-tests-coverage` (CCIP work and a main merge) in a scratch worktree, to keep the user's WIP untouched.
- **2026-10-28**: Removed the 4 clean worktrees: `e2e-fix`, `main-mainnet`, `rebase-e2e` and `apr-gap-main`. The `rebase/e2e-tests-coverage` branch is kept.
- **2026-10-28**: B0 pulls `e2e/matrix/**`, `packages/v1-name-shapes` and `migration-matrix/local-fork-routing.ts` forward, because B0's fixtures, harness and `coverage/scenarios.ts` import them. `harness-manager-4ld.spec.ts` moves to B1b.
- **2026-10-28**: Allowlisted Anvil account #2 in `check-address-literals.ts`. The CCIP fixture uses it as a record value, and the gate had been failing on this branch since the offchain commits. The fix is on both B0 and this branch.
- **2026-10-28**: Main (#1585) now has Greptile block merges on `high` rules, and several of them cover `e2e/**`: `no-any`, `no-non-null-assertion`, `no-new-suppressions`, `no-weakened-tests`, `removed-guard`. B0's added lines had 5 `any`, 2 `!` and 1 unexplained cast. All are fixed without changing behaviour (a typed Playwright report in `reconcile.ts`, `Reflect.get`, a single map lookup, and a reason on the cast), on both B0 and this branch. **For every batch**: grep the added lines for these before opening the PR.
- **2026-10-28**: The user took the coverage ledger (`e2e/coverage/**`) and the planning and handoff docs out of B0, to stay on this branch for now. They became batch B10. B0's commit was amended and force-pushed so main's history never carries them. `matrix/{ids,scenarios}.ts` went with them (they only feed the ledger), and the matrix runner files moved to B7. This also settled the one-PR-vs-split question.
- **2026-10-28**: The user chose to reword B0's comments rather than ship links to B10's docs. B0 amended and force-pushed as `05cee518c`.

## Worktree triage (2026-10-28)

Run `pnpm --filter @ens-apps/e2e landing --worktrees` for the live table.
- **Orphaned commits** are commits on neither main nor this branch. The count over-reports for `test/verify-pr-*` branches, because they carry the PR's own commits, which main took as a squash. Before calling one orphaned, check `git diff origin/main...<branch> -- e2e`.
- **Removed 2026-10-28** (clean, nothing orphaned): `.claude/worktrees/e2e-fix`, `main-mainnet`, `rebase-e2e`, and `worktrees/apr-gap-main`.
- **Need a decision** (dirty or orphaned work), roughly by size:
  - `worktrees/pr1494-approval-36`: 65 dirty, 11 orphaned commits.
  - `worktrees/migration-retention-matrix`: 63 dirty, 6 orphaned. B3 or B9.
  - `worktrees/ens-manager-replacement-parity`: 38 dirty, 9 orphaned. B9.
  - `worktrees/migration-scenario-seeder`: 23 orphaned. B3.
  - `.claude/worktrees/offchain-ccip`: 8 orphaned, 15 dirty. B2.
  - `.claude/worktrees/offchain-1577`: 3 orphaned, 22 dirty. B2.
  - `pr-1494-userreg`, `pr1494-e2e-coverage`, `pr1494-apr-gap-fix`, `pr-1274-ci` and `pr-1188-network-config`: 14–29 orphaned each.
  - The remaining `test/verify-pr-*` and `retrofit/*` worktrees.

## Gotchas

- `--paths` and the ledger compare `origin/*` refs, so run `git fetch origin` first. A local-only commit on this branch doesn't count until it's pushed.
- `e2e/package.json`, `package.json`, `pnpm-lock.yaml`, `e2e/README.md` and `local-e2e-stack.md` are `incremental` B0 rows: every batch edits them. After B0 merges they read `partial`, and `landed` only after the last batch.
- When diffing a batch branch, compare it with its own base (`HEAD`), not `origin/main`: main moves while the batch is in progress.
- **Never chain `cd` after a network command.** A failed `git fetch` once skipped a `cd <worktree>` and the rest ran in the user's main checkout, committing their WIP (undone; the pre-commit hook had also reformatted two of their files, restored from their blobs). Use `git -C <path>` and absolute paths, with `set -e`.
- Biome ignores `.claude/worktrees/`, so batch worktrees live under `/Users/sg/ens/worktrees/`.
- Local stack quirks are in [local-e2e-stack.md](./local-e2e-stack.md). Don't duplicate them here.

## How to resume

```bash
git fetch origin
git switch e2e-tests-coverage
pnpm --filter @ens-apps/e2e landing --check   # regenerates landing-ledger.md
```
Then read **Now**, **Next action** and **Waiting on** above, and the ledger's batch table.
