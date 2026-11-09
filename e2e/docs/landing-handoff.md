# Landing handoff: `e2e-tests-coverage` → `main`

This is the state of the work to move `e2e-tests-coverage` onto `main` in reviewable batches, written so any agent can pick it up cold. **Update it at the end of every step, and before stopping.** The file-level truth is the generated [landing-ledger.md](./landing-ledger.md). This doc carries what git can't: what's in flight, what's next and why.

## Now

- **B1b merged** as #1658 (squash, 2026-11-02). Main merged back (`64964e9ad`): main won every conflict, then `git show 8529e189f | git apply -R` on the four partial files restored the deferred tests. The merge commit's lingui hook pruned the manager locale catalogs; a follow-up commit restores main's copies (commit the merge with care: `LEFTHOOK=0` for merges and pushes to this branch, since the hooks lint the whole branch).
- **B1d (WEB-2110) merged** as #1680 (2026-11-03); main merged back (`2dc6155cd`), keeping E3/E4 in `hca-session-revoke.spec.ts` (main's copy imports `switchWalletToUndeclaredChain` as a type only; the branch needs the value import). Branch `linear/WEB-2110`, worktree `/Users/sg/ens/worktrees/web-2110`, commit `5ad5974b7`. It rewrites the stale guards for main: the WEB-674 reset spec (4 tests; E6 dropped because #1480 removed "Remove saved session"), the WEB-1483 leftover describe (4) and the two WEB-1506 budget tests. The same files are on this branch, so they read `landed` once it merges.
- **Two WEB-674 guards fail on the app** and are held on this branch as `test.fail` until the user files a bug: loaded on an undeclared chain the menu still offers the reset (E3), and after a live switch "Reset access" sends `eth_sendTransaction` to the wallet on the wrong chain and spins forever (E4).
- **Infra fix merged as #1681** (2026-11-03): `fix/e2e-upstream-cache-final-4xx` (worktree `/Users/sg/ens/worktrees/upstream-cache-4xx`, `7556f7278`). `upstream-cache.mjs` retried drpc's HTTP 400 for Anvil 1.7's `eth_getAccountInfo` 20 times serially, which stalled the local fork. The running `infra-upstream-cache-1` now mounts that worktree's file.
- **B0 merged** as #1599 (squash, 2026-10-29) and **B1a merged** as #1601 (squash, 2026-10-30). Main was merged into this branch afterwards (`d150d9fe7`): main's version wins in every landed file; the two `package.json` files keep main's content plus the branch-only scripts and the `@tenkeylabs/dappwright` dev dependency.
- **The freeze is on.** New tests are written against main; this branch only takes `merge origin/main` and tracker commits. `pr-verify` now bases on `origin/main` and lands tests as a PR to main. `e2e-goal` is paused (status-only), because its ledger is B10 and lives only on this branch. Both skills are untracked files in the main checkout's `.claude/skills/`.
- **Squash merges:** each stacked batch PR conflicts once its base lands, because the squash commit shares no history. Resolve by taking the batch's side in files the previous batch landed (main's tree equals the previous batch's head), as done on #1601.
- **#1637 merged** (portal pays in the token its checkout shows; the registration USDC mismatch from #1395). The `test.fixme` markers on WEB-1229 and WEB-1572 never reached main (removed on #1601 before the squash). Both run per PR and pass.
- **#1654 (WEB-2097)** paused subname creation in the app and rewrote the three Add 3LD/4LD smoke tests to assert the redirect and the disabled action. The checklist points at the new titles and marks those flows paused. Real creation coverage comes back when WEB-2097 is reverted.
- **Per-PR CI on main now:** portal `@smoke` (46 tests, 2 shards), `manager-migration` (`playwright.migration.config.ts --grep @smoke`, the five migration flows), the manager's full suite (3 shards) and the address-literal gate. Nightly runs every manager, migration, portal and cross-app spec.

## Next action

