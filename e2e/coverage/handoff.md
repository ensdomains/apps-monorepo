# E2E build — iteration handoff

The file `/e2e-goal` reads first. One section per iteration, newest at the top.
`In flight: nothing` is the goal.

---

## Iteration 32 — 2026-10-10 · bigname harness merged; interpret stall fixed; both modes run locally

**Batch:** take over the bigname harness (`.claude/worktrees/bigname-harness`,
its handoff `e2e/docs/bigname-harness-handoff.md`). Merged
`e2e/bigname-harness` into `e2e-tests-coverage` (`b7592d017`, `--no-ff`, no
conflicts: nothing had been committed here since `e7ed77282`). Local env edits
were copied to the session scratchpad first and put back after; the manager's
`.env.local` gained `VITE_BIGNAME_API_URL=http://127.0.0.1:5660`.

**Verified after the merge:** `pnpm typecheck` clean in apps/manager,
apps/portal, workers/api-worker, packages/indexer, e2e. Unit tests: indexer 46,
api-worker 245, manager 3,192 and portal 2,674 pass; the one failure in each
app is `csp.test.ts` "allowlists every shared RPC failover origin", which wants
`https://lb.drpc.live` in connect-src and fails only because the local `.env`
sets `VITE_SEPOLIA_RPC_URL=/rpc`.

### The interpret stall (E2E-022) — cause and fix

Not the event order: **two consecutive blocks in the same second.** A wrapped
`makeV1Name` reserves in V2 (block N) and then `wrapETH2LD`s, whose
`BaseRegistrar.reclaim` emits the ENSv1 `NewOwner` (block N+1). With the pair
one second apart bigname indexes fine; in the same second it stops. bigname
seeds ENSv1 surface-binding ids from the authority key and the event instant
(`binding:{authority_key}:{timestamp[+log_index]}`, six sites under
`crates/adapters/src/schema_v2/protocol/v1/`), with no block number, so the two
collide and the upsert's `active_from` guard rejects the second. Real chains
cannot produce equal timestamps; Anvil does whenever it mines two blocks in one
second, so a fixture-side fix would only move the problem to the app's own
transactions.

Fix: bigname commit `0f6c2171d` on local branch `e2e/anvil-fork-start` (not
pushed) — `v1_binding_seed` folds the block number into the seed **only** under
`BIGNAME_DEV_ALLOW_SEPOLIA_START=1`; unflagged seeds are byte-for-byte
unchanged. Image `bigname:e2e-anvil-fork` rebuilt from it (previous one kept as
`bigname:e2e-anvil-fork-prev`). Verified: the stalled pair re-indexes from a
fresh database, plus three more same-second reserve→wrap pairs. A bigname issue
is drafted for review in the session scratchpad (`bigname-issue-draft.md`), not
filed.

### Stack changes (committed in `9cc6248f7`)

- `bigname-api` reads through the fork-aware router (`bigname-rpc:8547`), not
  Anvil: its startup check reads the genesis block, which Anvil answers by
  asking its own upstream.
- The router has its own `BIGNAME_UPSTREAM_RPC_URL` (falls back to
  `SEPOLIA_FORK_URL`). Used here: `https://sepolia.gateway.tenderly.co` (an
  archive; throttles bursts with 429, the router retries).
- **Anvil must stay on an archive upstream.** publicnode stopped drpc's 500s
  crashing Anvil, but it prunes (~10k blocks): Panoptes backfills from the ENSv2
  deployment ~64k blocks before the fork and then indexes nothing, which fails
  the portal harness. Anvil is back on the default drpc; it still crashes now
  and then — the runner rebuilds between suites.
- drpc's key also rate-limits the router after a few fresh-fork backfills in a
  day (HTTP 429, bigname stuck at block 0).

### Mock mode (CI) fixes

- `mockV1Names` matched only `bigname.sh/v1/`; a local dev server reads
  `127.0.0.1:5660`, so mock-mode runs silently read the real local index (and
  nothing waited for it). It now matches `:5660` too, like `mock-indexer.ts`.
- The mock reports a test's own V1 resolver and registrant/manager split, and
  defaults the resolver to the one `makeV1Name` writes records to (the app
  takes record **keys** from bigname and reads **values** on chain from the
  resolver bigname reports; a different default replayed nothing — GR1).
- `serveV1Names(page, input, { indexer: mockIndexer })` also registers the
  names with the dashboard's mock (it lists from a different query).

### Real-mode findings

- The dashboard's "Upgrade Names" banner hides once the wallet has migrated
  any name (`shouldShowUpgradeBanner`: `migratedCount >= 1`). The shared wallet
  always has, so `openMigrationFlow` now opens `/upgrade` directly. The grace
  tests that assert the banner itself (`:288`, `:416`, `:634`) can only pass on
  a wallet that never migrated: real-mode-only limitation, covered in mock mode.
- Account 0 accumulates every name it creates; by mid-suite `/upgrade` lists
  80+ and new rows can take longer than 30 s to appear (GW3/GW7/GW8 in real
  mode). Paging is fine (`v1Names.ts` follows the cursor).
- Registry-only V1 subnames have no label in local bigname (`[labelhash].p.eth`:
  only the hash reaches the chain), so the subname copy specs fail in real mode
  and are skipped in mock mode — **GS3/GS4/GS7/GS9/GS14/GS15/GS16 currently run
  in neither mode.** Needs a label source for the local bigname, or a mock that
  can express subname trees.
- `evm_revert` below a block bigname has seen makes its head walk ask for a
  block that no longer exists ("provider omitted block"): terminal, recovers on
  restart within a minute. Seen once, during the harness's snapshot tests.

### Results

| Suite | Mode | Result |
|---|---|---|
| manager-migration | mock (CI) | **33 pass**, 7 skip (subname trees), 0 fail — incl. the 91-day time project |
| manager-migration | real | 24 pass, 15 fail (see real-mode findings: accumulation, banner, subnames) |
| manager | mock (CI) | 44 pass, 7 fail, 3 skip |
| manager | real | 30 pass, 18 fail, 6 skip — 14 were the #1258 `Select USDC` drift, since fixed |
| manager-premium | both | 4 skipped by design |
| portal | real | 428 pass, **66 fail**, 3 skip (1.8 h) — see below |
| cross-app | real | no tests exist |
| metadata | real | 16 pass, 2 fail — the known pair (webhook cache purge, mainnet archive) |

Portal failures (real mode), none bigname-related — the portal still reads
Panoptes. Fifteen portal PRs reached `main` on 2026-10-06…09 without e2e
updates, and this merge brought them in:
- transfer ×26, roles ×14: #1353 (WEB-1762) reads current role holders with a
  new `RoleHolders` (`roleConnection`) query. The local Panoptes image
  (`ghcr.io/mdtanrikulu/panoptes:latest`, built 2026-04-23; the registry
  answers 403, so it cannot be refreshed from here) returns no holders, the
  WEB-1484 guard then refuses to build a transfer plan ("Couldn't check who
  else holds permissions on this name…"), and every transfer test finds
  "Transfer name" disabled. `mock-indexer.ts` has no `RoleHolders` handler
  either, so CI mode would hit the same guard. #1346 (role events past 1,000,
  list loader) also changed the role history the tests read.
