# Landing handoff: `e2e-tests-coverage` → `main`

This is the state of the work to move `e2e-tests-coverage` onto `main` in reviewable batches, written so any agent can pick it up cold. **Update it at the end of every step, and before stopping.** The file-level truth is the generated [landing-ledger.md](./landing-ledger.md). This doc carries what git can't: what's in flight, what's next and why.

## Now

- **Batch**: none started. The tracker is set up and pushed to `origin/e2e-tests-coverage`.
- **Step**: setup done. B0 is next.

## Next action

1. Prepare B0 (procedure step 1): branch `e2e-land/b0-infra` from `origin/main`, then:
   ```bash
   git checkout origin/e2e-tests-coverage -- $(pnpm --silent --filter @ens-apps/e2e landing --batch B0 --paths)
   ```
   Then trim `e2e/package.json` and `package.json` to the scripts whose targets exist in B0. For example, drop `test:smoke*`, `matrix:*` and `test:replacement*`. Also check why `apps/*/vite.config.ts` changed.
2. Run step 2 (local green) and report the results to the user.

## Waiting on

- **Security, for the user**: rotate the Mailinator API key, and update the `MAILINATOR_API_KEY` GitHub secret. The raw key is in `e2e/.env` on this branch, which has been pushed to a **public** repo, so dropping the file from main doesn't un-leak it.
- **Local checkout**: the user's local `e2e-tests-coverage` is behind origin by the sync merge. A fast-forward is blocked by uncommitted WIP in `e2e/package.json`, `pnpm-lock.yaml`, `e2e-coverage.md` and `e2e-defects.md`, and the user decides how to bring it forward.

## Open questions for the user

1. **B9 exploratory suites** (`migration-matrix`, `parity`, `replacement`, ~151 files): land, or drop? This can wait until B9.
2. **Worktrees**: which ones to fold in or abandon (see Worktree triage).

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
| 2 | Run Biome on the batch files, `pnpm typecheck` in `e2e/` and in any touched app, `pnpm e2e:coverage`, and the batch's own Playwright configs on the local stack. Report the pass/fail table | agent |
| 3 | Push and open a PR to main. The body summarises the batch and includes the local run table, with no attribution. Record `pr:` in `landing/batches.ts` | agent, after the user says go |
| 4 | Watch CI and fix failures on the batch branch. Once nightly is on main, run `e2e-nightly.yml` manually on the branch for that batch's project | agent |
| 5 | Request peer review and merge | user |
| 6 | Set `merged: true` in `batches.ts`, merge `origin/main` into `e2e-tests-coverage` (main wins), regenerate the ledger and commit | agent |

**Pipelining**: B0 must merge before any other batch. After that, each batch depends only on B0, so prepare N+1 from main while N is in review. B8 (unit tests) can go up any time, even before B0.

## Batch status

| Batch | Scope | Status |
|---|---|---|
| B0 | Infra: stack, helpers, fixtures, harness, coverage ledger (99 files) | not started |
| B1a | Smoke: Explorer specs + CI (sharded `@smoke` gate, nightly) | not started |
| B1b | Smoke: Manager specs | not started |
| B1c | Smoke gaps, written on main (see below) | not started |
| B2 | CCIP rest. `e2e/offchain-main` is merged into this branch. Fold in what's left on `e2e/offchain-ccip` (8 orphaned) and `e2e/offchain-1577` (3 orphaned) first | not started |
| B3 | Migration rest. Fold in `test/migration-scenario-seeder` (23) if the user keeps it | not started |
| B4 | Transfer, fuses, 4LD rest | not started |
| B5 | Registration, renewal, roles rest (includes the 5 `@smoke` tests in `roles.spec.ts`) | not started |
| B6 | Display, history, metadata service | not started |
| B7 | V1 shape matrix | not started |
| B8 | Unit tests in apps/ and packages/ | not started |
| B9 | Exploratory suites: land or drop | not started |

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
- **2026-10-28**: DROP covers only files nothing kept refers to: `qa2-*.mjs`, `docs/testing-campaigns/**`, `e2e/docs/archive/**`, 4 unreferenced `probe-*` scripts, and `readNamePages.ts` (dead code). Process notes that specs or configs cite (`e2e-build-goal.md`, `coverage/handoff.md`, …) land with B0 to avoid dead links.
- **2026-10-28**: Explorer can create V1 subnames (the user confirmed). It's a smoke gap, not N/A.
- **2026-10-28**: The Mailinator key stays a secret. `e2e/.env` never lands, and CI already reads `secrets.MAILINATOR_API_KEY`. The key still needs rotating (see Waiting on).
- **2026-10-28**: The user OK'd the push. The tracker was pushed after merging `origin/e2e-tests-coverage` (CCIP work and a main merge) in a scratch worktree, to keep the user's WIP untouched.
- **2026-10-28**: Removed the 4 clean worktrees: `e2e-fix`, `main-mainnet`, `rebase-e2e` and `apr-gap-main`. The `rebase/e2e-tests-coverage` branch is kept.

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
- `e2e/package.json`, `package.json` and `pnpm-lock.yaml` are B0 rows that every batch edits. They read `landed` only after the last batch.
- Local stack quirks are in [local-e2e-stack.md](./local-e2e-stack.md). Don't duplicate them here.

## How to resume

```bash
git fetch origin
git switch e2e-tests-coverage
pnpm --filter @ens-apps/e2e landing --check   # regenerates landing-ledger.md
```
Then read **Now**, **Next action** and **Waiting on** above, and the ledger's batch table.