- **B2 merged** as #1729 (2026-11-05), with a review fix: `createMakeOffchainName` takes `waitForIndexer` (default true) and `seed:offchain-name` turns it off, so the script keeps serving when the local bigname is down. Main merged back (`1306a10d7`); the allowlist conflict resolved to main's copy plus Anvil account #4 (used by the held B11 spec).
- **#1733 merged (2026-11-05)**: fixes nightly's 5 `registration-rhinestone` tests broken since #1684 (pay with ETH). Test-side only: payment action label ("Sign approval" when the HCA covers the name), the page's Existing balance row read, mockestrator's $0 fee, and primary-name calls left out of the deploy-gas shape. Main merged back (`45c9597a1`), clean; the spec matches main.
- **#1768 merged into #1767's branch (2026-11-10); #1767 now lands B4a + B5a.** Greptile review on #1767 fixed (`09fb3c1c6`): `recreated-subnames.spec.ts` moved to `projects/cross-app/tests/` (it drives the manager's upgrade; the nightly portal job starts only the portal), with `test.use({ baseURL: PORTAL_APP_URL })` for the portal fixture's cookie, 2/2 under cross-app; seeders: not-owner registers to user2, expired shapes aged past expiry, own-resolver expects only resolver-detach (the per-name PermissionedResolver impl `0x115eb53f…` has no node `setAddr`, so `stale-resolver` stops with that reason), readonly types, has* names, no warning symbols. **On merge-back:** `git mv` the branch's `portal/tests/recreated-subnames.spec.ts` to `cross-app/tests/` and keep its held L203 test.
- **B5a open as #1768 (2026-11-09), stacked on #1767** (base `e2e-land/b4-transfer`; after #1767 squash-merges, retarget to main and resolve by taking B5a's side). Branch `e2e-land/b5-registration` (worktree `/Users/sg/ens/worktrees/e2e-land-b5`). 15 `roles` tests + 2 `recreated-subnames` tests (rerun in file order: 29/29 with harness), the WEB-1418 plan, `useTransferRoleRevocations.test.ts`, and a `confirmAndAuthorize` fix: it continues through the #1660 subname review ("What happens to your subnames" / "unaffected") and never through a blocked one. That dialog is likely why the B3b recreation tests never reach "upgraded". Merge after #1767 (the WEB-1418 plan cites `seed-transfer-names.ts`). **B5b held:** 19 `roles` tests that read indexed role history (C11, E2E-009, WEB-1418 second revoke, WEB-1487 ×2, WEB-1469 ×9, WEB-1484 ×5; their strings still exist in the app, the mock serves no role events and some `route.fetch` the real history), and `recreated-subnames` L203: a recreated V2 child with no V2 resolver shows its V1 record ("zoe stale v1") on the explorer Records page, possibly a regression of b0480bcc8, unconfirmed. WEB-1469/1484 plans → B5b; WEB-1487 plan → B8 with `useRemoveUserPlan.test.ts` (7/8 fail: mocks predate #1387).
- **B4a open as #1767 (2026-11-09).** Branch `e2e-land/b4-transfer` (`bce693503`, worktree `/Users/sg/ens/worktrees/e2e-land-b4`). Lands `portal/fuses.spec.ts` (1 test, passed locally; harness 12/12), the transfer seed scripts with their package scripts, `manual-subname-transfer.md` and the `probe:subname-transfer` script it cites. Held: `migrated-fuses.spec.ts` → **B4b** (GW8's control expects a "Create subname" link, now a disabled button while WEB-2097 pauses creation; GW7 is the E2E-021 `test.fail`); `transfer-observers`, `v1-4ld`, `v2-4ld-time` → B11 (skip under the mock); `manual-v1-transfer.md` → B8 (dev-tool presets). The shared stack was restarted on 2026-11-09 by the `pr-1759-graveyard` session (direct drpc fork, its servers on :3003/:3004).
- **B3a merged as #1744 (2026-11-09).** Main merged back: the four partial specs keep the branch copy (held tests) with #1744's review fixes re-applied, and #1760 (recreation always on, no PostHog flag) mirrored: the flag-off and rollout-gate describes are gone and `connectWithFlags` takes two arguments. **B3b note:** the held C3b test still has a "rollout withdrawn" variant that flips the removed flag; drop it in the rewrite.
  - Greptile review fixed (`5b7e29d6f`): `upgradeAndSettle` returned `generic` on timeout, so A5/A6/A7 passed while sitting on a subname dialog. It now returns `stuck` on timeout and recognises "These subnames can't be preserved yet"; A5 and A6 assert that refusal. **A7 moved to B3b** (the app no longer blocks on a child resolver change after review: stale guard), with its `0x…c0de` allowlist entry. `manual-subname-migration.md` moved to B8 (needs the dev-migration-tool presets). B3a is now 23 tests.