- V1 matrix ×24 (2LD 16, 3LD 6, 4LD 2): resolver/change-resolver/history tabs
  now render content for V1 names where the matrix expects "Not Available for
  V1 Names" / "No history yet" — the list-loader and paged-timeline series
  (#1323…#1355, e.g. #1327 history timeline, #1338 resolver history).
- history ×1, resolver ×1: same series.

Manager failures left in mock mode, none bigname-related:
- WEB-1483 ×4 (`registration-rhinestone.spec.ts` "payment sheet with a
  leftover"): #1258 removed the itemised "Network fee" line from the payment
  breakdown on purpose; the tests encode the old design and need rewriting.
- B11 (`profile.spec.ts:566`): the renew deep link now redirects an unregistered
  name to `/register/$name` — B11's own oracle ("parity: v3 redirect"). The test
  expected an error page, which only appeared because the pre-bigname indexer
  reported no protocol for an available name. Rewritten; 4/4 green in both
  modes after raising the redirect wait to 30 s (a cold dev server compiles the
  register route on first use).
- B5 (`:507`): compares the calendar against the runner's wall clock
  (`new Date()`), which a warped fork has left behind; the year select has no
  such option. B2 (`:387`, extend an unowned name): mid-transaction timeout,
  not triaged.

**Reminder — bigname branch stays local (user, 2026-10-10):** `~/ens/bigname`
branch `e2e/anvil-fork-start` (incl. the stall fix `0f6c2171d`) is NOT pushed,
and the drafted bigname issue is NOT filed. Decide later with the user; do not
push or file without asking.

**Portal failures parked (user, 2026-10-10):** the portal is moving to bigname
soon, so the portal drift below is not being worked on now.

**Next:** (0) portal drift pass for #1323…#1355 and #1346/#1353 — parked, see above: a
`RoleHolders` handler in `mock-indexer.ts`, a current Panoptes image locally
(needs registry access), then re-baseline the V1 matrix expectations and the
role/transfer specs; (1) rewrite the WEB-1483 tests for #1258's breakdown;
(2) fix B5's clock source, triage B2; (3) a label source for subnames in local bigname;
(4) per-suite fresh wallets or forks for real mode, so accumulation stops
skewing results; (5) update `e2e/README.md`, `e2e/docs/e2e-build-goal.md` and
`.claude/skills/pr-verify/SKILL.md` for the bigname stack; (6) ask the user
before pushing `e2e/bigname-harness` / `e2e-tests-coverage` or the bigname
branch, before filing the bigname issue, and before deleting the worktree.

---

## Iteration 31 — 2026-10-09 · migration deep into and after grace (GA7, GA8); premium spec retired

**Batch:** the last migration file no config ran. `migration-premium.spec.ts`
was superseded throughout (its active case is GW3, its 45-day case predates
WEB-424 and is GA6/GA7, its 5-day renewal is the WEB-424 flow) — deleted.
GA7 and GA8 are covered by a new `migration-time.spec.ts` in its own project,
`manager-migration-time`, which depends on `manager-migration` so it always
runs last: it moves the shared clock 91 days forward per run.

**Result:** PASS GA7, GA8 · DEFECT 0 · EXEMPT 0. Verified: two clean
consecutive full `manager-migration` runs, 40/40 each (time project included).

### Ground truth (contracts-v2 `AbstractETHRegistrar.renew`, `ETHRenewerV1`)

`renew` sets the V2 expiry to `reservedExpiry + duration` and extends V1 by
the same `duration`; the migration registers with the reserved expiry. So after
renew-then-upgrade, **V2 expiry = renewed V1 expiry + PREMIGRATION_BONUS_PERIOD
exactly** — asserted at day 45 (slot RESERVED) and day 89 (slot lapsed to
AVAILABLE, renewable for 28 days more). GA7's oracle ("preserves the V1 expiry
exactly") predated WEB-424; corrected. Past day 90 `isRenewable` is false, the
name is not offered, and `isAvailable` is true (GA8).

### Environment

- The Mac rebooted overnight; the stack came back without anvil. Rebuilt as in
  iteration 29 (fresh fork, Panoptes DB wiped, re-funded).
- **`premigration.ts` probe label `hello` dropped:** on today's fork it
  disagreed with the other seven reserved labels (re-pointed on live Sepolia).
  The guard refused to guess, as designed; every V1-seeding test needed this.
- Anvil panicked again mid-verification (drpc TLS close_notify, third time in
  two days). If it keeps happening, try `SEPOLIA_FORK_URL` (the compose file
  reads it) pointed at another provider.
- A11's owner check now matches the owner link's target (`/0x…`) or the
  primary name: the manager truncates with `...`, the portal with `…`.

**In flight:** nothing.

**Next:** (1) GA1–GA3 (approval rows in the plan) and GU1–GU3 (list totality,
predicted vs actual confirmations, EOA nonce delta) — GM1 already proves
"predicted = actual" for one shape, generalise it; (2) GS1/GS2/GS6 (locked
2LD with locked/emancipated children, three levels); (3) V1 roles-tab cells.

---

## Iteration 30 — 2026-10-08 · `migration.spec.ts` adopted: unwrapped and emancipated 2LDs, records, batching, edit-after, A11

**Batch:** R0 §G migration, at the user's direction ("migration needs to be
covered first"). Rewrote the never-run `migration.spec.ts` against the
contract and the scenario oracles and added it to the migration config.

**Result:** PASS GW1, GW2, GA4, GR1, GU4, A11 · DEFECT 0 · EXEMPT 0. Terminal
397 → 403; ratchet raised.

**Verified:** two clean full `manager-migration` runs (39 tests). Run 1 39/39;
run 2 36/39 with three failures in untouched specs (two grace tests, GS3) on a
slow upstream ("The request took too long to respond" in setup, 16 min vs
12) — all three green on an immediate re-run. The six new tests passed in
both runs.

### Ground truth (contracts-v2 `UnlockedMigrationController`)

- Unwrapped: `reclaim` to the controller, then `setRecord(node, GRAVEYARD, 0,
  0)` and the ERC-721 to the Graveyard. Emancipated: resolver cleared, then
  `unwrapETH2LD(label, GRAVEYARD, GRAVEYARD)`. Both land in V2 with
  `REGISTRATION_ROLE_BITMAP` (+ `ROLE_WAS_RESERVED`). New helpers:
  `assertUnlockedTokenRoute`, `readV2TokenRoles`.
- GW2's oracle said the NameWrapper stays the ENSRegistry owner; the contract
  hands the slot to the Graveyard. Oracle corrected.
- A11's oracle quoted the contract revert, which the app never reaches:
  `/register/$name` checks availability and redirects a reserved name to its
  profile (owned by its V1 owner). Oracle reworded to that.

### Learned

- The owner's PermissionedResolver (`0xe545…7fbc` on this fork) **reverts on a
  direct `text(node, key)`**; reading through the UniversalResolver
  (`getTextRecord` / `getAddressRecord`) works. F11's comment found the
  opposite for a freshly deployed resolver — the right instrument depends on
  the resolver; not investigated further.
- Profile editing is a dialog now (`goToEditProfile` / `saveProfileChanges` in
  `helpers/profile-helpers.ts`); the old `/p/$name/edit` route is a 404 since
  #898.
- Never start a verification loop with a shell `&`: it outlived the tool call,
  raced a second loop on account 0 and the results directory, and produced a
  run that had to be thrown away.

**In flight:** nothing.

**Next:** (1) `migration-premium.spec.ts` — the last migration file no config
runs (GA7/GA8 candidates, grace day 45/89 and after grace); (2) GA1–GA3
(approval rows) and GU1–GU3 (list totality, predicted vs actual
confirmations, nonce delta); (3) V1 roles-tab cells.

---

## Iteration 29 — 2026-10-08 · portal smoke green again; roles table locator; V1 manager carried into V2 (GM1–GM4)

**Batch:** iteration 28's "Next" (0)–(3): triage the portal smoke failures,
re-run `roles.spec.ts` for real, then the roles-after-migration rows.

**Result:** PASS GM1, GM2, GM3, GM4 · E2E-009 verified (C1) · DEFECT 0 new ·
EXEMPT 0 · PRODUCT-GAP 0. Verification: portal smoke 19/19 twice, manager
smoke 8/8 twice, `migration-managers.spec.ts` green twice, `roles.spec.ts`
49/49 once. The second full roles run hit a slow upstream RPC (1.1 h instead
of ~14 min; cold reads 1–10 s): C2, C3 and `:1368` timed out there and passed
on an immediate re-run. Not two clean consecutive full runs — re-run the file
once the upstream is steady.

**Ratchet:** 392 → 396 (R0 +4 for GM1–GM4; C1 was already terminal as DEFECT
and is now PASS).

**Infra, mid-batch:** the shared anvil panicked again (exit 133, drpc TLS
close_notify — see memory note). Recovered: Panoptes DB wiped, anvil
recreated, dependents restarted, accounts re-funded. The fork is now at real
time again (2026-10-08), not 2028. `mockestrator` had been created from a
deleted worktree's mount and had to be recreated from this checkout;
`start-local-env.sh` aborts on the `metadata-service` build (npm install),
so bring the rest up with `docker compose up -d --no-build <services>`.

### What the four portal smoke failures were

All test-side or environment; no app defect.
- `roles.spec.ts:1636` (WEB-1469 "Cannot transfer") — run-order dependence:
  `ownerRow` matched only the truncated address, but the shared `user`
  account shows its primary name once any registration test sets one (it had
  `e2e-muy1v9wu.eth` on the old fork, `e2e-muzn4r6h.eth` by the end of this
  batch on the new one). Five WEB-1469 tests failed the same way after the
  smoke runs. `ownerRow` now matches the primary name or the address.
- `transfer.spec.ts:1049`, `:1171` (registry-detach consent) — `mock-indexer`
  drift: #1292 added `domains(where: { name }) { subdomainsCount }` to
  `getRegistryOccupants` and takes the count from it; the mock did not answer
  it, `domains[0]` threw, and the app showed "We couldn't check…". Mock fixed.
- `registration.spec.ts:201` (name switch) — after A's commit lands, A checks
  its USDC allowance and, if short, sends the approve during the cooldown.
  That request predated the switch but was still pending when the test
  counted prompts after it. The test now answers pending requests before the
  switch; the oracle (nothing new from A after it) is unchanged.

`roles.spec.ts`: `nameRolesSection` now matches `'parent registry / roles'`
(heading changed in #1105, 2026-08-27). 48/49 green; the WEB-1469 grace test
(`:2190`) failed only in full-file runs — the fresh ownership tab still read
"Grace ends" because Panoptes lagged the renewal. It now waits for the indexed
block after renewing.

### GM rows (`migration-managers.spec.ts`)

- GM1+GM3: opting in to keep a V1 controller adds exactly "Restore the
  managers you chose" and "Remove temporary access" (+2 requests); the wallet
  is asked exactly as often as the screen says; the manager ends with exactly
  `ROLE_SET_RESOLVER`; the HCA approval is granted then revoked. Untagged
  control: without the opt-in the manager holds nothing.
- GM2: oracle corrected — #1240 deliberately revokes any existing HCA
  operator approval on the ETHRegistry as a leftover of an interrupted run.
  With it present the opt-in costs +1 (no approve, still the revoke) and the
  approval ends revoked.
- GM4: deliberate by construction — the subgraph reports a wrapped name's
  registry owner as the NameWrapper, so `registryControllerOf` alone would
  offer the NameWrapper as a manager; `classifyUnlockedWrapper` hardcodes
  `registryController: null`. Asserted: no opt-in on the wrapped row (an
  unwrapped control in the same list has one), NameWrapper gets no role, no
  temporary approval.

**In flight:** nothing.

**Parked:** nothing. GW7 answered by the user 2026-10-08: it is a bug — filed as E2E-021 (S4), GW7 portal test restored with `test.fail`.

**Learned:**
- `getBlockNumber()` without `cacheTime: 0`, used as an inclusive `fromBlock`,
  includes the test's own setup block. Start at head + 1, uncached.
- A static PASS hid four red smoke tests and a red C* suite; run before
  trusting.

**Next:** (1) raise E2E-020/E2E-021 in Linear; (2) adopt `migration.spec.ts` (GW1, GW2, A11
and the edit-after-migration test); (3) V1 roles-tab cells (VL*) for wrapped,
emancipated and locked shapes and the grace shapes 10/11/32/33/44;
(4) re-scope F2 (it cannot reach a migrated CANNOT_TRANSFER name).

---

## Iteration 28 — 2026-10-08 · migration suite unblocked; locked-2LD fuse matrix (GW) with exact role bitmaps

**Batch:** R0 §G migration. The user's priority order: regenerate the ledger,
then grace/fuse migration (GA6, GW*), then V1 roles. The whole
`manager-migration` project was red, so the unblock came first.

**Result:** PASS GW3, GW6, GW8, GW10, GW11, GA6, B17 · DEFECT GW5, GW12
(E2E-020, S3) · EXEMPT GW9 (not constructible; signed off by sugh01) ·
PRODUCT-GAP 0. Ledger hygiene: E2E-017's 34
withdrawn matrix cells now count as PASS. Verified: two consecutive green runs
of `manager-migration` (29/29 each) and portal `@scenario:GW8`.

**Ratchet:** raised with `--update` (not raised since 2026-09-09): HW 5→8,
R0 26→112, R1 8→9, R2 27→100, R3 6→162, R4 1→1; total 73→392 of 689. Most of
that is catch-up, not this batch: this batch moved 382→392 (GW3/5/6/8/9/10/11/12,
GA6, B17), plus 34 R3 cells released by honouring E2E-017's withdrawal and five
transfer rows by verifying E2E-001/012/013/014 (F1, F33, F35, F37, F39 and
VT32 re-run green today, no `test.fail`).

**Smoke:** manager 8/8. Portal smoke 15/19 — four failures, identical on a
re-run, all in specs and helpers this batch did not touch (the code they run is
byte-identical to HEAD): `registration.spec.ts:201` (name switch, "old actor is
still alive"), `roles.spec.ts:1636` (WEB-1469 "Cannot transfer" warning),
`transfer.spec.ts:1049` and `:1171` (registry-detach consent). Not triaged.
Local `apps/portal/.env` points `VITE_API_URL` at a feature worker
(`feat-registration-gasless-permit…`) — check that before calling them app bugs.

### What was broken, and why the ledger said otherwise

The ledger is **static** evidence: a tag plus a config that runs it counts as
PASS. Every `G*` test was in fact red, for three stacked reasons:

1. **The local PostHog host is dead.** `apps/manager/.env` and `.env.local`
   (local, uncommitted) set `VITE_PUBLIC_POSTHOG_HOST=https://jakob.ens.domains`,
   which no longer resolves. `/upgrade`'s `beforeLoad` evaluates the `migration`
   flag **server-side** (`get-feature-flag.ts`); the lookup fails, `?? false`
   makes it "off", and every test is redirected to /dashboard. The committed
   value, `https://edge.ens.domains`, returns `migration: enabled` for anvil
   account 0. Run the dev servers with
   `VITE_PUBLIC_POSTHOG_HOST=https://edge.ens.domains pnpm dev` (or fix the
   local env files). Not committed: the env files are the user's.
2. **Stale selection locators.** #1229 made the root rows checkboxes;
   `rootRow`/`selectOnlyRoots` still wanted `aria-pressed` buttons. The success
   button is now "Go to dashboard". Fixed in `helpers/migration-flow.ts` and GS7.
3. **Runner clock.** GS3 seeded the child expiry from `Date.now()`; the fork is
   in 2028, so the copy reverted `CannotSetPastExpiry`. Now chain time.

Reconciler: a status cell's markdown (`**withdrawn**`, `**fixed**`) is now
stripped, and `withdrawn` no longer counts as an open defect.

### Ground truth for the GW rows (contracts-v2, `LockedWrapperReceiver` + `LockedMigrationFuseMatrix.t.sol`)

- Every migrated token also carries **`ROLE_WAS_RESERVED`** (bit 32), added by
  `PermissionedRegistry._register` for anything registered out of RESERVED.
  Not part of the fuse mapping; the oracles add it explicitly.
- Root roles on the WrapperRegistry are granted to the **.eth registry**;
  `WrapperRegistry._getRoles` lends them to the parent name's owner. That is
  why the portal offers "Create subname" on a migrated locked name.
- **CANNOT_TRANSFER** can never migrate (the NameWrapper refuses the transfer).
  `migration-fuses.spec.ts` used to assert the opposite; rewritten.
- **CANNOT_SET_RESOLVER**: the controller keeps the V1 resolver, swapping a
  `PublicResolverSet`-certified one for the V2 PublicResolver. The app refuses
  an uncertified one up front ("The upgrade contracts don't match this account").
  GW6's oracle text corrected accordingly.
- **CAN_EXTEND_EXPIRY** can never be set on a .eth 2LD
  (`test_wrappedETH2LD_neverHasCanExtendExpiry`) → GW9 EXEMPT.

**In flight:** nothing.

**Parked:**
- GW7 — product intent: the portal shows "Add user" to any admin-role holder
  (`NameRolesOverviewTable` `canManageRoles`). A CANNOT_BURN_FUSES name keeps
  only `ROLE_CAN_TRANSFER_ADMIN`, whose grantable counterpart (bit 28) is no
  defined role. Should the portal hide role management? The bitmap half is
  asserted (untagged) in `migration-fuses.spec.ts`. Owner: sugh01. Expires
  2026-10-15.

**Environment finding (not an app defect):** Sepolia's `PublicResolverSet`
(`0x5B2b…14F2`) does not certify `0x8FADE66B…` — ensjs's `ensPublicResolver`,
which most Sepolia names use. Every locked name with CANNOT_SET_RESOLVER on that
resolver is refused with "contact support". `0xE99638b4…` is certified. Worth
raising with contracts.

**Learned:**
- `roles.spec.ts`'s `nameRolesSection` (line ~118) still matches
  `'parent registry roles'`; the heading has been `'parent registry / roles'`
  since #1105 (2026-08-27). Every C* test built on it is likely red while the
  static ledger says PASS. **Next batch should run `roles.spec.ts` for real.**
- F2 (`transfer.spec.ts`) seeds `makeMigratedName({ fuses: CANNOT_TRANSFER })`,
  which cannot migrate; its role assertion passes only because no V2 token
  exists. It is testing a V1 locked name. Re-scope it.
- The static ledger hid a fully red migration project. Before trusting a row,
  run it; consider `pnpm e2e:coverage --results <json>` in CI.

**Next:** (0) triage the four portal smoke failures above; (1) run
`roles.spec.ts` and fix `nameRolesSection`; (2) answer
GW7; (3) GM1/GM3/GM4 (roles after migration) — the `readLockedMigrationRoles`
helper added here is the oracle; (4) adopt `migration.spec.ts` (GW1, GW2, A11).

---

## Iteration 27 — 2026-08-31 · E2E-004 withdrawn — the real fix was the local indexer mock, not an app bug

**Batch:** correction to iteration 26. The user flagged from memory that
migration testing had needed the indexer mocked before, and asked for a
proper check rather than taking the filed defect at face value. That check
overturned it.

**Result:** E2E-004 withdrawn (see `docs/e2e-defects.md`). The real fix:
`e2e/.env` (local, untracked-until-now) had `E2E_MOCK_INDEXER=false` while
`.env.ci` has it `true`. `UpgradeBanner.tsx`'s `useMigratedNamesCount` queries
the local Panoptes indexer directly (`getMigratedNamesCount`, separate from
the V1 subgraph `mockV1Subgraph` already handled) and also gates the banner's
render — with the real, locally-drift-prone Panoptes hit instead of the mock,
that gate never settled reliably. Fixed `e2e/.env`'s `E2E_MOCK_INDEXER` to
`true` (matching CI); the "Upgrade Names" button was then visible in **8
consecutive runs, zero failures**, each completing in ~32s (versus 5-6 minutes
of timeouts before). One more real bug found and fixed along the way:
`searchAndNavigateToProfile`'s `page.waitForURL` never resolved even once the
target page had visibly, correctly rendered (confirmed via a screenshot taken
at the "timeout" — the profile heading was already on screen) — swapped for
asserting on the rendered heading directly, which is both more robust and a
better oracle.

**Ratchet unchanged: total 54.** `migration.spec.ts` stays excluded from the
run config: with these fixes, the first test ("migrate an unwrapped V1 name")
is now fully verified (8+ consecutive green runs, well past the two-run bar),
but running the full file surfaced two more distinct issues in the other six
tests that are NOT yet fixed:
- **"V1 records are preserved after migration"** fails with a bare
  `ExecutionRevertedError` — this matches the already-documented,
  already-known gap from iteration 23 (`makeV1Name.ts`'s header): `setV1Records`
  writes through `V1_PUBLIC_RESOLVER`, whose own authorization is hardcoded to
  the pre-repoint fixture registry. Not new; not fixed here; already tracked.
- **"pre-registered V1 name is not available for new registration" (A11)**
  and **"can edit profile after migration"** both fail on stale
  locators/assertions (`toBeVisible`/`not.toBeVisible` mismatches, an
  `element(s) not found`) — genuinely new findings, not yet investigated.
  Same class of problem iteration 24 found three of in the shared
  `runMigrationFlow` helper, just in code paths that helper doesn't cover.

**In flight: nothing broken** — the two landed fixes (`e2e/.env`,
`searchAndNavigateToProfile`) are real, verified, and safe: spot-checked with
a full `profile.spec.ts` run afterward (15 passed, 2 failed on pre-existing,
unrelated calendar/transaction-timeout issues already on record from earlier
in this session, 2 skipped) to confirm the indexer-mock flip doesn't regress
anything else. `E2E_MOCK_INDEXER=true` already governs CI for the whole
suite, so this local change is bringing local dev in line with CI, not
introducing new behavior.

**Lesson for next time:** the render-level instrumentation in iteration 26
was real, correctly executed, and still pointed at the wrong layer — it
proved the *symptom* (a query that doesn't settle) but not which query was
actually responsible, because the eligibility hook and the migrated-count
hook are siblings feeding the same banner. When a render-level trace confirms
oscillation, check every data dependency of the component making the
render decision, not just the one hook already under suspicion.

**Next:** investigate and fix the A11 and edit-profile stale-locator
failures (same audit `runMigrationFlow`'s fixes already covered for the other
five tests), then the file can be fully re-enabled and `G*` rows tagged —
GW1 (unwrapped) is ready to tag the moment the file itself is turned back on,
since that specific test is the one already fully verified.

---

## Iteration 26 — 2026-08-31 · root cause confirmed and filed as E2E-004: an app-side query-stability bug, not test or infra

**Batch:** continuation of the "Upgrade Names" investigation (iterations
24-25). This closes it out: a real root cause, filed as a defect, not another
ruled-out guess.

**Result:** PASS 0 new scenarios. **Ratchet unchanged: total 54.** Defect
E2E-004 filed (`docs/e2e-defects.md`). `migration.spec.ts` stays excluded from
the run config — an app bug that makes a query never settle cannot be made to
pass reliably by any test-side change, so per rule 6 nothing here can be
marked terminal yet.

**In flight: nothing.** All diagnostic instrumentation (in both the app hook
and the test) was reverted; only a comment pointing at E2E-004 remains in
`migration.spec.ts`.

### Confirmed: `useEligibleV1Names`'s eligibility query never settles

Per iteration 25's own "next concrete step," added temporary render-level
`console.log` instrumentation directly to
`apps/manager/src/features/migration/hooks/useEligibleV1Names.ts` (gated
behind a `window.__MIG_DIAG__` flag set only from the test via
`page.addInitScript`, so it only ever ran in this diagnostic session) and
captured a full render timeline from a failing run.

The evidence: `classifiedLen` correctly reaches `1` (the mocked V1 name is
classified fine), but `isEligibilityPending` was logged `true` on **every
single one of 56 consecutive renders** captured before the test's 30s timeout
— never once `false` — while the derived `eligibleLen` flickered `0 → 1 → 0 →
1` in between. That combination (a query whose own `isPending` never resolves
to `false`, yet whose data visibly changes) is consistent with
`useMigrationEligibility`'s query key — built from `names.map(n =>
n.domain.id)`, recomputed inline on every render — being unstable enough to
keep restarting the query before it can settle. The UI's decision to show or
hide the "Upgrade Names" banner ends up sampling whichever phase of that
oscillation happens to be current at render time — which is exactly why the
same test, unchanged, passes about half the time and fails the other half; it
was never really about environment, infra, or timing at all.

Filed as **E2E-004** (S2 — core flow blocked, no workaround, but not S1: no
funds or state are at risk, the user just can't reliably start a migration).
Not chased further into the exact key-hashing mechanism inside
`useMigrationEligibility`/`qk(...)` — that's an app-side React Query
debugging session, not something the e2e harness can resolve, and rule 5
("never fix the app") applies squarely here.

**Next:** this specific blocker is now fully diagnosed and handed off — no
further investigation needed from here unless the app team wants repro help.
Move on to the rest of the B4 audit iteration 24 already scoped (the
records-preservation, batch, and edit-after tests in `migration.spec.ts` still
need the same three UI-copy/authorization fixes iteration 24 made to the
first test), and re-attempt tagging `G*` rows once E2E-004 is fixed and
verified — GW1 (unwrapped) is otherwise ready to tag today, blocked only on
E2E-004 itself, since the harness fixture and mock are both confirmed correct.

---

## Iteration 25 — 2026-08-31 · two more "Upgrade Names" hypotheses tested and ruled out; root cause still open

**Batch:** continuation of iteration 24's investigation into the intermittent
"Upgrade Names" dashboard button. No new scenarios attempted; this is pure
root-cause work on the standing blocker for the whole `G*` matrix.

**Result:** PASS 0. **Ratchet unchanged: total 54.** Two more hypotheses
tested, both ruled out. `migration.spec.ts` unchanged in the run config
(still excluded); one small comment update in the file to reflect the two
new ruled-out leads.

**In flight: nothing.** No code changes landed this iteration beyond the
comment — everything tested was reverted.

### Hypothesis: EnableSessions smart-session gate — ruled out

Traced the app's own Rhinestone/HCA machinery
(`MigrationPage.tsx` → `useEligibleV1Names` → `useSmartAccountContext()`'s
`ownerAddress`) and found `registration-rhinestone.spec.ts` documents a
one-time "Enable Sessions" authorization modal that can take 30-60s to appear
on a fresh HCA, gated on `smartAccount.isAccountReady`
(`manager-auth.ts`'s `clickThroughEnableSessions`). Reasoned this could
explain the intermittent failure: an earlier, long-lived part of this same
session may have already granted that on-chain session before the mid-session
`infra:down`/`up` + volume wipe (iteration 24) wiped it, so later isolated
reruns would hit the gate for the first time — and migration.spec.ts never
calls the click-through helper at all.

Added `clickThroughEnableSessions(page)` right after navigating to
`/dashboard`, with diagnostic logging. Result: **the button was never
present (count 0) at the point of the failure** — the modal genuinely does
not appear on this path. Reverted the addition (kept the file's comment
noting this is ruled out, since it was a reasonable and specific enough
theory that it's worth recording so nobody retries it identically).

### Also directly confirmed: `useEligibleV1Names`'s owner resolution is not the naive mismatch

Read `useEligibleV1Names.ts`: `resolvedOwnerAddress = ownerAddress ?? address`,
where `ownerAddress` comes from `useSmartAccountContext()`. Browser console
capture (iteration 24's network trace) showed balance-fetching logged against
the raw EOA (`0xf39Fd6…`), not a separate smart-account owner key, in this
headless/mock-wallet setup — consistent with the user's correction that
Rhinestone is the right path and not itself the problem. This doesn't
contradict iteration 24's ruling; it just confirms there's no simple
address-string mismatch to find here — whatever's intermittent is in timing
or state, not in which address gets compared.

**Root cause found in iteration 26** (see above) — was open at the time this
section was written.

---

## Iteration 24 — 2026-08-30 · migration.spec.ts audited (B4 bootstrap step): three real bugs fixed, one env hypothesis raised and ruled out

**Batch:** with the V1 repoint landed (iteration 23), attempted to run the
59-row `G*` migration matrix. `projects/manager/tests/migration.spec.ts`
already exists (7 tests, unwrapped/wrapped/locked/batch/records/edit) but is
excluded from every playwright config via
`testIgnore: /temporaryPremium|migration|notification/` — the comment there
cites exactly the `makeV1Name` fault iteration 23 fixed. This iteration is the
goal's own §6 B4 bootstrap step ("Audit the inherited specs") applied to this
file, done before any new `G*` tags are written.

**Result:** PASS 0 new scenarios, 3 real test bugs found and fixed, 1
intermittent failure still open (one hypothesis tested and explicitly ruled
out by the user — see below). **Ratchet unchanged: total 54.**
`migration.spec.ts` stays excluded from the run config — it is not yet
reliably green, so nothing here is tagged.

**In flight: nothing landed as broken.** The fixes below are real and kept;
the file's exclusion is unchanged pending the escalation.

### Three real, confirmed bugs fixed

1. **Stale subgraph mock URL** (`helpers/mock-v1-subgraph.ts`). The mock
   intercepted `https://ensnode-api-sepolia-staging-v1.up.railway.app/subgraph`
   — a retired staging host. The app's actual client
   (`apps/manager/src/features/migration/service/v1SubgraphClient.ts:7`) has
   long since moved to `https://v1-graphql.ens.dev/subgraph`. `page.route()`
   silently no-ops on a non-matching pattern (no error), so every
   migration.spec.ts test was hanging on a plain, unmocked timeout rather than
   failing loudly on the mismatch — this alone likely explains why the file
   was never revisited after being excluded. Fixed: URL updated, and a comment
   added warning that this string must track the app's client by hand.
2. **Two stale UI-copy selectors** (`migration.spec.ts`'s `runMigrationFlow`).
   The confirm button's label changed from a static "Upgrade Names" to a
   dynamic "Upgrade N name(s)"; the success screen's copy changed from "You're
   on ENS v2!" / "Done" to a "Your name(s) have been upgraded!" dialog with an
   "Open Dashboard" button. Both updated to match current copy (the second
   with a case-insensitive singular/plural regex).
3. **Single-authorization assumption** (same function). The confirm screen
   itself states how many wallet confirmations to expect (e.g. "Expected: 2
   wallet confirmations"), but the test authorized exactly one
   `eth_sendTransaction` and then waited on the success screen — hanging
   forever at "2/2" once the real flow needed a second confirmation. Fixed by
   switching to `authorizeTransactionsWhile` (already used elsewhere in this
   suite for exactly this shape of problem), polling and authorizing whatever
   arrives until the success heading appears.

With all three fixed, the full flow (register V1 name → mock subgraph →
dashboard → confirm → authorize → success dialog) **completed for real, once**
— confirmed by the "Your name has been upgraded!" screenshot, not asserted
from a hunch.

### Blocker found: the dashboard's own "Upgrade Names" button is intermittent, not yet root-caused

Across repeated single-test reruns (same test, same code, no other change),
the very first assertion — the dashboard's "Upgrade Names" button becoming
visible — passed 3 times then failed 3 times in a row, including after:

- a full `infra:down`/`infra:up` cycle (ruled out: fresh anvil, same result)
- additionally wiping the `infra_panoptes-data` / `infra_dqa-data` Docker
  volumes and letting the indexer fully resync to chain tip (ruled out:
  confirmed via `docker logs` — indexer reached 100%, and separately confirmed
  via browser network capture that the mocked subgraph response is correct and
  contains our freshly-registered name every time, mocked or not)
- bumping the wait timeout 10s → 30s (helped once, for an unrelated reason —
  see below — but did not fix the recurring failure)

**Hypothesis raised and ruled out this iteration:** suspected
`apps/manager/.env.local`'s `VITE_FF_USE_EOA=false` — migration's on-chain
eligibility check (`packages/migration/src/service/preflightChecks.ts`'s
`checkOwnership`) compares the V1 name's real on-chain owner against a
`migrationOwner` address that might resolve to the smart-account address
rather than the raw EOA `makeV1Name` registers to, matching project memory
(`manager-local-mock-wallet-use-eoa.md`) and iteration 17's A1 finding. Tested
directly: flipped the flag to `true`, restarted the dev server — **explicit
ruling from the user: this is wrong, `VITE_FF_USE_EOA` must stay `false` and
migration must be tested through Rhinestone, not EOA.** Reverted immediately
(the flag lives only in a gitignored `.env.local`, so nothing landed). Do
**not** revisit this flag as a fix for migration flakiness — if the
smart-account owner really is the mismatch, the fix has to be on the
eligibility-check/fixture side (e.g. `makeV1Name` registering to the
smart-account address, or `checkOwnership` resolving the right address for a
V1-sourced name), never a global env flip.

**Root cause of the intermittent "Upgrade Names" button still open.** Ruled
out: subgraph mock correctness (network-captured, confirmed correct every
run), infra/indexer staleness (full reset + volume wipe, no change),
`VITE_FF_USE_EOA` (see above). Not yet tried: tracing
`useMigrationEligibility`/`checkOwnership`'s actual `migrationOwner` argument
under Rhinestone (unchanged, correct config) across a passing vs. a failing
run, to see what actually differs — this is the next concrete step, not
another environment guess.

**Next:** trace `checkOwnership`'s `migrationOwner` value across a
passing/failing run pair under the correct (unchanged) Rhinestone config,
then finish the B4 audit (records-preservation test, batch test, edit-after
test still need the same three fixes applied and re-verification), then tag
and land the `G*` rows this file actually covers (candidates: GW1 unwrapped,
GW2/GW3 wrapped/locked, GS-something for batch, GU4 for post-migration edit —
per the file's own existing comment, GU4 needs a chain-read oracle upgrade
first, its toast-only assertion is the lowest oracle rank).

---

## Iteration 23 — 2026-08-30 · V1 repoint landed (all four constants, per the iteration-14 ruling), two real bugs found and fixed

**Batch:** unblock, not a scenario batch — repoint `makeV1Name`'s V1 controller,
base registrar, name wrapper, and registry constants from the fixture-only
deployment to the canonical one the apps actually read (ensjs's
`ensEthRegistrarController` / `ensBaseRegistrarImplementation` / `ensNameWrapper`
/ `ensLegacyRegistry`), all at once per the user's explicit ruling on iteration
14's blocked question. This is the standing blocker on all 59 `G*` migration
scenarios (§5.G), so per the goal's own exception rule an unblock here outranks
a normal in-tier batch.

**Result:** PASS 0 new scenarios — this batch is fixture/harness work, not
scenario coverage. **Ratchet unchanged: R0 14 · R1 8 · R2 26 · R3 1 · R4 0,
total 54.** What changed is that the 59 `G*` rows are now reachable through a
fixture that writes to the registrar the migration UI reads, which they were
not before.

**In flight: nothing.** Harness gate (`specs/harness-manager.spec.ts`) verified
green over 17+ consecutive runs after the fixes below (previously failing
1-in-3 to 1-in-4 runs).

### What changed

- `v1-controller-auth.ts` / `makeV1Name.ts`: `V1_ETH_REGISTRAR_CONTROLLER`,
  `V1_BASE_REGISTRAR`, `V1_NAME_WRAPPER`, `V1_ENS_REGISTRY` now import the
  `APP_V1_*` constants directly — single source, not a second copy of the same
  literals. `V1_PUBLIC_RESOLVER` is unchanged (see known gap below).
- `harness-manager.spec.ts`: removed the `test.fail()` annotation from rule 6
  (it now passes for real instead of via the documented "expected fail"), and
  replaced the now-structurally-false "two different registrars" test with a
  regression guard asserting `makeV1Name` and the app agree on the same V1
  registrar.
- `check-address-literals.ts`: dropped the four stale allowlist entries for the
  old fixture-only addresses (now imported, not literal); kept only the
  `V1_PUBLIC_RESOLVER` entry.

### Two real bugs found while landing this, not pre-existing flakiness

Wiring `ensureV1ControllersAuthorised()` into `makeV1Name` was the first time
anything besides its own dedicated harness test called it from outside a
single, isolated snapshot/revert — and that surfaced two bugs the isolated
test never could:

1. **Stale process-lifetime memoization** (`v1-controller-auth.ts`). The
   function cached a resolved promise after its first successful grant
   (`done ??= (async () => {...})()`). Every caller here wraps itself in
   `evm_snapshot`/`evm_revert` (rule 5/6 tests, and now every `makeV1Name`
   call), and a revert undoes the on-chain grant — but the JS-level cache kept
   reporting "already done," so the *next* call skipped re-checking entirely
   and `register()` died in `onlyController` with a data-less revert. Fixed by
   re-reading chain state (`controllers(candidate)`) on every call instead of
   trusting a permanent cache; `inFlight` now only collapses concurrent
   callers onto one pass, it does not mean "done forever."
2. **Gas-estimation undershoot on `register()`** (`makeV1Name.ts`). Even after
   fix #1, the harness gate still failed intermittently (~1-in-4 to 1-in-5
   runs) with the exact same symptom: a data-less `register()` revert. Added
   temporary `debug_traceTransaction` instrumentation and caught it live — the
   trace showed `"error": "out of gas"`, tx gas limit ~166k (from
   `eth_estimateGas`) against real usage north of 190k. `register()`'s cost is
   state-dependent — nested `STATICCALL`s into the price oracle for premium
   computation — so viem's auto-estimate isn't stable run to run. Fixed with
   an explicit `gas: 500_000n` on the register transaction. Confirmed: 17+
   consecutive green runs after this fix, versus 5 failures in the first 15
   runs with only fix #1 applied.

Both fixes are now permanent (not one-off probe fixes on a live fork) since
they live in the fixture and auth helper, not in a throwaway script.

### Known gap, not fixed here

`V1_PUBLIC_RESOLVER` writes (`setV1Records`, `GR*` scenarios only) go through
the resolver as the node's owner, and that resolver's own authorisation is
hardcoded to the *old* fixture registry (Etherscan-verified, iteration 15) — a
node registered in the new canonical registry has no ownership record in the
resolver's own internal state, so those specific writes will revert
post-repoint. This affects only the `GR*` subset; the other ~47 of the 59 `G*`
rows (registration and migration) do not go through this path. Documented in
`makeV1Name.ts`'s header; not addressed this iteration — needs its own probe.

**Next:** run the `G*` migration specs (59 rows) against the now-repointed
fixture — this is the actual scenario batch the last several iterations have
been building toward. Expect the `GR*` subset (resolver writes) to need the
follow-up above.

---

## Iteration 22 — 2026-08-30 · B12 probed and reverted; no landing this time

**Batch:** R1 continued — attempted B12 (renew with insufficient balance).

**Result:** PASS 0. **Ratchet unchanged at R1 8, total 54.** Nothing landed
this iteration; the attempted test was written, found to test the wrong
thing, and cleanly removed rather than committed half-working. Repo is at the
same state as the end of iteration 21, plus this note.

**In flight: nothing.**

### B12 — genuinely harder than it looks, not a quick add

Traced the mechanism fully: renewal's payment step
(`features/renew/workflow/pricing/components/TokenPickerContent.tsx`)
delegates to the same `TokenPickerContentBase` registration uses, and
`TokenListItem.tsx` *does* render real "insufficient" copy — red balance
text, an explicit "Need $X.XX" line, a `disabled` button — so the oracle
("blocked with the right copy") is answerable in principle.

Two ways to reach that state, both dead ends here:

1. **Drive the price up instead of the balance down** (to avoid touching a
   shared, persistent-state funded account). Tried it: the renewal calendar
   caps at `minSelectableDate + 365×100 days` (`RenewToDatePopover.tsx`), and
   even at that ~100-year maximum the quoted price was **$449.55** — nowhere
   near the funded account's ~$10,000 USDC. Confirmed by screenshot, not
   assumption. This path cannot reach insufficiency at all through the UI.
2. **Reduce the balance instead.** The connected user's *displayed* balance
   is the HCA's (`useSmartAccountContext().stablecoinBalances`), and only one
   HCA is funded by the infra scripts (the one derived from the default
   `user` EOA). Draining it (even temporarily, restored in a `finally`) risks
   leaving every *other* test in this long session underfunded if the
   process dies before the restore runs — real risk, not hypothetical, given
   how many balance-dependent tests this session has already run.
   Connecting as a different named account (`user2`/`user3`/`user4`) would
   sidestep this cleanly — untouched account, untouched HCA, genuinely
   unfunded — but the manager fixture has no account-switching helper
   (checked `playwright.manager.fixture.ts` and `helpers/manager-auth.ts` —
   nothing like the portal's `wallets.switchTo`). Building one wasn't a
   same-iteration-sized job.

Not blocked-env — the UI feature genuinely exists and could be tested with
either a manager-side account-switch helper or a careful temporary-drain
helper with a hard `finally`. Just bigger than this batch. Test written,
verified it exercised the wrong thing (screenshot confirms $449.55 total,
"Save $349.65" — comfortably affordable), then removed rather than kept
half-working or weakened to pass.

### Also checked — B18's remaining entry points need their own probe

B18 wants "profile, dashboard row, address page, deep link" all producing
the same on-chain expiry. Profile and deep-link are already exercised (B1,
B3/B5/B11). Dashboard: `routes/dashboard.tsx` has no direct "Renew" text —
it's a thin wrapper over a feature component not yet located. A
`RenewNameButton.tsx` component exists (`features/renew/components/`) but a
repo grep found no importer of it outside its own file and locale strings —
worth checking whether it's actually wired up anywhere before assuming
dashboard-row renewal is reachable at all. Not investigated further this
iteration.

### Next

B18's dashboard-row and address-page entry points (start by finding
`RenewNameButton`'s actual call site, if any — it may be dead code, which
would itself be worth knowing). B6 (grace banner — check the wall-clock
blocker from iterations 19–20 first). B13 (portal-side, unexplored this
session). A5's price-arithmetic half (iteration 18), the A3–A9/A17–A20
EOA-blocker probe (iteration 17), and the `register()` intermittent-revert
root cause (iteration 21) are all still open.

---

## Iteration 21 — 2026-08-30 · B11 landed, and the recurring harness flake is now diagnosed

**Batch:** R1 continued — B11 (renew deep link: connected, disconnected,
unregistered).

**Result:** PASS 1 (B11, all three cases). **Ratchet unchanged at R1 8, total
54** — B11 was already counted terminal from a shared-tag test added
mid-batch; the two new tests corroborate it, not increment it. Verified: all
three cases green together, twice.

**In flight: nothing.**

### Landed

- **B11** — three tests, all `@scenario:B11`, one case each:
  - *Connected*: the existing B5 test already reaches an active name entirely
    via the `/renew/$name` deep link while connected — just needed the second
    tag, not a new test.
  - *Unregistered*: `apps/manager/src/routes/renew/$name.tsx`'s loader
    throws when `profileExpiryQuery` reports no v2 protocol (exactly what a
    never-registered name reports), and the route's own `errorComponent`
    (`RenewalRouteError`) renders a real, informative page — "This name
    can't be renewed here" + Back-to-profile / Try-again — not a stack trace.
    New test locks that in.
  - *Disconnected*: the loader doesn't gate on wallet connection at all — a
    disconnected visitor reaches the same page a connected one would, with
    the connect affordance surfacing where payment normally goes (same
    `isConnected` mechanism the registration flow's token picker uses). New
    test confirms the page renders correctly rather than erroring.

  Wrote all three before tagging any of them `@scenario:B11`: the "all tests
  sharing a tag must pass" semantic (iteration 11) protects against a tagged
  test failing, but says nothing about a REQUIRED case never being written at
  all — tagging after only 2 of 3 would have read as done while a case sat
  silently unverified.

### FIXED — the recurring harness flake (iterations 18–20), root-caused

Four prior data points all showed the same shape: `makeV1Name`'s rule-5/6
harness check failing with a confusing "registrar doesn't own this name"
message, always clean on an immediate isolated re-run, and (once I started
looking) always paired with `reserveInV2 ... (expiry=0)` in the log —
distinct from a healthy run's real Unix timestamp.

Root cause: `makeV1Name.ts`'s `waitForTx` awaited
`publicClient.waitForTransactionReceipt` and discarded the result without
checking `receipt.status`. viem resolves that call identically for a
reverted and a successful transaction — it does not throw on revert. So when
`register()`'s transaction reverted (confirmed — see below), the fixture
sailed on as if it had succeeded, read `nameExpires` straight after (correctly
getting 0, since nothing was ever registered), and only the harness
assertion several steps downstream ever noticed, with a message describing
the *symptom* rather than the revert itself.

**Fixed**: `waitForTx` now checks `receipt.status` and throws immediately,
naming the reverted tx hash, if it isn't `'success'`. All 8 of the file's
existing call sites already discarded the return value, so this was a
zero-risk change. Verified twice: it reproduced *immediately* on the very
next run after the fix landed — this time as a clean, instant "[makeV1Name]
transaction 0x52f4… reverted" at the real call site
(`makeV1Name.ts:416`, the `register` call), confirmed genuine (not a stale
RPC read) since a plain re-run afterward succeeded normally.

**Not fixed — still open**: *why* `register()` reverts intermittently.
Candidates not chased: a nonce race against `ensureV1ControllersAuthorised`'s
own grant transactions, or contention on the shared owner EOA under this
session's unusually high volume of back-to-back V1 registrations. Whoever
picks this up next has a reproducible, immediate repro path now (keep
re-running `harness-manager.spec.ts` — it surfaced roughly 1 time in 6 runs
this session) instead of a confusing downstream symptom to work backward
from.

### Next

B6 (grace banner) — check the wall-clock-vs-fork blocker from iterations
19–20 before attempting; it likely inherits B4's exact problem, not a drift
one. B12 (insufficient balance), B13 (portal-side, unexplored this session),
B18 (multi-entry-point) remain open. A5's price-arithmetic half (iteration
18), the A3–A9/A17–A20 EOA-blocker probe (iteration 17), and the actual
`register()` intermittent-revert root cause above are all still undone.

---

## Iteration 20 — 2026-08-30 · B5 landed; correcting iteration 19's B4 diagnosis

**Batch:** R1 continued — infra was reset before this iteration (owner
requested it, following iteration 19's drift finding), then B5.

**Result:** PASS 1 (B5). **Ratchet: R1 6 → 7, total 52 → 53.** Verified on
two consecutive green runs.

**In flight: nothing.**

### Infra reset — clean

`pnpm e2e:infra:down` + `pnpm e2e:infra:up`. Fresh fork's clock measured
~0.08 real-days ahead of wall-clock (i.e., negligible — just RPC/setup
latency), down from iteration 19's ~171 days. Manager harness gate re-verified
green immediately after (rule 6's `test.fail()` still correctly red, same as
every prior iteration).

### CORRECTION to iteration 19 — B4 is not a drift problem, and a reset does
### not fix it

Attempted B4 again on the fresh fork, reasoning the reset would resolve it.
It didn't, and re-deriving why turned up a sharper, permanent diagnosis than
last iteration's:

`fixtures/makeV2Name.ts`'s negative-`duration` path always registers for
exactly `MIN_REGISTRATION_DURATION` (28 days — genuinely the V2 registrar's
contract-enforced floor, confirmed by the fixture's own comment, not a
fixture convenience default) from **the fork's current time**, then advances
the fork's clock past the resulting expiry. That advance is chain-only. The
manager's `isPastGracePeriod` reads `new Date()` — the real wall clock, with
no override. So a freshly-registered name's stored expiry is always
`(fork's now) + 28 days`, and on a fork whose clock tracks real time (as it
now does, and as it always will immediately after a reset), that is always
**28 real days in the future** relative to whoever is running the test. No
`duration` value closes that gap — the fixture cannot register a name with a
shorter real-world duration, because the registrar won't accept one. Iteration
19's framing ("the drift will keep growing, a reset would help") was wrong in
the specific way that matters: **a reset doesn't help either**, because the
mechanism was never about drift specifically — drift only ever made the
already-impossible gap bigger. This needs `apps/manager` to gain its own
`VITE_TIME_TRAVEL`-equivalent (matching the portal) before B4 — or B6, or
anything else keyed off "is this expired *right now*" — can be tested at all.
Still **blocked-env, owner sugh01**; pushing the same expiry to iteration
19's original 2026-09-06, since the actual fix (app work) hasn't started.

### Landed

- **B5** (renewal calendar never offers a date before current expiry) —
  new test against `RenewToDatePopover.tsx` (shared by bulk and single-name
  renewal). Two wrong turns worth recording so the next person doesn't repeat
  them:
  1. The "previous month" nav button is **not** disabled at the boundary —
     the calendar opens on the pre-selected duration (default "1 year"), not
     its own minimum, so plenty of legitimate back-navigation exists before
     hitting the real limit. Clicking it in a loop is also unstable:
     `captionLayout="dropdown"`'s invisible overlay `<select>` starts
     intercepting the button's pointer events after a few clicks. Fixed by
     driving the caption's month/year `<select>`s directly instead.
  2. Disabled days use a real HTML `disabled` attribute, not `aria-disabled`
     — the Tailwind class `aria-disabled:opacity-50` in `calendar.tsx` is a
     styling hook that also fires off the native attribute, not evidence of
     which attribute is actually set. `toBeDisabled()`, not
     `toHaveAttribute('aria-disabled', 'true')`.

  Final oracle: ask the calendar for *today's* month (a date the fixture
  never even attempts to reach) via the selects; `startMonth=
  {minSelectableDate}` clamps the request forward to the earliest reachable
  month instead of erroring, and that month's first day cell is still
  disabled — proof the boundary holds however the calendar is driven, not
  just under the one navigation path already tried.

### Learned — do not re-derive

- **The harness flake from iterations 18–19 recurred twice more** this
  iteration (`makeV1Name` rule 5, then rule 6), both times clean on an
  isolated re-run. One new detail worth keeping: a failing run's log showed
  `reserveInV2 ... (expiry=0)` where every passing run shows a real Unix
  timestamp. Whatever the intermittent fault is, this is the first concrete
  signal pointing at *where* — the V1 registration or the read immediately
  after it, not the reservation step itself. Still not chased (four data
  points now, all transient), but worth giving to whoever eventually does.

### Next

B6 (grace banner) — check the same wall-clock-vs-fork blocker before
attempting it; it likely inherits B4's exact problem. B11 (renew deep link),
B12 (insufficient balance), B13 (portal-side, subname renew role gate — a
different app, unexplored this session), B18 (multi-entry-point) remain open.
A5's price-arithmetic half (iteration 18) and the A3–A9/A17–A20 EOA-blocker
probe (iteration 17) are both still undone.

---

## Iteration 19 — 2026-08-30 · B3 landed, B4 genuinely can't be built right now

**Batch:** R1 continued — B3 and B4, the two grace-period renewal scenarios
flagged as "next" last iteration.

**Result:** PASS 1 (B3, both day-1 and day-27 cases) · blocked-env 1 (B4, new
— see below). **Ratchet: R1 5 → 6, total 51 → 52.** Verified on two
consecutive full green runs.

**In flight: nothing.**

### Landed

- **B3** (grace-period renewal extends from the name's *stored* expiry, not
  "now") — new test, not an untagged find this time. Entered via
  `/renew/$name` directly rather than the profile page: `/p/$name` renders
  "doesn't exist" for a grace-period name (it isn't built to show one), while
  `apps/manager/src/routes/renew/$name.tsx`'s loader reads expiry straight
  from chain and is grace-aware by design. Same before/after `getExpiry`
  delta oracle as B1, run at day 1 and day 27 of the 28-day V2 grace window
  (`V2_GRACE_PERIOD_DAYS`, `apps/manager/src/features/grace/utils/
  gracePeriod.ts`) — both landed on exactly +28 days from the *original*
  expiry, which is what rules out a "based on now" bug (that would have
  inflated the delta by however many grace-days had already elapsed).

### NEW BLOCKER — B4 needs the fork's clock and the manager's wall clock to
### agree, and this session has pushed them ~171+ days apart

B4 ("extend after grace" → the `/renew/$name` route should redirect to
`/register/$name`) failed twice, and the second failure ruled out "just needs
a bigger gap": `apps/manager/src/features/grace/utils/gracePeriod.ts`'s
`isPastGracePeriod` compares against the manager's own `new Date()` — real
wall-clock time, always, since (checked) the manager has no
`VITE_TIME_TRAVEL` clock sync in any of its env files, unlike the portal.
`fixtures/makeV2Name.ts` computes a negative-duration name's stored expiry as
**`(the fork's current block timestamp) + 28 days`, always** — the "gap"
parameter only advances the fork's clock further past that same fixed expiry;
it does not and cannot push the expiry itself earlier. So the stored expiry
is only ever "days past grace" **from the fork's own frame** — from the
manager's wall-clock frame, it is `(fork_now − real_now) + 28` days in the
*future*, and grows every time any test in the suite advances fork time.

Measured mid-session: fork was ~171 real-days ahead of the wall clock, and
climbing. No `duration` value fixes this — I tried, computing the gap from
both clocks (drift + registration + grace + buffer ≈ 241 days) and it still
produced an expiry ~200 days in the manager's future, because the arithmetic
above shows the fixture's expiry is drift-independent by construction. This
is a real, structural mismatch between two pieces of infrastructure, not a
test bug — recorded as **blocked-env, owner sugh01, expires 2026-09-06**.
Fixes are either the manager adopting portal's `VITE_TIME_TRAVEL` clock sync,
or resetting the fork so the two clocks start close together again (which a
long enough session — like this one — will always eventually undo).

**Likely affects more than B4.** Anything on the manager side that computes
"is X true right now" from a stored on-chain timestamp — B6 (grace banner),
the temp-premium display tests already flagged as `describe.skip`-ed in
iteration 18 — inherits the same risk once fork drift is large enough. Not
individually confirmed; a pattern to watch, not a closure.

### Learned — do not re-derive

- **A second instance of iteration 18's title-matching bug, different root
  cause.** `coverage/reconcile.ts`'s `scanSpec` reads titles as static source
  text — a `test()` call inside a `for` loop with a template-literal title
  (`` `extends... day ${daysSinceExpiry}` ``) never matches either concrete
  title Playwright actually runs, and both instances silently reported
  `excluded` rather than `PASS`. Different mechanism from the apostrophe bug
  (that one truncated a string; this one never resolves an interpolation at
  all), same symptom (a coverage-count mismatch, not a visible error) and
  same fix shape: write parameterised cases as separate literal `test()`
  calls with a shared helper function, never a loop over the title itself.
- **A harness gate flake recurred** (`makeV1Name: rule 5`, then later
  `rule 5` again in a different run) — passed clean both times on an isolated
  re-run immediately after. Still not reproducible, still not chased; two
  data points now instead of one, both transient. Confirmed it is *not* the
  clock-drift finding above — the isolated re-run passed at a point where
  drift was, if anything, larger than at the original failure.
- The profile page (`/p/$name`) and the direct renewal route (`/renew/$name`)
  are **not interchangeable entry points** for a grace-period name — only the
  latter is grace-aware. Worth remembering before assuming "click Renew from
  the profile" generalizes to every renewal scenario.

### Next

B4 is genuinely blocked until the ruling above lands — do not retry it with a
larger gap. B5 (renew cannot reduce expiry), B6 (grace banner — check the
clock-drift risk first), B11 (renew deep link), B12 (insufficient balance),
B13 (subname renew role gate), B18 (multi-entry-point) remain open and
untouched. A5's price-arithmetic half (from iteration 18) and the A3–A9/
A17–A20 EOA-blocker probe (from iteration 17) are both still undone.

---

## Iteration 18 — 2026-08-29 · B1, and B-series' free wins are exhausted

**Batch:** R1 continued — B-series (renewal). Chose it over resuming the A-series
probe because it's completely independent of iteration 17's EOA blocker.

**Result:** PASS 1 (B1). **Ratchet: R1 4 → 5, total 50 → 51.** Verified on two
consecutive green runs (a third run's harness gate hit a one-off flake —
`makeV1Name: rule 5` — re-run in isolation immediately after and passed clean;
not reproducible, not treated as a regression).

**In flight: nothing.**

### Landed

- **B1** (extend an owned name — expiry arithmetic) — `profile.spec.ts`'s
  "extend owned name by 28 days" was untagged and, like iteration 16/17's
  finds, already drove the real flow. Its only assertion was a UI text match
  (pre-computed expiry string reappearing post-renewal) — same shape as B2's
  already-accepted oracle, but B1's registry wording is explicitly the
  arithmetic itself ("new expiry = old + duration"), so I added a real
  before/after chain read (`getExpiry` on the current `.eth` V2 registry) and
  asserted the delta is exactly 28 days in seconds. Did not touch B2 to match
  — out of scope, and it's already terminal.

### Checked and genuinely exhausted — do not re-grep this

Every renewal/extend-titled test in both apps, tagged or not: only 4 exist
total (`profile.spec.ts`'s two extend tests, both now spoken for as B1/B2, and
one migration-premium.spec.ts renewal test that's moot — that file is in the
manager project's `testIgnore`, same class as A11). B3–B18 (16 rows) have
**zero** existing coverage to harvest; each needs a real new test.

### Probed, not attempted — bigger than a quick add

- **A5** (payment token picker) — confirmed via source
  (`packages/transaction-manager/src/contracts/ens-sepolia.ts`): the manager's
  register-v2 picker is deliberately USDC-only — "DAI is deliberately absent:
  offering it in a picker produces quotes the registrar rejects at
  settlement" — and the "Stables accepted" footer hardcodes a single USDC
  icon regardless of wallet balances. The "unsupported token absent" half of
  A5's oracle is a cheap, static assertion. The other half — "quoted total =
  base × oracle ratio" — needs a chain-level `getRegisterPrice`-equivalent
  read cross-checked against the UI's parsed price text, which I did not want
  to rush; tagging a test that only checked absence and skipped the price
  arithmetic would be exactly the partial-tag rule 2 forbids. Next session:
  the read is the same `getRegisterPrice(label, duration, token)` shape
  `makeName.ts` already calls.
- **Bulk-renew** (`apps/manager/src/features/bulk-renew`, likely B8/B9/B10)
  and **auto-renewal** (`apps/manager/src/features/auto-renewal`, likely
  Y5/Y6) — real, shipped features with **zero** e2e coverage, tagged or not.
  Bigger than a quick add; each needs its own probe of the UI flow before
  writing anything.

### Learned — do not re-derive

- A transient failure in `harness-manager.spec.ts`'s `makeV1Name: rule 5`
  (unrelated to anything this session touched) did not reproduce on an
  isolated re-run. After many hours and dozens of runs against the same
  long-lived Anvil fork this session started, some flake in the V1 fixture
  path is plausible from accumulated state — worth knowing if it recurs, not
  yet worth chasing.

### Next

A5's price-arithmetic half, or B3 (grace-period extend) as the next fresh
B-series test — B3 needs a name already in grace, which `makeName`'s negative-
duration support already provides (see `harness-expired` in any harness run
this session). Bulk-renew and auto-renewal are higher-value but need their own
probe first. The iteration-17 EOA-blocker probe (A3–A9, A17–A20) is still
undone if nothing above looks better.

---

## Iteration 17 — 2026-08-29 · first R1 batch, and a real infra blocker on A1

**Batch:** R1 (financial) — the first attention this tier has had. R0's
remaining 69 rows are still G*-blocked on iteration 14's unanswered ruling
question 2; R1 has 47 untouched rows (A1–A25 registration, B1–B18 renewal,
Y1–Y7 payment methods) and was the natural next target.

**Result:** PASS 2 (A2, A10) · blocked-env 1 (A1, new — see below) ·
**Ratchet: R1 2 → 4, total 48 → 50.** Both PASS verified on two consecutive
green runs.

**In flight: nothing.**

### Landed — two more untagged-but-already-correct tests, same pattern as iteration 16

- **A10** — `apps/manager/src/routes/register/$name.tsx`'s loader redirects
  an already-registered name straight to its profile route before the
  registration UI ever renders. New test, tags the loader's own behaviour
  directly (URL assertion), not a rendered message.
- **A2** (Register via Rhinestone HCA) — `registration-rhinestone.spec.ts`
  already drove the full standalone-HCA flow (two signatures, zero wallet
  transactions, mockestrator-filled intents) and asserted only the UI's
  "Registration Complete" banner. Strengthened with `assertV2Registered`
  (direct `getStatus()` read on the *current* `.eth` V2 registry — the same
  helper `migration-fuses.spec.ts` uses, sourced from `ensL1Contracts` to
  avoid the superseded-registry trap its own header comment documents) before
  tagging it. Same shape as iteration 16's F8/F9 finds: a real, working test
  sitting untagged.

### NEW BLOCKER — A1 (and probably several A-series siblings) needs a manager
### instance this environment doesn't have

A1's oracle is a specific stage spine — `deployingResolver →
preparingCommitment → committingTransaction → commitmentCooldown →
checkingAllowance → approvingToken → registeringDomain → success` — which is
**only reachable in pure-EOA mode**. `apps/manager`'s `VITE_FF_USE_EOA` is a
Vite build-time env var (`apps/manager/src/utils/feature-flags.ts`), baked in
when the dev server starts, with no runtime/URL override. Every checked-in
env file (`.env`, `.env.local`, `.env.ci`, `.env.example`) — including the
`.env.local` this session created from `.env.ci` for the harness gate in
iteration 16 — sets it `false`, which routes through the Rhinestone/HCA
machine (A2's spine) instead. Confirmed directly: `grep VITE_FF_USE_EOA
apps/manager/.env.local` → `false`, on the instance these tests just ran
against.

There is exactly one `MANAGER_APP_URL` in `projects/manager/playwright.config.ts`
— no second project/webServer pointed at an EOA-mode instance — so A1 cannot
be exercised without either restarting the dev server with the flag flipped
(which would make A2's already-passing HCA-path test unrunnable in the same
session) or standing up a second manager instance on another port. Neither is
a test-authoring decision; recorded as **blocked-env, owner sugh01, expires
2026-09-05** (5 working days, per goal §10).

**Likely affects more than A1.** A3–A9, A17–A20 read as EOA-path-specific in
the catalogue's oracle language (stage names, "no orphaned commitment" for a
wallet-driven flow); A15/A21/A22 look signer-agnostic and probably aren't
blocked by this. None of the siblings were individually confirmed — this is
a pattern to check systematically before the next R1 batch, not a blanket
closure of the area.

### Learned — do not re-derive

- **`e2e/helpers/console-monitor.ts` is dead code for fine-grained stage
  detection.** It filters on `[REGISTRATION IN PROGRESS]`, a prefix that does
  not exist anywhere in current source, and `[TRANSACTION MANAGER]`, which
  does exist but only logs 4 of the 8 registration stages (via fixed
  transaction ids `tx-reg-{deploy-resolver,commit,approve,register}`), never
  the outer XState stage name itself. Every state has a `logTransition` entry
  action, but it logs the triggering *event* and tx-id context, not the
  arrived-at *state name* — so `deployingResolver`/`preparingCommitment`/
  `commitmentCooldown`/`checkingAllowance` never appear as matchable console
  text under any prefix. Its `onStateChange` callback appears in
  `registration-rhinestone.spec.ts` too, decorative and unasserted. A future
  attempt at A1's exact spine will need either the sub-transaction ids above
  (covers 4 of 8 stages) plus the unique `🗑️ [REGISTRATION] Cleared snapshot`
  line for outer `success`, or a DOM-level read of `stageLabel` text from
  `txStageMessages.ts` (distinct per stage, but not asserted to survive fast
  transitions under automine — unverified).
- **`getState()`/`getStatus()` on the V2 `.eth` registry is signer-agnostic**
  — same read for a name registered via EOA, HCA, or the test fixtures. Use
  `helpers/migration-assertions.ts`'s `assertV2Registered(label)` rather than
  re-deriving the registry address; its own header comment documents a
  superseded registry still live on the fork that answers a *different*,
  plausible-looking status for the same label.

### Next

Systematically probe A3–A9/A17–A20 against the EOA blocker above (quick — it's
one grep-and-read each, not a full implementation) before spending a batch
assuming they're reachable. A15 (label validation, pure `parseName` logic,
signer-agnostic) and A22 (two-tab race) are worth a look independent of the
EOA question. B-series (renewal, 17 rows) and Y-series (payment methods, 7
rows) are completely untouched and independent of this blocker. Both apps'
`temporaryPremium.spec.ts` files are entirely `test.describe.skip`-ed with no
reason recorded and weak oracles even if unskipped (checks "a $ amount is
visible", not `LibHalving`'s exact value) — worth its own investigation
before claiming A13/A14, not assumed to be quick.

---

## Iteration 16 — 2026-08-29 · R0 batch: F6/F8/F9/F14, one new defect, one false-alarm ruled out

**Batch:** the unblocked remainder of R0 transfer/fuses work (F6, F8, F9, F14,
I5) — chosen because G* (59 rows) stays blocked on iteration 14's ruling
question 2, which nobody has answered yet.

**Result:** PASS 3 (I5, F8, F9) · DEFECT 1 (F14, new — E2E-003) · PRODUCT-GAP 1
(F6, no machine-terminal state exists for it yet — see below) · EXEMPT 0.
**Ratchet: R0 10 → 14, total 44 → 48.** Verified: every PASS test run green
twice consecutively; F14 confirmed failing at the *same* assertion across
three separate runs (deterministic, not a flake).

**In flight: nothing.**

### Probed first, per §7 — one turned out not to exist

- **F6 (batch transfer)** — the names dashboard has real multi-select
  checkboxes, but the only bulk action wired to the selection is *Extend*.
  No batch-transfer route, button, or modal exists, and `safeBatchTransferFrom`
  has zero call sites in `apps/portal/src`. **PRODUCT-GAP**, not test debt —
  recorded in `docs/e2e-defects.md` under a new "Product gaps" section, since
  `scenarios.ts`'s only machine-terminal disposition besides PASS/DEFECT is
  `exempt`, and that means something different (a human-approved decision not
  to test, not "the app can't do this"). Closing that schema gap is a
  reasonable next HW-tier item but wasn't done here — out of scope for a
  scenario batch.
- **F9 (detach-toggle combinations)** — the catalogue's "2³ minus the
  impossible" underclaimed slightly: there really are 3 toggles
  (`setEthAddress`/`detachResolver`/`detachRegistry`), and exactly one pair of
  the 8 raw combinations collapses to a UI-unreachable duplicate (SendNameForm
  disables `setEthAddress` whenever `detachResolver` is on), leaving 6
  distinct plans. 3 were already covered incidentally by F1/F7/F12 (now also
  tagged `@scenario:F9` — the "all tests carrying a tag must pass" semantic
  from iteration 11 makes this safe); the other 3 are new tests here.
- **F8 (manager/owner split)** — real and testable: `isManagerRoleSettable`,
  `RolesAddUserSheet`, and `/$name/roles` are a first-class, named concept
  distinct from token ownership.

### FINDING, then RULED OUT — a role grant does not corrupt ownership

Repro: register a name, grant `ROLE_SET_RESOLVER` to a third party via
`grantNameRoles` (the same `grantRolesWriteParameters` the portal's own grant
flow uses), then read `ownerOf(labelToCanonicalId(label))` — it comes back
**zero**, on a name that plainly has an owner. First read as a severe product
defect (silent ownership loss from an everyday role grant) and treated as a
stop-the-batch S1 candidate per goal §16.5.

**It is not a defect.** `ownerOf(baseId + 1)` returns the correct owner —
the registry bumps a low-order **token-id version** on at least some
registry-level writes (grantRoles among them), and a statically precomputed
`labelToCanonicalId(label)` goes stale the moment that happens. The app's own
ownership lookup (`getOwner` / `UniversalResolver.findOwner`, name-keyed, not
token-id-keyed) is immune to this by construction — confirmed by probe, owner
read correctly across the same grant.

**Fixed as a test-side issue, not filed as a defect:** `transfer.spec.ts`'s
shared `ownerOfName()` — used by F1, F7, F8, F9's six tests, F12, and F14 —
now goes through `getOwner` instead of a raw `ownerOf(labelToCanonicalId(...))`
call. All previously-passing callers re-verified green after the change; no
regression. **Lesson worth keeping**: a static token id computed once at
registration time is not safe to reuse after *any* intervening registry
write, not just a transfer. Worth a note if `GA11` (name-data mismatch, label
≠ tokenId) ever gets probed — this may be the same mechanism.

### NEW DEFECT — E2E-003 (S2), retry-after-reject is broken

`docs/e2e-defects.md` has the full entry. Short version: reject a transfer
step's wallet prompt (`wallet.reject(Web3RequestKind.SendTransaction)`), then
click the app's own "Retry" and authorize again — it deterministically fails
at the RPC layer ("Failed to submit transaction: An unknown RPC error
occurred"), every run, not intermittently. Step 1's effect stays durable and
correctly reported (not S1 — nothing is lost or corrupted, the user is just
stuck on the retry). Not chased to a confirmed root cause; `transaction.
machine.ts`'s own "nonce too low" guard comment is the strongest lead, since
both transfer steps share one signer and a resubmission reuses `context.
request` rather than re-preparing it. The regression test is committed and
tagged `@scenario:F14`, asserting `Transaction Error` becomes hidden after the
retry — currently and correctly red.

### Learned — do not re-derive

- **A test title with any of `'`, `"`, `` ` `` inside it silently breaks the
  reconciler**, even if you pick a different delimiter — `scanSpec`'s title
  regex (`coverage/reconcile.ts`) is `/['"`]([^'"`]+)['"`]/`, which excludes
  *all three* quote characters from the captured content, not just its own
  delimiter. A title with an apostrophe (`"...manager's roles..."`) truncates
  at the apostrophe, the truncated title never matches playwright's real
  title, and the scenario silently reports **`excluded`** — a real, CI-failing
  state, not a cosmetic one. Caught here by a coverage-count mismatch (+3
  expected, +2 observed) rather than by any visible error. Avoid apostrophes
  (and any quote character) in `@scenario:`-tagged test titles until someone
  fixes the regex; this is worth an HW-tier fix on its own, since the next
  person to hit it won't have a reason to suspect punctuation.
- **Playwright's JSON `--list` reporter strips the leading `@` from `tag:`
  array tags** (`@scenario:F8` → `"scenario:F8"` in `spec.tags`). This means
  `listExecutable()`'s tag-keyed fallback (`executable.get('tag::'+tag)`) can
  never match anything from that path — the *only* reason scenario matching
  works at all is the primary `file::title` key. Not a bug I fixed (the
  primary path covers it and touching the shared reconciler was out of scope
  for a scenario batch), but worth knowing before trusting the tag-based
  fallback for anything.
- **A step can auto-start the moment its screen becomes active** — not just
  "every transaction but the last," as `driveTransactionsToSuccess`'s comment
  suggested; both steps of a 2-step transfer auto-triggered here. The tell is
  a `button:disabled` reading "Waiting..." with a clickable icon button
  immediately preceding it in the DOM, rather than a labelled "Open wallet"
  button. A rejected step also returns the dialog to the **overview** screen
  (row badges "Done"/"Failed", bottom button relabelled "Retry"), not back to
  the per-step screen ("Try again") — different screen, different button text,
  same underlying state.

### Next

Per iteration 14/15: ruling question 2 (V1 repoint scope — all four
constants at once, or controller+registrar first) is still open and still
blocks all 59 `G*` migration rows. Nothing in this iteration depended on it or
answered it. Once ruled on: implement the repoint, verify
`unwrapped`/`wrapped`/`locked` against `harness-manager.spec.ts`'s
`test.fail()` gate turning red. Until then, R2 (38 not-started) and R3 (69
not-started) remain valid, unblocked work — R3 in particular has had zero
attention all suite.

---

## Iteration 15 — 2026-08-29 · ruling question 1 settled — `0x640294a2…` identified

**Batch:** resolve iteration 14's ruling question 1, the disputed identity of
`0x640294a2b2d87e7f522db3e3e3e876764bce170d`. Question 2 (repoint scope) is
**not** addressed here and still needs a ruling.

**Result:** identity settled by direct on-chain evidence, not inference.

### What it actually is

Sepolia Etherscan shows it as a **verified `PublicResolver`**, deployed 165
days before this writing by `0xffFffFFfFF52D316B7Bd028358089bc8066b8f80`, with
constructor arguments:

| constructor arg | value | matches |
|---|---|---|
| `_ens` | `0x7e89b563f936c68c31a360840eb7f9a4aacaf014` | `V1_ENS_REGISTRY` (makeV1Name.ts) |
| `wrapperAddress` | `0xc7e033b8836e4bd55d069d113f018b98478cb091` | `V1_NAME_WRAPPER` (makeV1Name.ts) |
| `_trustedETHController` | `0xf42df26c1b222bee5a6b78cbb8bbfaa0ba07786a` | `V1_ETH_REGISTRAR_CONTROLLER` (makeV1Name.ts) |

All three match this project's own V1 fixture-stack constants exactly. It is
not a third, unidentified contract — it is **the PublicResolver deployed
alongside this project's own V1 fixture stack**, correctly named
`V1_PUBLIC_RESOLVER` in `makeV1Name.ts`. `makeName.ts`'s `DEDICATED_RESOLVER`
was the wrong name for the same address, not evidence of a second contract.

Also settled while probing it: its `supportsInterface` is a correctly-behaving
ERC165 (returns `false` for `0xffffffff` and garbage selectors), and it
answers `AddrResolver`/`AddressResolver`/`TextResolver`/`NameResolver`/
`PubkeyResolver`/`ABIResolver` but not `IExtendedResolver` — consistent with
being an older-generation PublicResolver, and with iteration 13's finding that
it is not writable by a V2 name's owner (its authorisation checks the V1
registry, not the V2 one), which is exactly why `makeName.ts` deploys a
separate per-name PermissionedResolver proxy whenever a test needs to write
records.

### Fixed

- `fixtures/makeName.ts` — deleted the duplicate `DEDICATED_RESOLVER` literal
  and its now-stale "DISPUTED" comment; imports `V1_PUBLIC_RESOLVER` from
  `makeV1Name.ts` instead. One name, one binding.
- `scripts/check-address-literals.ts` — replaced the OPEN FINDING /
  `conflictAcceptedUntil` waiver (already expired as of this date) with a
  settled single-name entry. **Rule-7 gate re-verified green** after the fix,
  with no conflicting-binding warning.
- Updated the two comments in `projects/portal/tests/transfer.spec.ts` that
  still said `DEDICATED_RESOLVER`.

### What this does NOT settle

Ruling question 2 from iteration 14 — whether the V1 repoint covers all four
constants at once or controller+registrar first — is untouched. That decision
still blocks the 59 `G*` migration rows and needs a human call, per iteration
14's reasoning (the two pairs sit on different ENS registries).

### Next

Per iteration 14: once question 2 is ruled on, implement the repoint and
verify `unwrapped`/`wrapped`/`locked` against `harness-manager.spec.ts` — its
`test.fail()` gate going red is the success signal. Until then, R2 (38
not-started) and R3 (69 not-started) remain valid, unblocked work.

---

## Iteration 14 — 2026-08-12 · the grant is reproducible now · **LOOP STOPPED, needs a ruling**

**Batch:** implement iteration 13's recipe.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0. **Ratchet unchanged at
44.** Second consecutive iteration with no terminal progress, so the anti-stall
rule fires and **the loop is stopped deliberately** — see the ruling needed
below. This is the rule working, not a malfunction.

**In flight: nothing.**

### Landed

- **`fixtures/v1-controller-auth.ts`** — `ensureV1ControllersAuthorised()`, the
  reproducible form of iteration 13's probe. Idempotent, memoised per process,
  grants only what is missing, and **reads back after writing** (rule 5) so a
  silent no-op cannot recur. Grants both
  `base.controllers(ETHRegistrarController)` (for `register`) and
  `base.controllers(NameWrapper)` (for `wrapETH2LD`).
- **A harness test for it** in `harness-manager.spec.ts`, asserting both grants
  land and that a second call is a no-op. Snapshot/reverted so the test does not
  itself become the untracked fork mutation it exists to replace. **Verified
  green** (6 expected, 0 unexpected).
- **Rule-7 gate is green again.** It was red, and that was my doing, not
  pre-existing: `probe-reverse.mts` (committed in iteration 12) bound
  `0xf39f…` under a third name, and iteration 13's five `probe-v1-*.mts` added
  four more conflicts plus an unaccounted literal. All six one-off probes are
  deleted; their findings live in the iteration 13 entry, in the corrected
  comment at the top of `makeV1Name.ts`, and in the fixture above. **Check this
  gate before committing** — nothing else runs it automatically, which is how it
  stayed red across two iterations.

### NOT done, and why

The repoint itself. `makeV1Name` still points at the superseded deployment, so
**the 59 `G*` rows remain at zero.** Stopping short was deliberate: the blast
radius is wider than iteration 13 assumed.

`scripts/check-address-literals.ts` already records `V1_PUBLIC_RESOLVER`
(`0x640294a2…`) as **DISPUTED** — the same address is declared as
`DEDICATED_RESOLVER` in `fixtures/makeName.ts`, it is **absent from
`ensL1Contracts[sepolia]` entirely**, and its bytecode matches neither
`ensPublicResolver` (`0x5239A812`) nor `ensPermissionedResolverImpl` nor the
resolver the V1 registry returns for `eth`. It is a third contract under two
names, and at least one name is wrong. It is used by
`migration-fuses.spec.ts` (`assertV2Resolver(label, V1_PUBLIC_RESOLVER)`) and by
`makeName.ts`, so repointing it silently would change what those assert.

### ⛔ Ruling needed before the next iteration can proceed

1. **What is `0x640294a2…`?** Until this is settled, no `GR*` record-replay
   result can be trusted, and the repoint cannot touch the resolver constant.
   This is an intent question about the deployment, not something to guess.
2. **Scope of the repoint** — all four V1 constants at once (controller, base
   registrar, wrapper, ENS registry), or controller + registrar first, leaving
   wrapped/locked for a follow-up? Note the two pairs sit on **different ENS
   registries** (`0x00000000000C2E07…` canonical vs `0x7e89b563…`), so anything
   reading the registry directly moves with the switch.

Everything not depending on those answers has been done. Per goal §10 these
default to **EXEMPT after 5 working days (2026-08-19)** if unanswered — but the
repoint is not exemptible, it is just blocked, so the honest move is to escalate
rather than let the loop grind.

### Next batch, once ruled on

Repoint, then verify `unwrapped` / `wrapped` / `locked` end to end against
`harness-manager.spec.ts`. When its rule-6 `test.fail()` goes **red** ("expected
to fail but passed") that is the success signal: delete the annotation in the
same change and the `G*` matrix opens.

**If the ruling is slow, do not idle.** R2 has 38 and R3 has 69 not-started rows,
all unblocked, and taking a batch there is the correct use of the time.

---

## Iteration 13 — 2026-08-12 · the `makeV1Name` blocker is diagnosed, and it was never what the comment said

**Batch:** unblock `makeV1Name`, which holds all 59 `G*` migration rows at zero.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0. **Ratchet unchanged at
44** — no scenario became terminal, deliberately. This iteration bought a root
cause and a proven recipe, not coverage.

**In flight: nothing.** `makeV1Name` still points at the old deployment on
purpose; the comment at the top of it is now correct instead of misleading.

### Root cause

The standing note in `makeV1Name.ts` said switching deployments "is not
address-only" and the flow needed adapting for "fee, commitment age or parameter
semantics". **That was a guess and it was wrong.** Measured, with the probes now
committed under `e2e/scripts/probe-v1-*.mts`:

| check | fixture ctrl `0xF42dF26c…` | ensjs ctrl `0xfb3cE5D0…` |
|---|---|---|
| bytecode size | 9739 | 9739 |
| `register` selector | `0xef9c8805` | `0xef9c8805` |
| min/maxCommitmentAge | 60 / 86400 | 60 / 86400 |
| `rentPrice(x, 1y)` | 3125000000003490 | 3125000000003490 |
| `register` simulation | **OK** | **reverts, no data** |

Same code, twice deployed, same prices, same ages. The revert carried **no
reason string and no custom-error selector** — the signature of a bare
`require(...)` with no message, which is precisely
`BaseRegistrarImplementation.onlyController`. And indeed
`base.controllers(ensjsController)` was `false`.

`addController` on the base registrar (impersonating `base.owner()`, which is
`ensEthRenewerV1` `0x4ad56feb…`) flips it to `true`, and **`register` on the
ensjs controller then simulates OK**. Proven end to end.

### What still has to happen — the full recipe

Unwrapped names are unblocked by grant (1). Wrapped and locked names — i.e. most
of the matrix (GW2–GW12, all of GS) — additionally need (2):

1. `base.addController(ensjsController)` — **proven**
2. `base.addController(nameWrapper)` — **not yet done.** `false` on the canonical
   pair, `true` on the pair the fixture uses. `wrapETH2LD` needs it because the
   wrapper calls back into the registrar.

Do **not** chase `wrapper.controllers(controller)`: it is `false` on *both*
pairs, including the working one, so it is not a requirement. The fixture wraps
by calling `wrapETH2LD` as the owner after an unwrapped registration, not by
registering through the controller with the wrapper as owner.

Also worth knowing: the two pairs sit on **different ENS registries** — the
canonical wrapper's `ens()` is `0x00000000000C2E07…` (which is what the apps and
the Panoptes manifest read), the fixture wrapper's is `0x7e89b563…`. Anything
that reads the registry directly must move with the switch.

### ⚠️ Fork state was mutated, and it is not reproducible

The probe **granted `base.addController(ensjsController)` on the live fork**.
That persists for every later test on this stack, and a fresh
`pnpm e2e:infra:up` will **not** have it. So:

- do not conclude from a green run on *this* stack that the fixture works
- the grant has to become a real, reproducible step — either inside `makeV1Name`
  (impersonate + grant, idempotent, verified by read-back per rule 5) or an
  infra setup script — before any `G*` row may be claimed. CI has to get it too.

### Next batch

Implement the recipe: grants (1) and (2) as an idempotent fixture/infra step,
repoint `V1_ETH_REGISTRAR_CONTROLLER` / `V1_BASE_REGISTRAR` / `V1_NAME_WRAPPER`
/ `V1_ENS_REGISTRY` at the ensjs-resolved addresses, then verify each V1 name
type end to end (`unwrapped`, `wrapped`, `locked`) against
`harness-manager.spec.ts`. When its rule-6 `test.fail()` goes **red**, that is
success: the annotation must come off in the same change, and 59 `G*` rows open.

---

## Iteration 12 — 2026-08-12 · iteration 11 closed out, and a wrong diagnosis corrected

**Batch:** finish what iteration 11 could not verify (F10–F13), then re-test the
registration-dependent failures now that the anvil pin has landed on `main`.

**Result:** PASS 6 (F10, F11, F12, F13 verified · A16, B2 recovered) · DEFECT 0 ·
EXEMPT 0 · PRODUCT-GAP 0.
**Ratchet: R0 8 → 10, total 42 → 44.** Two consecutive green runs (21/21 in 2.3m,
then 21/21 in 1.5m), plus a merged three-run report (34 expected, 0 unexpected)
reconciled with `--update`.

**In flight: nothing.**

### Iteration 9's registration diagnosis was wrong, and this is the correction

Iteration 9 attributed A16's failure to an HCA/session problem, evidenced by the
mockestrator logging an `IntentExecutor` call reverting *"for an unknown reason"*
with `commitmentAt()` returning `0n`, and escalated it as external. That was a
**symptom**, not the cause.

The real cause (diagnosed separately, now merged as #1056): the e2e stack tracked
`ghcr.io/foundry-rs/foundry:latest`, an unpinned nightly, and a newer anvil
silently drops some of the transactions the mockestrator uses to fill an intent —
it sends one `eth_sendTransaction` per call, returns only the last hash, and still
records the intent `COMPLETED`. A batch whose earlier calls vanished is exactly
how a later call reverts for no discernible reason.

Measured after the pin:

| test | iteration 9 | now |
|---|---|---|
| A16 · registers a name after connecting from the pricing page | **fail, 188s** | **pass, 69s** |
| B2 · extend unowned name by 28 days | **fail, 103s** | **pass, 13s** |

So R1's "verifiably 0" from iteration 11 was an environment artefact after all,
and iteration 11 was right not to lower the ratchet for it. Iteration 9's
duration-as-hang-detector heuristic held up perfectly: both were burning
timeouts, and both now finish well inside the passing band.

**Lesson worth keeping:** a revert with no reason, from a component you do not
control, is a reason to suspect the *environment* before the component. Two
sessions spent on a smart-account theory that a pinned dependency would have
ruled out in minutes.

### The harness gate earned its keep, and caught a fault in itself

The first F10–F13 run **aborted at the gate**, so the ten tests never ran — they
appear as `0s PASS` in the JSON but are `skipped` in the stats. Nothing was
verified and the ratchet correctly stayed at 42. Read the `stats`, not the
per-spec status: `expected`/`unexpected` is the honest signal.

The failing check was `makeName`'s rule-6 assertion, and it was **my instrument,
not the app**:

- `features/profile/components/Owner.tsx` calls `useEnsName(owner)` and renders
  the owner's **primary name** when it has one, falling back to
  `truncateAddress` only when it does not.
- The page showed `rh-e2e-msprkerf.eth`. On the fork, account 0's reverse record
  *is* that name, and it forward-resolves back to account 0 — both read directly.
- The assertion hardcoded `0xf39F…2266`, so it was state-dependent, and it broke
  the first time an earlier run set a primary name on the shared test account —
  which A19's post-registration auto-setup does as a matter of course.

Now it derives the expected label from chain the way the app does, and when a
primary name is in play it asserts that name forward-resolves to the owner, so a
stale reverse record cannot let the test pass on the wrong label. Universal
resolver comes from `ensL1Contracts` (rule 7), not a literal.
`e2e/scripts/probe-reverse.mts` is the probe that settled it.

**Generalise this:** any assertion on a rendered *identity* is state-dependent
when the app has more than one way to render it. Address vs primary name is the
obvious pair here; expiry-vs-relative-date and label-vs-full-name are the same
shape and are worth auditing before they bite.

### Still blocked, unchanged

`makeV1Name`'s rule-6 check remains `test.fail()` — a genuine expected failure,
not a skip. The fixture still registers into a V1 deployment the migration UI
never queries, so **all 59 `G*` migration rows stay at zero**. That unblock
outranks tier order (skill §2) and is the natural next batch.

**Parked:** nothing new.
**Skipped-blocked:** `G*` (59 rows) — `makeV1Name` deployment mismatch;
`A11` — tagged but no config runs it (`migration.spec.ts` is in the manager
project's `testIgnore`), which the reconciler reports and does not count.

**Next:** the `makeV1Name` unblock. Point it at the registrar ensjs resolves
(`ensBaseRegistrarImplementation`), decode the `register` revert iteration
notes recorded against the ensjs controller, and flip the `test.fail()` — which
goes red on success, by design, exactly when a human should look.

---

## Iteration 11 — 2026-08-12 · all-must-pass semantics · **BLOCKED on infra**

**Batch:** make a scenario PASS only when *every* covering test passes, then tag
the multi-case rows that semantic unblocks.

**Landed and verified:** the reconciler change. `A16` now correctly reads
`1/2 covering test(s) did not pass: "registers a name after connecting from the
pricing page" (failed)` — a partial regression the old "best outcome wins" rule
had been hiding.

**Landed but NOT verified:** `F10` (six recipient forms) and `F13` (non-owner
and disconnected visitor), tagged across their per-case tests. Honest to tag
only because of the semantic above; before it, six per-case tags would have made
F10 green on one input.

**Ratchet held at 42**, not the 44 static now reports. The verification run died
on `ECONNREFUSED 127.0.0.1:8545` — ten tests "failed" in 25 seconds against no
chain. Rule 7 forbids claiming a run I did not observe.

### BLOCKER — the e2e infra stack is gone

Every `infra-*` container is **removed**, not stopped — `docker ps -a` shows no
`infra-anvil-1` at all. This happened outside the loop. Nothing that touches the
chain can run until it is back.

`pnpm e2e:infra:up` restores it, but it creates a **fresh fork**, discarding the
accumulated chain state — including the ~29-day clock drift, which is arguably
a bonus. That is the repo owner's call, so it was not done here.

**First thing after infra returns:**

```
pnpm exec playwright test --config=projects/portal/playwright.config.ts   --project=portal-e2e --grep "@scenario:F1[0123]" --reporter=json --workers=1
pnpm e2e:coverage --results <file>          # then raise the ratchet to 44
```

### R1 is verifiably 0, and deliberately not lowered

Both `A16` and `B2` fail, so R1's true value is 0 against a baseline of 2.
Not lowered: `A16`'s failing test is a *registration* test, so it shares the HCA
session root cause diagnosed in iteration 9 and already escalated. Baking a
demotion into the ratchet for a known, external, in-flight cause would be wrong.
It should recover on its own once the smart-account fix lands.

---

## Iteration 10 — 2026-08-12 · first real scenario batch

**Batch:** R0 · audit the ten untagged `transfer.spec.ts` tests against F9–F13.

**Result:** 2 tagged (**F11**, **F12**) · 1 strengthened · 3 rows deliberately
left untagged. **R0 6 → 8**, ratchet raised. Both verified green by observed
runs, not static evidence.

- **F12** needed nothing — it already reads the resolver back off the registry
  and asserts `addr(60) == recipient`, exactly the catalogue oracle.
- **F11** verified its record write with `getByText`, i.e. the rendered value,
  which only proves the form echoed what was typed. Now reads `text()` off
  chain.

### F11's first fix looked like a defect and was not

The chain read initially used ensjs `getTextRecord` and failed — apparently
"the new owner cannot write", which would have been a real S2. It was my
instrument. Checked by hand against a name from an earlier run:

```
registry resolver    = 0xcE06b938…
resolver.text direct = "Edited by the new owner"     ← the write landed
ensjs getTextRecord  = ERR TypeError                 ← the helper is wrong here
```

`getTextRecord` resolves through the Universal Resolver, which does not answer
for the resolver this test freshly deploys. Reading the resolver directly is
also the higher oracle — it depends on nothing but the two contracts the
assertion is about.

**Third time this session** that a red test was not evidence about the app
(after the portal-on-public-Sepolia run, and the "R0 is hollow" inference).
Establish the instrument before believing the reading.

### F9, F10, F13 — untagged on purpose

They are **multi-case matrices** in the catalogue and the existing tests cover
one case each. F10 alone names six recipient forms (ENS name, address,
whitespace, self, zero address, unresolvable) and there is a passing test for
each — but the reconciler marks a scenario PASS when **any one** covering test
passes, so six per-case tags would make F10 green on a single input. That is
precisely the partial tag rule 2 forbids.

Unblocking them needs one of:

1. a consolidated test per row, or
2. **an all-must-pass reconciler semantic** — a scenario is PASS only when every
   covering live test passes.

Option 2 is the better fix and also closes the hole found in iteration 9, where
`A16` stays green because one of its two tagged tests passes while the other
fails. It is a change to PASS semantics, so it will demote whatever is currently
carried by a partial pass — a scope change worth doing deliberately rather than
mid-batch.

### Ratchet note

Raised on the **static** run, so `R1` stays at its pre-existing 2 while the
verified value is 1 (`B2` genuinely fails — iteration 9). That staleness is
already parked, not newly introduced here; `R0 6 → 8` is the real movement and
is backed by observed green runs of both tests.

---

## Iteration 9 — 2026-08-12 · manager repriced, and registration diagnosed

**Manager suite verified.** 18 tests: 12 passed, 5 failed, 1 skipped, ~40 min.
With both suites' results: **terminal 39/300**, and the ratchet fires on
**R1 2 → 1** — a real demotion this time, not an environment artefact.

Manager-side failures:

| Test | Duration | Tag |
|---|---|---|
| sets the newly registered name as primary | 249s | — |
| registers a name via Rhinestone HCA | 249s | — |
| registers a name after connecting from the pricing page | 188s | A16 |
| extend unowned name by 28 days | 103s | **B2** |
| agent-registration record card | 29s | — |

`A16` survives because it is tagged on two tests and one passes — the
reconciler's documented "best outcome wins". Worth knowing: **a scenario tagged
on several tests goes green on any one of them**, so a partial regression is
invisible at the tier level. `B2` had only one test and correctly demotes.

### Duration is a hang detector, and it is free

The distribution is bimodal with a clean gap: **everything passing ≤26s,
everything failing ≥29s**, with the top three at 188–249s. Those three are all
registration-dependent and were each burning a full timeout waiting on a
registration that never completes — **11.4 minutes of the 40-minute run spent
waiting for one upstream failure.**

Any test whose duration approaches its configured timeout is waiting for
something that never arrived, which looks nothing like doing a lot of work.
Cheap check, and it is what turned "five unrelated failures" into "one cause and
its three victims".

### Registration (HCA) — diagnosed, not fixed

Reproduces in isolation, so it is not cross-test interference.

**Ruled out**, each with evidence:

- *Stale selector* — my first guess. `locator('p.text-ens-peridot-text-dark')`
  looks brittle, but the banner is absent because there is no success.
- *Orchestrator down* — mockestrator's 503 on `GET /` is just its unmapped-route
  reply (`{"error":"Not implemented!"}`). Docker: up, healthy.
- *Chain stalled* — automine on, blocks advancing, zero pending transactions.
- *Funding* — HCA holds 10 ETH and 10 000 USDC; executor EOA holds 1e9 ETH.
- *Address drift* — commit and read both use
  `ENS_SEPOLIA_CONTRACTS.ETHRegistrar` = `ensjsSepolia.ensEthRegistrar.address`.

**The actual mechanism:**

1. `tx-reg-commit` cycles `submitting → retrying` three times, then `error`.
2. The mockestrator logs, at the same moment, an `IntentExecutor` call
   reverting — `to: 0x8a525dc484f893ca64fef507746ebd5036eec256`, value 0,
   selector `0x8b10923e`, `execution reverted` / *"Execution reverted for an
   unknown reason"*. The intent payload carries the `commit` call
   (`0xf14fcbc8`).
3. Downstream, `registration.actors.ts:744` polls `commitmentAt()` five times
   with 3s backoff, gets `0n` each time, and throws the message the UI shows:
   *"Commitment timestamp not recorded after multiple attempts."*

So the UI message is a **symptom two layers below its cause**. Nothing is wrong
with the commitment polling; the intent that would have written the commitment
reverted inside the executor.

### Root cause — the HCA session is never enabled

Followed `DEBUGGING_INTENTS.md` §2 and replayed the intent. The trace bottoms
out exactly where §1 says it will:

```
0x5f249FCa…::isValidSignatureWithSender(…)          ← HCAOwnerAndSessionValidator
  ├─ HCA::ownerAndSessionNonce() → (0xf39f…2266, 0)
  └─ ← [Revert] 0x9bdfc59f                          ← the real error
     → returns 0xffffffff
  ← [Revert] 0x8baa579f  InvalidSignature()         ← the wrapper §1 warns about
```

| fact | value |
|---|---|
| inner error | `0x9bdfc59f` = **`InvalidSessionData()`** — *"payload is not the Smart Session USE form"* (§3 table) |
| mode byte `data[0]` | **`0x05` = `FIXED_SESSION_REFUND_ENABLE_MODE`** — same-chain first use, *carries the proof* |
| permissionId `data[1:33]` | `0xfd53396b5143242c0a1114e2ccd39a52ee7830fd19cf39ebee2d1530f86b2810` |
| `isPermissionEnabled(hca, permissionId)` at `latest` | **`false`** |
| `ownerAndSessionNonce()` | owner `0xf39f…2266`, nonce **0** |

So the app *is* doing the §7 thing correctly — mode `0x05` means the
session-enable proof is attached. The failure is one level in: the validator
rejects the session payload as not being in Smart Session USE form, the session
therefore never gets enabled, and **every** registration fails at its first
commit.

**This is not the intermittent bug §7 describes.** That one has the signature
"`false` at the failing block, `true` at `latest`". Here it is `false` at
`latest` too — the session is never enabled at all, so this is deterministic and
reproduces on every run, which matches what is observed.

Reproduce in one command (no fork or archive RPC needed — the failing state is
the local chain):

```bash
docker logs --since 10m infra-mockestrator-1 2>&1 \
  | grep -aoE 'data:   0x8b10923e[0-9a-f]+' | tail -1 | sed 's/^data:   //' > /tmp/intent.hex
cast call 0x8a525dc484f893ca64fef507746ebd5036eec256 "$(cat /tmp/intent.hex)" \
  --from 0x1aF50037fFD325FBC96A2BEFCf4b0d13c94Df0e8 \
  --rpc-url http://127.0.0.1:8545 --trace
```

**Where the fix belongs:** `packages/smart-account`, in how the fixed-session
payload is packed for `0x05` mode — §3's note applies, *"a trace only ever
reveals the first violation"*, so re-check the remaining calls against the
policy loop after fixing this one. That is app work and explicitly out of scope
for the test-building loop (§12), so it is handed over rather than attempted.

Not filed in `e2e-defects.md`: `registration-rhinestone.spec.ts` is untagged, so
a defect row naming `A2` would trip the reconciler's `defect-unproven` failure.
Recorded here instead, same as the `0x640294a2` finding.

---

## Iteration 8 — 2026-08-12 · the real numbers

Portal suite re-run against the corrected environment.

```
                    run 1 (bad env)   run 2 (fixed)
  passed                  17               58
  failed                  41                1
  skipped                  3                3
  duration               2.0h             8.9m
```

**`pnpm e2e:coverage --results` now reports 40/300 and exits 0.** Same number as
static mode — which is the point: every static PASS is now a *verified* PASS,
not an assumption. The ledger's evidence quality went up without the count
moving.

```
  HW  harness         5/10
  R0  irreversible    6/83    PASS 4 · DEFECT 2
  R1  financial       2/50
  R2  authorization  26/64    ← the 26 are real
  R3  display         1/70
  R4  resilience      0/23
```

**The single failure is correct and should stay red.** `transfer.spec.ts ::
surfaces an error when the recipient cannot receive the token` (F5) fails with
*"the resolver must not be detached for a transfer that cannot complete"* —
that is the committed regression test for open S1 **E2E-002**, doing exactly
what §7 prescribes: app wrong → file the defect, keep the failing test
committed. The reconciler counts F5 as DEFECT, which is terminal.

The 2.0h → 8.9m collapse is the tell: run 1 was 41 tests each burning a 60s
locator timeout against an app that could not see their fixtures.

### What is now settled, and what is not

- **Settled:** the 23 rows I flagged as possibly-stale are fine. No ratchet
  ruling needed. No portal write-UI bug exists. Iteration 7's escalation is
  fully void.
- **Not settled:** B4's R2 audit. Passing is not the same as meeting §4 — a test
  can be green on a weak oracle. Iteration 6's doc claimed R2 was "audited by
  measurement"; that was wrong twice, first because the run was invalid and
  second because a green run is not an oracle review. `roles.spec.ts`,
  `subnames.spec.ts`, `resolver.spec.ts` and `records.spec.ts` still need
  reading against §4. They now have a *much* better prior — they read bitmaps
  and records back on chain — but that is an impression, not an audit.

### Blockers, updated

| Was | Now |
|---|---|
| Portal write UI broken | **resolved** — was the env, fixed by the repo owner |
| Ratchet ruling needed | **withdrawn** — premise was void |
| Manager connect flow (`VITE_FF_USE_EOA`) | `.env` restored; **needs a manager-suite run to confirm** |
| `0x640294a2…` identity | **still open** — owner sugh01, expires 2026-08-18 |
| `makeV1Name` registrar | **still open** — blocks all 61 `G*` rows |

### Next

1. **Run the manager suite** the same way — `--reporter=json` → `--results`. Its
   `.env` was restored too, so the iteration-4 connect blocker may already be
   gone. That reprices R1/R3 on real evidence and is cheap.
2. **B4's R2 slice** — read the four portal files against §4.
3. Then R0 proper: `F` (14 rows) and `I` (6).

---

## Iteration 7a — 2026-08-12 · **CORRECTION to iteration 7**

Iteration 7's diagnosis below was **wrong**, and its numbers are void. Keeping
the section because the method was right and the correction is the lesson.

**What was actually wrong:** `apps/portal/.env` had been reduced to its
committed baseline, and the local-dev values — including
`VITE_SEPOLIA_RPC_URL_SERVER=http://127.0.0.1:8545` and
`VITE_INDEXER_GRAPHQL_URL` — survived only in an untracked
`apps/portal/.env.bak-loop`. **The portal was compiled against public Sepolia.**
It could not see a single name any fixture created on the local fork. The
manager had the same gap in `apps/manager/.env`.

Corrected by the repo owner on 2026-08-12: both `.env` files restored, both dev
servers restarted. Verified — both now serve `http://127.0.0.1:8545`.

**Three things this invalidates:**

1. *"The portal's connected/write UI does not mount"* — no. The app was on the
   wrong chain. Owner-gated forms never rendered because, to the app, the name
   did not exist.
2. *"17 passed"* — inflated. The 7 passing **portal** tests were all negative
   assertions (*shows no role holders*, *does not offer transfer*, *refuses…*),
   which are trivially true when the app cannot see the name. **A confident
   negative is exactly what an app on the wrong chain produces.** That is INV4,
   occurring inside the measurement intended to expose it. Genuinely verified
   was the 10 harness tests and approximately zero portal scenarios.
3. *The ratchet ruling* — no longer needs a human. The 23 rows were never
   evidence of stale tests; they were evidence of a broken environment.

**How it got past B0, and the fix.** B0 checked that Anvil was forked, that the
Panoptes manifest matched `ensL1Contracts[sepolia]`, and that both apps returned
HTTP 200. It never checked *which chain the apps were pointed at*. "The app is
serving" is not "the app is on the right chain" — the same distinction B0 makes
carefully for the indexer, not made for the apps.

Two harness changes close it:

- **`the apps under test are pointed at this fork, not a public RPC`** — new.
  Reads each dev server's own transformed `wagmi` module and requires
  `127.0.0.1:8545`, so it reflects what the running app was built with rather
  than what a file on disk currently says. Fails with a diagnosis, not a
  symptom.
- **`makeName`'s rule-6 oracle was tautological and is fixed.** It asserted
  `getByText(name)` on `/$name` — which passes even when the app cannot resolve
  the name, because the profile header echoes the route param. It now asserts
  the **owner address**, which the app can only know by reading the chain. This
  is §11's tautological-oracle trap, in the suite built to catch that class; it
  was green throughout the bad run. Post-fix it takes 9.3s instead of 4.2s,
  because it is now doing real work.

Harness: **11 passed** against the corrected environment. Full portal re-run in
flight; see iteration 8 for the real numbers.

**Standing lesson:** a harness gate is only worth what its weakest oracle is.
One tautological assertion in it made the entire suite unable to detect that
both apps were talking to the wrong chain.

---

## Iteration 7 — 2026-08-12 · ~~LOOP STOPPED — escalating~~ **(diagnosis void — see 7a)**

**Batch:** reprice the ledger against a real run. Full portal suite,
`--reporter=json`, fed to `pnpm e2e:coverage --results`.

**Result:** the ledger's terminal count was **inflated by 58%**, and both apps'
write paths are blocked in this environment.

```
                     static   observed
  HW  harness           5        5
  R0  irreversible      6        4
  R1  financial         2        2   (manager-side, not in this report)
  R2  authorization    26        5
  R3  display           1        1   (manager-side, not in this report)
  R4  resilience        0        0
  TOTAL                40       17
```

Run: 61 tests, **17 passed · 41 failed · 3 skipped**, 2.0h, single worker.
Report kept at `/tmp/portal-results.json` (288 KB, not committed). Reproduce
with:

```
pnpm exec playwright test --config=projects/portal/playwright.config.ts \
  --reporter=json --workers=1 > /tmp/portal-run.log 2>&1
pnpm e2e:coverage --results /tmp/portal-results.json
```

### The 41 failures are one shape, not 41 bugs

Every test that **passed** is a negative or read-only assertion. Every test that
**failed** drives a write through a UI form, and fails on a form control that
never appears.

Passing portal tests, in full: *refuses to change the resolver without
ROLE_SET_RESOLVER* · *shows no role holders once the name has expired* · *gives
an approved operator the blended role set* · *shows no role holders for a name
that is only reserved* · *does not offer subname creation without
ROLE_REGISTRAR* · *refuses to transfer an expired name* · *does not offer
transfer for a name with CANNOT_TRANSFER burnt*. Plus all 10 harness tests.

Failing locators, top of the distribution:

| n | locator |
|---|---|
| 12 | `getByPlaceholder('ENS name or address')` |
| 5 | roles table — `h3` "parent registry roles" → following rows |
| 4 | `getByLabel('Type', { exact: true })` |
| 3 | `getByRole('link', { name: 'Transfer' })` |
| 2 | `getByRole('button', { name: 'Add user' })` |
| 2 | `locator('#label')` |

Spanning `transfer`, `roles`, `subnames`, `records`, `resolver` — five spec
files, many distinct controls. So not a single drifted selector, but a single
*class*: **the portal's connected/write UI does not mount here, while read-only
and guard paths render fine.**

Note the harness `wallets` test passes, and it asserts the portal header shows
the injected account — so some connection state exists. Whatever is broken sits
between "header knows the account" and "owner-gated forms render". Not triaged
further; that is an app/env question, not test debt, and it is the same class as
the manager's connect blocker from iteration 4.

### The ratchet is doing its job, and it is blocking a correction

`pnpm e2e:coverage --results …` now **fails**:

```
Ratchet regression (baseline may only increase):
  ✗ R0: terminal 6 → 4
  ✗ R2: terminal 26 → 5
```

That is correct behaviour. It also means the repo is in an uncomfortable state
worth naming: **the truthful invocation fails and the flattering one passes.**
Plain `pnpm e2e:coverage` still reports 40/300 and exits 0, because static mode
means "a test exists and a config runs it".

**I did not lower the baseline.** Lowering it is a scope change (§12) and the
honest reading is ambiguous in a way only a human can settle:

- if the portal write UI is *broken*, the tests are fine and the environment is
  the blocker — the baseline should stand and the work is to fix the env;
- if the portal write UI *changed*, the tests are stale and 21 R2 rows plus 2 R0
  rows should genuinely return to not-started.

Guessing either way corrupts the ledger. **Parked: owner sugh01, expires
2026-08-19.**

### Why the loop stopped

Goal §16.4, *No progress*: iterations 6 and 7 both closed with no increase in
terminal count. That is the stop condition, and unlike the earlier bootstrap
iterations it is not covered by §16.6's carve-out — `HW*` did not move either.

Continuing would mean authoring scenario tests against an environment where no
write flow completes. I could not verify any of them, and unverifiable tests
committed as coverage is precisely the failure mode this goal exists to prevent
(§16.5: *claiming a passing run it did not observe*).

### What is needed to restart, in priority order

1. **Portal write UI** — 41 failures, one class. Blocks R0 `F*`, R2 `C*`/`D*`/
   `E*`. Nothing else in the ledger is worth more.
2. **Manager connect flow** — `VITE_FF_USE_EOA=false` (iteration 4). Blocks
   every manager scenario. Flipping it restarts your dev server, which is why I
   did not.
3. **Ratchet ruling** — stand or lower, per the ambiguity above.
4. **`0x640294a2…` identity** (iteration 2) — one address, two contract names.
   Blocks trusting any `GR*` result.
5. **`makeV1Name` registrar** (iteration 4) — blocks all 61 `G*` rows. Proven,
   citable, and `test.fail()`-pinned so it goes red the moment it is fixed.

Work that remains reachable *without* any of the above, if the loop restarts and
you want progress meanwhile: the missing harness modules — **HW4** time-presets,
**HW7** cross-app fixture, **HW8** transaction-ids, **HW9** fault-injection,
**HW10** premigration. Each is a batch and each moves the ledger honestly.

### State at stop

- Bootstrap **B0–B4 complete** (B4's R2 slice audited by measurement rather than
  by reading, which is stronger evidence than the audit would have produced).
- Harness gates green on both projects; address gate green.
- Ledger: static 40/300, **observed 17/300**. Invariant sites 0/32.
- `docs/e2e-spec-audit.md` holds the per-spec verdicts.

---

## Iteration 6 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 **B4** — audit the inherited specs. R0 slice:
`portal/tests/transfer.spec.ts`, scenarios F1–F5 and F7.

**Result:** 5 KEEP · 1 STRENGTHENED · 0 DEMOTE (of 6 audited)

- Terminal: **40 → 40**. Ratchet unchanged, deliberately — see below.
- Audit record: **`docs/e2e-spec-audit.md`** (new). That file, not this one, is
  the durable per-spec verdict.

**In flight:** nothing.

### FINDING — the terminal count overstates what actually passes

The reconciler's default evidence mode is **static**: `PASS` means "a committed,
non-skipped test exists and a project config runs it", *not* "it passed". Its
own report header says so.

Running F1 to verify the strengthening below produced **three failures**, all
`TimeoutError` on `locator.click` / `locator.fill` at the Transfer link and the
recipient field. Pre-existing, not caused by the audit: iteration 3 verified the
same locator family failing at `transfer.spec.ts:687` under `--no-deps` with no
harness running, and the error *type* rules out the new assertion (an
`expect().toBe()` fails as an assertion error, never as a locator timeout).

So **R0's six terminal rows are static claims for tests that fail when run.**
Nobody should read `R0 6/83` as six working transfer scenarios.

**Do this before trusting any tier number:** run the portal suite with
`--reporter=json` and feed it to `pnpm e2e:coverage --results <file>`. That
converts static PASSes into run-verified ones and shows how much of the 40 is
real. I did not do it this iteration — it is a full portal suite run and a batch
of its own.

I did **not** lower the ratchet. Demoting on this evidence would be a scope
change (§12), and the honest reading is that the ledger is behaving exactly as
documented while the *mode* is too weak. Escalating rather than guessing.

### Audit verdicts — R0 / transfer

| # | Verdict | Why |
|---|---|---|
| F1 | **STRENGTHENED** | postcondition was text-only; chain `ownerOf` added |
| F2 | KEEP | `assertLacksRoles(owner, [ROLE_CAN_TRANSFER_ADMIN])` — rank 1, exactly the catalogue oracle |
| F3 | KEEP | text-only, but the catalogue's oracle *is* the copy — §4 rank 6 expressly permits it |
| F4 | KEEP | `assertRoleBitmap(owner, [])` + reason string |
| F5 | KEEP | `ownerOfName` chain read after the attempt |
| F7 | KEEP | `assertRoleBitmap` both parties, before and after — exemplary |

**F1's fault:** its final postcondition ran through `expectOwnerOnNamePages()`,
which asserted ownership purely as rendered text — verbatim §4's own example of
what does not count. `ownerOfName()` was already defined thirty lines above and
used by exactly one test. Fixed additively (rule 1: never weaken); the helper is
shared, so untagged transfer tests gained it too. **Unverified** — see above.

### Learned — do not re-derive

- **Grep-based auditing systematically under-reports chain assertions.** I
  nearly filed F2 as a finding because my pattern omitted `assertLacksRoles`.
  Chain reads here almost always hide behind domain-named helpers —
  `assertRoleBitmap`, `assertLacksRoles`, `ownerHasRole`,
  `readResolverAndSubregistry`, `driveTransactionsToSuccess`. Read the body; if
  you must grep, build the pattern from the file's imports.
- **A tag-shaped string in a comment is a latent false claim.** Iteration 1's
  untagging comment contained the literal `@scenario:GU4`, and my own file-level
  grep counted it as coverage. The reconciler did *not* — it only attributes
  tags within 6 lines after a `test(` declaration, and the comment sits before
  it — so no false claim ever reached the ledger. Defused anyway; it was one
  refactor from becoming real.
- `pnpm e2e:coverage --no-list` reports `Terminal 7/300`, not 40. That is the
  flag working: it skips the config query, so nothing is "run by" anything and
  everything reads as `excluded`. Do not mistake it for a regression.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (iteration 4).
- **New:** whether to demote statically-passing rows whose tests fail when run —
  owner **sugh01**, expires **2026-08-19**. Needs the `--results` run first.

### Skipped-blocked

All manager-side scenarios (connect blocker, iteration 4). The portal transfer
UI flow now also looks broken — scope unknown beyond F1 and `:687`.

### Next

**B4 continued — the R2 block.** 26 of the ledger's 40 terminal rows are R2 and
rest on four portal files: `roles.spec.ts` (C1–C12, 10 tags), `subnames.spec.ts`
(D1–D6), `resolver.spec.ts` (E3, E6–E8, E10, E11), `records.spec.ts` (E1, E2,
E4, E5). That is the largest single block of unaudited inheritance and the
biggest lever on whether 40 is a real number.

Cheaper and higher-value first, if you only do one thing: the `--results` run
described above. It reprices the whole ledger in one pass.

---

## Iteration 5 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 **B0** (prove the environment) + **HW6**
(`fixtures/panoptes.ts`). **B0 complete.**

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 40**. **HW 4 → 5.** Ratchet raised.
- Portal harness 10 tests, two consecutive green runs. Manager harness 4 passed
  / 1 skipped. Address gate green.

**In flight:** nothing.

### Why this batch, and a note on the anti-stall rule

Four iterations had run with terminal stuck at 39. §16.6 permits that during
bootstrap **but explicitly says `HW*` is what should move meanwhile** — and it
had not. That is the anti-stall rule biting for real, not a false alarm. This
batch was chosen to satisfy both: B0 needs a verified indexer, HW6 *is* that
verification made permanent, so the check cannot decay into a stale comment.

### B0 — PASSED

Every mapped key in `infra/panoptes/contracts.json` equals
`ensL1Contracts[sepolia]`: `ens_registry` (legacy), `base_registrar`,
`eth_registrar_controller`, `public_resolver`, `reverse_registrar`,
`name_wrapper`, `eth_registry` (V2), `migration_helper`,
`locked_migration_controller`, `unlocked_migration_controller` — 10/10. The
indexer is watching what the apps talk to. Now asserted by
`assertManifestMatchesConfig()`, run on every harness pass.

Unmapped manifest keys are each accounted for in a comment in `panoptes.ts`
rather than silently skipped (`root_registry` is not exposed by ensjs;
`registry_datastore` is vestigial; the `l2_*` are L2; `*_block` are block
numbers).

**Note when mapping:** the manifest's `ens_registry` is the **V1/legacy**
registry (ensjs `ensLegacyRegistry`); V2 is `eth_registry` (ensjs
`ensRegistry`). Mapping `ens_registry → ensRegistry` produces a false mismatch —
I hit it on the first pass.

### FINDING — Panoptes accepts broken queries and answers them plausibly

Three separate behaviours, all HTTP 200, all with no `errors` array. Measured
2026-08-12 against the running instance:

| Query | Response | Consequence |
|---|---|---|
| `{ thisFieldDoesNotExist { id } }` | `{"data":{"thisFieldDoesNotExist":null}}` | a typo, or a field Panoptes later renames, silently becomes "no data" |
| `events(bogusArg: 1, first: 1)` | 10+ rows | unknown argument dropped — **and it took `first` with it** |
| `events(first: 1, where: {blockNumber: 999999999})` | same row as unfiltered | a `where` clause it does not understand is ignored, so a filtered query returns the unfiltered set |
| `__schema { queryType { fields { … } } }` | `queryType: {name}` only, plus `mutationType`/`subscriptionType`/`types` unasked-for | it does not honour selection sets on `__schema`; it serves a canned payload |

This is the **INV4 confident-negative defect through a door that needs no
misconfiguration at all** — B0 can pass, the manifest can be perfect, and a
query with a drifted field name still returns a plausible empty. The goal's
field guide has "indexer success-with-zero-rows" as a *misconfiguration* trap;
this is the same outcome from ordinary schema drift.

Defences, both in `fixtures/panoptes.ts` and both asserted in the harness:

1. `query()` throws when any top-level field resolves to `null`. A valid list
   field returns `[]`, never `null`, so a null top-level field reliably means
   "this field does not exist".
2. `assertQueryFields(field, args)` introspects the real schema and throws on an
   unknown field or an unknown argument. Call it once per query shape before
   trusting a result — the server will never tell you.

**Consequence for INV4's 8 sites:** any of them written with a hand-guessed
field or filter name would silently pass. Use `assertQueryFields` first.

### Learned — do not re-derive

- **Panoptes GraphQL is at `:5655/graphql`.** `/`, `/health`, `/subgraph` all
  404. Iteration 4's handoff said :5655; the path is `/graphql`.
- Introspect via `__schema { types { name fields { … } } }` and find the root
  type by name. Asking for `queryType { fields }` returns no fields, per the
  table above.
- `helpers/indexer-sync.ts`'s internal `query` **swallows** transport and
  GraphQL errors and returns `null` — correct for polling, catastrophic for
  asserting. `fixtures/panoptes.ts` is the asserting counterpart; they are
  deliberately opposite and both are right for their job. Do not merge them.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (iteration 4).

### Skipped-blocked

Every manager-side scenario, on the connect blocker. Unchanged.

### Next

**Bootstrap is done except B4.** B0 ✅, B1 ✅, B2 ✅, B3 ✅.

1. **B4 — audit the ~16 inherited specs** against §5. Do not count any of them
   as coverage until then; that is the explicit instruction in §1. Start with
   `projects/manager/playwright.config.ts`'s
   `testIgnore: /temporaryPremium|migration|notification/`, a live instance of
   trap #6 (config exclusion) and the source of the `A11` reconciler warning.
2. Then the first real scenario batch: **R0 portal-side** — `F` transfer (14
   rows) and `I` fuses (6). `G` (61) stays blocked on the V1 fixture.

Other harness rows still missing modules, each worth a batch when its tier needs
it: HW4 `time-presets`, HW7 `cross-app fixture`, HW8 `transaction-ids`, HW9
`fault-injection`, HW10 `premigration`.

Infra: Anvil ✅ :8545, manager ✅ :3000 (not e2e-connectable), portal ✅ :3001,
panoptes ✅ :5655/graphql, indexed head within 50k blocks of chain head.

---

## Iteration 4 — 2026-08-12

**Batch:** BOOTSTRAP · extend the harness gate to the manager project —
`specs/harness-manager.spec.ts`.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ratchet unchanged. Invariant sites 0/32.
- 5 tests: **4 passed, 1 skipped**, two consecutive runs. Wired as a blocking
  dependency of `manager-e2e`.
- Portal harness re-verified green (7 passed). Address gate green.

**In flight:** nothing.

### FINDING — the `makeV1Name` blocker is now proven, precisely and citably

The rule-6 test fails exactly as predicted, and the diagnosis is no longer
inference:

- `makeV1Name` registers into `V1_BASE_REGISTRAR` = `0x64096092…`
  (`fixtures/makeV1Name.ts:61`).
- The migration code resolves `ensBaseRegistrarImplementation` through ensjs =
  `0x57f1887a…`, at **`apps/manager/src/features/migration/contracts/addresses.ts:14`**
  and **`packages/migration/src/service/preflightChecks.ts:13`**. Same story for
  `ensNameWrapper` at lines 18 and 17 of those files.
- Both registrars are deployed and live on the fork (asserted, so the diagnosis
  cannot silently rot).
- So registration succeeds and **the app cannot see any name this fixture
  makes**. Existing migration specs paper over it with a V1-subgraph route mock,
  which answers for a name the chain-reading half cannot find — that is why the
  suite above it stayed green for weeks.

Encoded as **`test.fail()`**, not skipped, so it *executes* every run:
- while the fixture is broken → the assertion fails → `test.fail()` passes;
- the moment someone rewires it → the assertion passes → Playwright reports
  "expected to fail but passed" → **red**, which is precisely when a human
  should look, because that is when the 61 `G*` rows unblock and the annotation
  must come off.

`makeV1Name`'s **rule 5 passes** — it genuinely registers into the registrar it
targets. The fault is only ever "wrong registrar", not "does nothing". Worth
knowing before anyone starts rewiring.

### BLOCKER — the whole `manager-e2e` project cannot run

`connectWithHeadlessWallet` (`helpers/manager-auth.ts:92`) waits 15s for a
Connect button the manager does not render under `VITE_FF_USE_EOA=false` in
`apps/manager/.env` — Para-embedded has no wagmi client for the headless
provider to attach to.

**Verified not caused by this batch**: `profile.spec.ts:113 "shows validation
errors for invalid records"` fails at the identical line under `--no-deps`, with
no harness project running. This blocks *every* manager-side rule-6 check and
every manager scenario, not just this file.

Not fixed here on purpose: flipping that flag restarts the owner's dev server
and changes which wallet path the app runs. That is their call, not a test-side
infra fix. Recorded as **blocked-env, owner sugh01, expires 2026-08-19**, and
the one affected test is `test.skip()`'d at its declaration with the reason at
the site.

### Learned — do not re-derive

- **`test.skip(true, …)` inside a test body does not work when the test uses a
  fixture.** Fixtures resolve *before* the body runs, so the in-body skip is
  reached only after the fixture has already thrown — the test fails instead of
  skipping. Use the static form `test.skip('title', fn)`, which takes no
  message, so the reason has to live in a comment.
- **`test.fail()` vs `test.skip()` mean different things and both are legitimate
  here.** `fail` keeps the test executing against a correct assertion whose
  current outcome is failure; `skip` is for blocked-env, and needs an owner and
  a date. Neither weakens an oracle — that distinction is what makes them
  allowed under §16.5.
- **The address gate caught one of my own violations this iteration**: a
  hardcoded zero-address literal in the new spec. Use viem's `zeroAddress`.
  Small, but it is the gate paying for itself two iterations after landing.
- V1 registration is a permanent fork write, so both `makeV1Name` tests are
  snapshot-wrapped — same reasoning as iteration 3's clock leak, since this file
  is also a project dependency.
- `ERC721.ownerOf` **reverts** on an unregistered token rather than returning
  zero. The helper catches it and returns `null`; a revert here is the answer,
  not an error.

### Parked

- `0x640294a2…` identity — owner **sugh01**, expires **2026-08-18** (iteration 2).
- Manager connect flow / `VITE_FF_USE_EOA` — owner **sugh01**, expires
  **2026-08-19** (this iteration).

Both need a human. Neither blocks portal-side work.

### Skipped-blocked

Every manager-side scenario, on the connect blocker above. R0's `F*` (transfer)
and `I*` (fuses) rows are portal-side and unaffected.

### Next

**B0 + B4, portal-side, then the first real batch.**

B2 is complete on both projects. Remaining bootstrap:

1. **B0** — Panoptes manifest vs `ensL1Contracts[sepolia]`. The API is on
   **:5655** (not 42069). This is the "success with zero rows" failure mode, and
   `INV4` has 8 sites waiting on it.
2. **B4** — audit the ~16 inherited specs against §5. Note
   `projects/manager/playwright.config.ts` carries
   `testIgnore: /temporaryPremium|migration|notification/`, which is a live
   instance of trap #6 (config exclusion) and explains the `A11` warning the
   reconciler still prints.

Then R0, portal-side only while the manager is blocked: **F** (transfer, 14
rows) and **I** (fuses, 6) are reachable; **G** (61) is not, on the fixture
above.

Infra: Anvil ✅ :8545, manager ✅ :3000 (serving, but not e2e-connectable),
portal ✅ :3001, panoptes-api ✅ :5655.

---

## Iteration 3 — 2026-08-12

**Batch:** BOOTSTRAP · goal §6 B2, second half — `specs/harness.spec.ts`.
**B2 is now complete.**

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. The suite carries no `@scenario:` tags — its subject is
  the fixtures, not the app. It moves the gate, not the ledger.
- Invariant sites: 0 checked. Ratchet: unchanged.
- **7 tests, two consecutive green runs** (12.0s, 12.0s), wired as a Playwright
  project dependency of `portal-e2e`, so red aborts the run.

**In flight:** nothing.

### What it covers

Each subject gets both halves — rule 5 (read the postcondition back
independently) and, where it applies, rule 6 (through the app's own read path).

| Subject | Rule 5 | Rule 6 |
|---|---|---|
| `makeName` | registered in the `.eth` registry, owned by the requested account, expiry in the future | the portal's `/$name` page renders it |
| `makeName` negative duration | the name really is expired at the current block | — |
| `makeSubname` | every level registered *in its stated parent registry*, owner matches, claimed subregistry actually attached, deepest owner holds a non-empty bitmap | — |
| `wallets` | three distinct, funded participants | the portal's header shows the injected account |
| `chain-snapshot` | `revert` actually undoes a registration | — |
| `time` | `increaseTime` moves `block.timestamp`, page clock follows, clock restored after | — |
| anvil | fork block > 1e6, `.eth` registry has bytecode at the address the apps' config names | — |

### Learned — do not re-derive

- **`ownerOf` needs `labelToCanonicalId(label)`, not `keccak256(label)`.** Note
  the registry ABI: `getStatus(uint256 anyId)` canonicalises internally,
  `ownerOf(uint256 id)` does not. Reading `ownerOf(keccak256(label))` returns
  **the zero address for a perfectly healthy name** — it looks exactly like "the
  fixture registered nothing". Idiom to copy: `transfer.spec.ts:65`.
- **`makeName`'s `owner` takes a portal *User* slot, not a `wallets`
  participant.** `wallets.ROLES` maps owner→user, manager→user2,
  stranger→user3; passing `'owner'` throws `User not found: owner`. Pair
  `makeName({owner:'user'})` with `wallets.account('owner')` — same account.
- **The portal header truncates to `0xf39…266`** — five leading characters, a
  U+2026 ellipsis, three trailing. A four-character prefix match finds nothing.
- **Three of my seven assertions were wrong on the first run**, and all three
  failed in ways that read as fixture or app faults rather than test faults.
  That is the argument for this suite existing, applied to itself: a harness
  gate written and never watched fail is worth nothing.

### The state leak this batch introduced, and closed

The first working version pushed the shared fork clock **+29 days per run**.
Because this project is a *dependency* of the whole portal suite, that is a
30-day jump before every run of everything.

Two separate causes, and the obvious one was not the culprit:

1. `time`'s explicit `increaseTime` — snapshotted and reverted. Suspected first.
2. **`makeName({duration: -1 day})` — the actual source.** The fixture
   implements "expired name" as *register for the 28-day minimum, then advance
   the clock past expiry*, so asking for an expired name costs ~29 days of fork
   clock, permanently. Harmless in a leaf spec; not harmless in a dependency.

Measured before/after each fix: **+29 days → +158 seconds** (block mining
only). Both are now snapshot-wrapped, and the `time` test *asserts* the restore
rather than assuming it.

**Generalisation worth carrying:** anything that runs as a project dependency
must be clock-neutral. The fork is at **2027-06-02** against a wall clock of
2026-08-11 — ~295 days ahead, accumulated by prior runs. Most of that predates
this batch; 90 days of it was mine before the fix.

### Not caused by this batch

`transfer.spec.ts:687 "rejects the zero address as a recipient"` fails —
`getByPlaceholder('ENS name or address')` times out on
`/$name/ownership/transfer`. **Verified pre-existing**: it fails identically
under `--no-deps`, with the harness project not running at all. Not triaged
further; it belongs to whoever takes the F-area batch. It is the only portal
test this iteration executed, so no claim is made about the other 57.

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. Unchanged
from iteration 2, and still blocking any trustworthy `GR*` result.

### Skipped-blocked

Nothing.

### Next

Two candidates; take the first.

1. **Extend the harness gate to the manager project.** `makeV1Name` and
   `makeV2Name` have no self-test, and `makeV1Name` is the fixture whose known
   fault (registering into a deployment the migration UI never reads) is the
   documented blocker on all 61 `G*` rows. A self-test there turns an
   undocumented weeks-long silent failure into an immediate red. Expect it to
   fail on the rule-6 half — that is the point, and the failure should be filed,
   not weakened. **Do not wire it as a blocking dependency while it is red**;
   put it in its own non-blocking project first, or the manager suite cannot
   run at all.
2. **B0 / B4** — Panoptes manifest vs `ensL1Contracts[sepolia]` (the API is on
   **:5655**, not 42069), then audit the ~16 inherited specs.

Then R0: **83 rows, 77 not-started**.

Infra this iteration: Anvil ✅ :8545, manager ✅ :3000, portal ✅ :3001,
panoptes-api ✅ :5655, mockestrator :3007, alto :4337.

---

## Iteration 2 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B2, first half — the rule-7 address-literal gate.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Terminal: **39 → 39**. Ledger untouched.
- Invariant sites: 0 checked.
- Ratchet: unchanged.
- New gate: `pnpm e2e:check:addresses`, wired into `.github/workflows/e2e.yml`
  ahead of the reconciler. **Green.**

**In flight:** nothing.

### FINDING — one address, two contradictory identities

`0x640294a2b2d87e7f522db3e3e3e876764bce170d` is declared as
**`V1_PUBLIC_RESOLVER`** in `fixtures/makeV1Name.ts:65` and as
**`DEDICATED_RESOLVER`** — a V2 resolver — in `fixtures/makeName.ts:57`. It
cannot be both.

Measured on the fork at block 11467283, 2026-08-11:

| | address | size | codehash |
|---|---|---|---|
| the disputed address | `0x640294a2…` | 15115 B | `0xd1d78319` |
| ensjs `ensPublicResolver` | `0x5239A812…` | 14001 B | `0x6cce3025` |
| ensjs `ensPermissionedResolverImpl` | `0x9EAe5C27…` | 17597 B | `0x7a5bbb7f` |
| V1 registry's resolver for `eth` | `0x18CB116a…` | 10700 B | `0x090b6561` |

It answers ERC165 / `addr` / multicoin `addr` / `text` / `contenthash` but not
`IExtendedResolver`, and **it does not appear anywhere in
`ensL1Contracts[sepolia]`**. So it is a third contract carrying two names, and
at least one of those names is wrong.

Not filed in `e2e-defects.md`: the reconciler requires a defect row to name a
scenario *and* have a failing test proving it, and this is a harness fault with
neither — filing it would trip the `defect-unproven` CI failure. It lives here,
in a comment at `makeName.ts:57`, and in the gate's allowlist with
`conflictAcceptedUntil: 2026-08-18`, owner **sugh01**. The gate goes red on that
date. Per §10 the ruling defaults to EXEMPT after 5 working days — but note that
an EXEMPT here would mean *accepting an unidentified resolver*, which is not a
real option; someone has to say which name is correct.

**Consequence: no `GR*` record-replay result can be trusted until this is
settled.** GR1/GR3/GR12 all turn on which resolver a V1 name is reported to
have. Do not spend an iteration on the GR batch before resolving it.

### What changed

- **`scripts/check-address-literals.ts`** — new. Two checks:
  1. *unaccounted literal* — a 20-byte hex literal with no allowlist entry;
  2. *conflicting binding* — one address bound to two identifier names, which is
     the drift incident itself. Waivable only with an owner and a date.
- **`helpers/mock-v1-subgraph.ts`** — was re-declaring `V1_PUBLIC_RESOLVER` and
  the NameWrapper address as its own literals. Now imports both from
  `makeV1Name.ts`, which is the single place the V1 deployment is pinned. This
  was the "same registry, three different addresses, three files" pattern in
  progress.
- **`.github/workflows/e2e.yml`** — the gate runs in the `coverage` job, before
  the reconciler.

### Learned — do not re-derive

- **Anchor the regex on both sides: `\b0x[0-9a-fA-F]{40}\b`.** Without the
  trailing `\b` it matches the first 40 characters of every 32-byte Anvil
  private key in the tree. That is the difference between 35 hits and 12, and
  it is why the "35 literals" number in iteration 1's handoff overstated the
  problem — the real count is 14 occurrences of 12 distinct addresses.
- **Detect the binding by looking back two lines, not one.** The formatter wraps
  `export const V1_PUBLIC_RESOLVER =` onto its own line. A line-local match
  found zero bindings in `makeV1Name.ts` and reported the tree clean — it missed
  the one conflict the gate exists to catch. First version of this gate was
  green and useless; a passing gate is worth nothing until you have watched it
  fail.
- **The gate must skip itself.** The allowlist necessarily contains every
  address it governs, so scanning it makes every entry conflict with its own
  subject (7 false conflicts).
- **`pnpm --filter @ens-apps/e2e lint` (`biome check`) already fails** on
  pre-existing issues across ~12 files. The gate is deliberately *not* chained
  behind it with `&&` — it would never run. It is its own script and its own CI
  step.
- **Gate self-test, actually run:** planted an unaccounted literal → exit 1;
  planted a second name for `V1_ENS_REGISTRY` → exit 1 naming both sites; clean
  tree → exit 0. Both violation classes reproduce.
- The 12 accounted-for addresses split into: 2 Anvil dev EOAs, 2 placeholder
  sentinels, 1 canonical cross-chain deployment (Multicall3), 4 pinned-V1-
  deployment contracts, 1 HCA account derived outside the e2e dependency graph,
  1 ENSIP-25 identifier, and the disputed resolver above. 13 occurrences across
  8 files.
- **Known limit of this gate.** It enforces *every literal is accounted for* and
  *no address wears two names*. It does **not** catch a file re-declaring an
  address another file already exports, when both use the same name — that is
  legal under both checks. Biome's unused-import warning is what caught exactly
  that here: the first version of the `mock-v1-subgraph.ts` deduplication
  imported `V1_NAME_WRAPPER` but left the literal in place, so only the resolver
  half landed. If a third check is ever wanted, it is "an allowlisted address
  appears in a file that is not its declaring module".

### Parked

`0x640294a2…` identity — owner **sugh01**, expires **2026-08-18**. See above.

### Skipped-blocked

Nothing.

### Next

**B2, second half — `e2e/specs/harness.spec.ts`.** Not started; nothing is
half-applied. It is the higher-value half (it defends the fixture-invisible-to-
the-app class that cost weeks of confidently wrong results) and it is a batch on
its own because it needs live infra and browsers, where the address gate needed
neither.

Each fixture asserts (a) its own postcondition by read-back and (b) that the app
can see the state through the app's own read path — rules 5 and 6. Subjects, in
dependency order: `makeV2Name`, `makeSubname`, `makeName`, `wallets`,
`chain-snapshot`, `time`, `makeV1Name` (expected red — see its header comment;
it registers into a registrar the migration UI never reads, which is the known
blocker on all 61 `G*` rows). This suite must run first and red must abort the
run.

Infra was up and healthy this iteration: Anvil at block **11467283**, manager
and portal both 200. `pnpm e2e:infra:up` did not need re-running.

After that: B0 (fork block + Panoptes manifest vs `ensL1Contracts[sepolia]`) and
B4 (audit the ~16 inherited specs). Then R0 — **83 rows, 77 not-started**, with
the `G*` matrix at zero and blocked on the V1 fixture, so per §16.3 the unblock
outranks any batch inside the tier.

---

## Iteration 1 — 2026-08-11

**Batch:** BOOTSTRAP · goal §6 B1 + B3 — rebuild the ledger against
`e2e-test-catalogue.md` and stand up Track B.

Not a scenario batch. The bootstrap gate in the skill's Step 1 was open: the
ledger held 179 rows on the superseded P0–P6 phase model, the catalogue defines
~295 on the R0–R4 risk-tier model, and `invariants.ts` did not exist. Per goal
§16.6 this is expected — the terminal count does not move during bootstrap, and
that is not stalling.

**Result:** PASS 0 · DEFECT 0 · EXEMPT 0 · PRODUCT-GAP 0 (no scenarios worked)

- Registry: **179 → 300 rows** (290 scenarios + 10 `HW*` harness).
- Terminal: **39 → 39**. Deliberately unchanged — every re-bucketed row kept
  exactly the evidence it already had. Verify with
  `pnpm e2e:coverage`: `Terminal overall: 39/300`.
- Invariant sites: **0 → 32 registered**, 0 checked.
- Ratchet: rekeyed from phases to tiers, seeded from the observed run
  (`HW 4 · R0 6 · R1 2 · R2 26 · R3 1 · R4 0`). The old P0–P6 numbers are frozen
  in `baseline.json:phasesLegacy` as an audit trail.

**In flight:** nothing.

### What changed

`e2e/coverage/scenarios.ts`
- Added `Tier` (`HW · R0 · R1 · R2 · R3 · R4`) derived from the id prefix via
  `AREA_TIER`, overridable per row. `phase` is retained for traceability to the
  superseded master plan but is **no longer the ratchet key**.
- Rebuilt area **G** from flat `G1–G27`/`GB1–GB8` (35) into the catalogue's
  `GW · GS · GR · GM · GA · GU` (61). The old numbering conflated wrap level with
  fuse burn and had no slot for the record-kind matrix (`GR4–GR7`) where the
  INV2 conservation findings live. Old ids are carried in `planId`.
- Added the catalogue's missing rows: A22–A25, B15–B18, C15–C17, D15–D18,
  E16–E21, F9–F14, I6, J8–J9, K11–K12, L5–L6, X11–X16.
- Added the seven new suites: **N** notifications (12), **Y** payments (7),
  **R** resolution (10), **S** search (7), **T** token (6), **U** shell (9),
  **Z** DNS/TLD (5).

`e2e/coverage/invariants.ts` — new. INV1–INV5 with 32 sites. A site is claimed
by `@inv:INV1-transfer-plan`, and the reconciler derives its status from exactly
the evidence it derives a scenario's PASS from.

`e2e/coverage/reconcile.ts` — rolls up by tier, sweeps invariant sites, ratchets
on both, fails on an unknown `@inv:` tag as it already did on an unknown
`@scenario:` tag.

### Learned — do not re-derive

- **Terminal count is 39 and the arithmetic checks out.** HW 4 + R0 6 + R1 2 +
  R2 26 + R3 1 = 39, matching the pre-rebuild P0 4 + P1 26 + P2 2 + P5 7. If a
  future run reports fewer, something was lost, not re-bucketed.
- **Ids that meant different things in the two documents.** The catalogue won
  every time; the displaced row moved to its new suite. **None of them were
  tagged**, so no coverage moved with them:

  | Superseded plan | Now | Catalogue's meaning for that id |
  |---|---|---|
  | B10 auto-renewal toggles | **Y6** | B10 = bulk renew pricing |
  | B14 four branches *+ syncWrapper* | B14 / **B15** | split; B15 = syncWrapper |
  | B15 continuity bonus | **B16** | B16 = bonus at day 61 and 63 |
  | H4 search | **S1** | H4 = dashboard role-derived columns |
  | H8 primary name | **R1** | H8 = recent-activity feed |
  | H9 fwd/rev mismatch | **R5** | H9 = empty states |
  | H10 token page | **T1** | H10 = expiry rendering per locale |
  | H11 TLD page | **Z1** | H11 = profile owned by a contract/HCA |
  | J7 notifications | **N1–N12** | J7 = HCA deployment on first use |
  | K3–K7 | K4–K8 | K3 is new: indexer up-but-stale, zero rows |
  | K8 back/forward | **U7** | K8 = two tabs, conflicting writes |
  | K9 deep link disconnected | **U6** | K9 = double-click, one transaction |
  | L2 axe *+ keyboard* | L2 / **L3** | split; L3 = keyboard-only |
  | L3 mobile → L4, L4 perf → L5 | | L6 is new: locale number/date formatting |

- **`GA11` and `GA12` are not in the catalogue.** They carry the superseded
  plan's G14 (`NameDataMismatch`) and G15 (`notReserved`) forward, because
  deleting a scenario is a scope change (§12) and neither was ruled on. The
  catalogue's totals table was corrected to 61 for G / 290 overall to match.
- **Two migration tests were untagged, not retagged.** `migration-premium.spec`
  "migrate active name" (was `@scenario:G16`) and `migration.spec` "can edit
  profile after migration" (was `@scenario:G24`). Both were already `excluded`
  — no config runs them — so no terminal state was lost. Neither meets its
  candidate row's oracle: the first asserts only `assertV2Registered` where GW3
  also requires "not unwrapped" + WrapperRegistry-as-subregistry; the second
  asserts a "Profile updated" toast where GU4 requires reading the records back
  off the new resolver. A comment in each names the row and what is missing.
  Tagging either as-is would have been a partial tag (§16.5).
- **B2's backlog is measured: 35 hex address literals across 17 files** under
  `e2e/{fixtures,helpers,projects,specs,scripts}`. That is what the rule-7 grep
  gate has to clear before it can be turned on red.

### Parked

Nothing. No ruling was needed this iteration.

### Skipped-blocked

Nothing. No batch was skipped.

### Next

**Bootstrap B2 — harness integrity gates.** It is the last open bootstrap item
and the skill's Step 1 keeps the gate closed until it lands:

1. `e2e/specs/harness.spec.ts` whose *subject is the fixtures* — each fixture
   asserts its own postcondition by read-back **and** that the app can see the
   state through its own read path (rules 5–6). This suite runs first and red
   aborts the run. It is what makes `HW1`–`HW10` terminal, so it moves the
   ledger as well as the gate.
2. The rule-7 address-literal grep as a CI check, over the 35 literals above.
   Derive from `ensL1Contracts[sepolia]` through one generated file.

Then B0 (prove the environment: fork block, Panoptes manifest vs
`ensL1Contracts[sepolia]`, both apps load) and B4 (audit the ~16 inherited
specs) before any scenario batch. After that, R0 selection is unambiguous:
**83 rows, 77 not-started**, and the migration matrix inside it is at zero and
blocked on the V1 fixture — so per §16.3 the unblock outranks a batch inside the
tier.