- **B11 (new, held by the user's call 2026-11-05): real-indexer tests.** `offchain-subname-migration.spec.ts` (4 GR15 tests) skips under `E2E_MOCK_BIGNAME=true`, which CI and nightly both set, so it waits for a nightly job that runs the local bigname. That needs the `bigname:e2e-anvil-fork` image published (it is built from the unpushed `e2e/anvil-fork-start` branch in `~/ens/bigname`). Also open: on 2026-11-03 the local real-bigname run hung at the upgrade list for main's `migration-subname` control too; undiagnosed.
- Once the user files the wrong-chain reset bug: land E3/E4 on main with its ID (as tests that pass once it's fixed, or with the fix).

0. **B1b is open as #1658** (branch `e2e-land/b1b-manager-smoke`, worktree `/Users/sg/ens/worktrees/e2e-land-b1b`). Watch CI (manager smoke ×2 shards, manager-migration with the portal started) and fix test-side failures on the branch; the user merges. Then merge main back here and regenerate the ledger.
1. (done locally) Prepare **B1b** (Manager smoke) from main: `playwright.smoke.config.ts`, the remaining manager specs and `@smoke` tags for the Manager rows (registration, renew, bulk renew, primary name, records, My Names, migration of a registry subname and a name in grace, CCIP), then switch the manager's per-PR job to its smoke config.
2. Triage the four nightly migration failures (GW uncertified-resolver refusal, GU4, GS11, gas-budget split).

## Waiting on

- The user filing the wrong-chain session reset bug (E3/E4).

## Open questions for the user

- **Wrong-chain session reset bug** (E3/E4 above): to be filed by the user; the agent gave bug text on 2026-11-02.
0. **`test.fail` already on main** (E2E-020 ×2 in `migration-fuses.spec.ts`, E2E-026 in `migration.spec.ts`, landed with B1a): pull them back out under the no-fixme/fail rule, and file their bugs?
1. **B9 exploratory suites** (`migration-matrix`, `parity`, `replacement`, ~151 files): land, or drop? This can wait until B9.
2. **Worktrees**: which ones to fold in or abandon (see Worktree triage).
3. **B10 coverage ledger and planning docs**: when (or whether) they go to main. Until then, batches don't run the reconciler on main.

## Standing rules

- **No Claude attribution anywhere**: no `Co-Authored-By: Claude`, no "Generated with Claude Code", in commits, PR bodies, PR comments, code or docs.
- **Push, open a PR or comment on GitHub only after the user says go.**
- **Never remove a worktree or delete a branch without the user confirming that specific one.**
- **Main wins on every conflict.** When merging main back into this branch, take main's version of a landed file.
- **Freeze after B0 merges.** New tests are written on main, and this branch only receives `merge origin/main` plus tracker commits. `pr-verify` targets main; `e2e-goal` stays paused until B10 lands.
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
| B0 | Infra: stack, helpers, fixtures, harness, matrix seeding libs, address gate (95 files, ~13.6k lines) | merged (#1599), ledger synced |
| B1a | Smoke: Explorer specs + CI (sharded `@smoke` gate, nightly) + migration smoke | merged (#1601), ledger synced |
| B1b | Smoke: Manager specs | merged (#1658), ledger synced |
| B1d | WEB-2110: stale HCA guards rewritten for main | merged (#1680) |
| B1c | Smoke gaps, written on main (see below) | not started |
| B2 | CCIP rest: `offchain-v2` + seed scripts. Worktree fold-in checked 2026-11-03: `offchain-ccip`/`offchain-1577` app commits superseded on main; only H21 from `offchain-main` taken | merged (#1729) |
| B11 | Real-indexer tests (`offchain-subname-migration`); wait for a nightly real-bigname job | held |
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
- **2026-11-05**: B2 lands without `offchain-subname-migration.spec.ts`. Its tests only run on the real bigname, CI and nightly both mock it, so on main they would always skip (the repo's rule: every test must be able to fail). The user moved it to a later phase (B11) with a real-indexer nightly job.
- **2026-11-02**: WEB-2110 rewrite. The deferred guards failed on main for test-side reasons: the session key went `ens-sessions-v9` → `v10`; the revoke entry became "Reset smart session access" (#1480); a reset now also returns leftover USDC in a second transaction (#1586), and CI funds the shared HCA with 10,000 USDC, so reset tests empty the HCA and restore it; the payment sheet's rows, failure copy and "Try again" action changed (#1513/#1514/#1604) and the "up to" hedge is gone for registrations; the leftover tests seeded ensjs MockUSDC. The earlier fixme note ("the session gate never shows when the HCA covers the total") was wrong: the gate shows whenever no session is live. `fundTestUsdc(holder, balance?)` + `readTestUsdc` are the shared way to set the payment USDC. "funds the resolver deploy… (primary name off)" failed once in a full run and passed alone (shared resolver state); watch it.

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
- **2026-10-28**: B1 is split as planned: B1a → B0 (#1601), B1b → B1a, so both reach B0 as the user asked while staying reviewable (~15k and ~10k lines).
- **2026-10-28**: B1a builds `e2e.yml` from main's file (Node 24 pin, path filter, sharding) rather than the branch's, and drops the branch's coverage/matrix-check steps (B10/B7 not landed). `e2e-land/**` is a PR base so stacked PRs get e2e CI; drop it after the landing.
- **2026-10-28**: Cross-app `@smoke` tests skip unless bigname is real, so the per-PR gate has no cross-app job; nightly runs cross-app (two of its specs work with mocked bigname).
- **2026-10-31**: B0 and B1a merged; main merged into this branch with main winning every landed file. The freeze starts. #1637 (the USDC mismatch) merged, so the two registration `fixme` markers can be removed.
- **2026-11-01**: B1b prepared. Manager per-PR job switches from the full suite (3 shards) to `playwright.smoke.config.ts` (2 shards); nightly keeps the full suite. The migration jobs (per PR and nightly) now also start the portal, because `offchain-migration.spec.ts` checks the migrated name in the explorer.
- **2026-11-01**: `migration-time.spec.ts` stays untagged: `manager-migration-time` depends on `manager-migration`, and Playwright runs a dependency project in full when any test in a dependent project is selected, so one `@smoke` there pulls all 62 migration tests into the per-PR job. The two Manager V1-renew checklist rows run nightly.
- **2026-11-01**: Branch specs that main's app changes left behind (test-side, not app defects): `renewFor28Days` renewed one day since #1498 made the picker's minimum one day (fixed: picks expiry + 28); grace names start unselected since #1556 (fixed: the spec opts in). Grace flow fixed and back in `@smoke`: `fundTestUsdc` now funds the manifest's Circle USDC (it funded ensjs MockUSDC), grace rows are checked by the "names in grace" section (#1556 dropped the badge), and the manager fixture presets the analytics-consent cookie (the banner covered the requests link). Still stale and held out of `@smoke` (nightly only, need a rewrite): WEB-1506 budget guard (#1513 replaced its copy and the "up to" hedge), WEB-1483 leftover and WEB-674 revoke (both assume an HCA short of the total; CI funds it 10,000 USDC).
- **2026-11-02**: **Rule (user): no batch lands `test.fixme` or `test.fail` tests.** fixme tests (stale test, app fine) stay on this branch for a later batch; for test.fail tests (known app bug) the agent gives the user bug text to file in Linear, and the test also waits for a later batch. Conditional environment guards that switch off by themselves (migration-grace `expectFailureWhileRenewerDeauthorised`) may stay. Applied to #1658 (`8529e189f`): the WEB-674 revoke spec and the WEB-1483 leftover plan/describe moved to B5; the two WEB-1506 budget tests and the A22, GS10, GS20, GS21, GS23, GW4 and B4 test.fail tests were cut from the B1b copies of `registration`, `registration-rhinestone`, `migration-subname` and `migration-time` (now `incremental` rules). **When merging main back into this branch, keep those deferred tests in those four files** (take main's version, then re-add them), or they are lost. E2E-020 and E2E-026 `test.fail` tests already on main (from B1a, `migration-fuses`/`migration.spec`) predate the rule; see Open questions.
- **2026-11-02**: Malak on #1658: the 12 stale guards (6 WEB-674 revoke, 4 WEB-1483 leftover, 2 WEB-1506 budget) are now `test.fixme` with a WEB-2110 issue annotation so nightly stays green; the harness "pointed at this fork" check is `@smoke` in the manager smoke config. Rewrite tracked in WEB-2110.
- **2026-11-02**: Greptile on #1658 (all three valid, fixed in `df98bdf54`): the B12 empty-wallet test and migration-time used ensjs MockUSDC instead of the manifest's Circle USDC (and missed the dev build's `anvil_setStorageAt` top-up); readonly fields/params; `is`/`should` boolean prefixes. **For every batch**: grep added lines for ensjs `.usdc.address` (use `getDestinationContracts(...).usdc`), unprefixed boolean flags and mutable interface fields before opening the PR.
- **2026-11-01**: No unskip PR needed: main never carried the `fixme` markers. `pr-verify` pointed at main (worktree off `origin/main`, Phase 7 is a tests PR to main, no attribution line). `e2e-goal` paused with a freeze note rather than repointed, since its state files are B10.

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
- **Migration specs fail locally with "Upgrade 0 names"** when Anvil forks through `upstream-cache` (start-local-env's default): /upgrade's `eth_getLogs` scan runs ~2 s per batch and outlasts the 30 s wait. CI forks drpc directly. Start with `ANVIL_FORK_URL=<drpc url> BIGNAME_IMAGE=bigname:skip bash e2e/infra/scripts/start-local-env.sh` (the bogus image also skips the bigname reset); main's migration smoke went 7/17 → 17/17.
- **Nightly red since 2026-11-04** beyond the five #1733 fixed: portal registration (WEB-1485 price reads, multi-name Extend), portal transfer, manager profile grace extends, offchain rate-limit tests, three migration tests. Untriaged.
- **`start-local-env.sh` aborts at the bigname reset when other compose projects exist**: `reset-bigname.sh` runs `docker volume rm` on every project's `bigname-data` volume (in-use ones fail, which aborts the script under `set -e`; unused ones are deleted silently). On 2026-11-03 `migration-priority124-…-015` had no `bigname-data` volume afterwards; whether this run removed it is unknown (Docker kept no events). To start only infra's bigname, scope the volume delete to `infra_bigname-data` (scratchpad `start-infra-bigname.sh` did this).
- **Quality checks need `test:coverage` in every changed package** (no `--if-present`, on purpose). `e2e/package.json` has it since #1680/#1681; it runs the `infra/bigname/*.test.mjs` node tests. Don't remove it, or e2e-only PRs fail with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`.
- **Local fork stalls with anvil unhealthy** and state reads timing out: `upstream-cache` retrying a 400 (see Now). Check `docker logs infra-upstream-cache-1` for `giving up: upstream answered 400`, and `docker inspect` its mount: the `infra-*` stack was started from `.claude/worktrees/offchain-main`, whose stale cache script even caches `eth_blockNumber`. Recreate only that service from a fixed worktree (`docker compose -p infra -f <worktree>/e2e/infra/docker-compose.yml up -d --no-deps --force-recreate upstream-cache`), then restart anvil, alto, mockestrator and paymaster and rerun `fund-rhinestone-account.sh`.

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
