# WEB-1829 — Transfer subnames in unemancipated registries: QA test plan

PR: [#1391 Transfer subnames in unemancipated registries with unsafeTransfer](https://github.com/ensdomains/apps-monorepo/pull/1391) (merged 2026-10-19, `6e960f2f5`)
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/transfer.spec.ts` → `Portal name transfer — subnames` → `unemancipated subregistry (WEB-1829, #1391)`
Branch: `e2e/portal-bigname`. These tests need the explorer to read bigname (#1354). See [Results](#3-results) for why.

## 1. Change surface

| File | Role |
|---|---|
| `features/transfer/queries/getIsRegistryEmancipated.ts` (new) | Reader: `isEmancipated()` on the name's registry, through the wallet client |
| `features/transfer/hooks/useTransferName.ts` | Reads it fresh with the token id at prepare, sets `isSafeTransferRefused = hasRemainingRoleHolders \|\| !isEmancipated` |
| `features/transfer/utils/buildTransferPlan.ts` | Planner: `transfer-token-unsafe` when `isSafeTransferRefused` (was: only when other accounts hold roles on the name) |
| `features/transfer/utils/buildTransferStepIntent.ts` | Comment only |

**Bug:** `PermissionedRegistry._update` refuses `safeTransferFrom` with
`TransferUnsafeUntilRegistryIsEmancipated()` (`0x54838f98`) while any account
holds a root role on the registry. Measured on the fork: a subregistry deployed
with `attachSubregistry` is unemancipated and refuses `safeTransferFrom` for
**every** subname in it, including when the sender is the deployer.
`unsafeTransfer` succeeds. The `.eth` registry is emancipated. Before the fix,
the explorer refused all of these at preflight with "The transfer itself would
fail, so nothing was sent."

## 2. Automated coverage

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| `moves a subname in a subregistry its parent owner still holds root roles on, with unsafeTransfer (ticket repro)` | Ticket shape: `user2` owns the parent and deployed the subregistry (`isEmancipated() == false`, root roles held); the connected wallet owns `sub` and holds none. No refusal; step `transfer-token-unsafe`; the mined tx's selector is `unsafeTransfer`; `getOwner` is the recipient; the parent owner's root roles are unchanged | **FAIL**: refusal shown (`toHaveCount(0)`, got 1) | pass |
| `moves the same subname with safeTransferFrom once the parent owner gives up its root roles (control)` | Same shape after `revokeRootRoles(FULL, user2)` (`isEmancipated() == true`): step `transfer-token`, selector `safeTransferFrom`. The switch follows the contract, not "is a subname" | pass (guard) | pass |
| `still refuses a recipient contract that cannot receive the token, and moves nothing` | Unemancipated registry, Multicall3 recipient: refusal shown, no dialog, owner unchanged, no tx sent to the subregistry. `unsafeTransfer` still runs the ERC-1155 receiver hook | pass (guard) | pass |
| F15 `transfers a subname, moving the token in the parent subregistry…` | Step id updated to `transfer-token-unsafe` (the deployer-is-sender shape) | **FAIL**: dialog never opens (preflight refusal) | pass |
| F19 `offers no resolver detach for a subname that only inherits…` | Same update | **FAIL**: same | pass |
| F20 `detaches only the subname own resolver on a defaults transfer…` | Same update, two-step plan (`detach-resolver`, `transfer-token-unsafe`) | **FAIL**: same | pass |
| E2E-010 (`test.fail()`) | Same update; still a known defect | expected fail | expected fail |

Unit: `useTransferName.strand.test.tsx` (test-branch only) now mocks
`getIsRegistryEmancipated` like the PR's own hook tests do. The PR's hook test
covers the planner branch with the read mocked.

Helpers: `transferTxId` accepts `'transfer-token-unsafe'`; `PortalFixtures` is
exported from the portal fixture.

## 3. Results

Run 2026-10-19 on `e2e-tests-coverage` + `e2e/portal-bigname` (#1354 at
`1bb1a14dd`) + #1391, with real local bigname (`E2E_MOCK_INDEXER=false`,
`E2E_EXPLORER_INDEXER=bigname`, `VITE_BIGNAME_API_URL=http://127.0.0.1:5660`
in both apps' `.env.local`).

- Subname blocks: 26 pass on the PR build. Pre-fix: the repro, F15, F19 and F20 fail as above.
- Full `transfer.spec.ts`: 67 pass, 11 fail. The same 11 fail identically on the pre-fix build (see the handoff). None are subname tests.
- Unit (`src/features/transfer`): 207 pass, 1 expected fail. Portal and e2e typecheck: pass.
- **Against Panoptes the tests can't run.** On `e2e-tests-coverage` the local Panoptes image lists ~850 bogus root holders, so the explorer disables "Transfer name" for every V2 name.
- **With `E2E_MOCK_INDEXER=true` (CI) the three new tests fail the same way**, because the mock doesn't serve the explorer's bigname root-role read. That's why the repro isn't tagged `@smoke`.

## 4. Manual test plan

### Setup
```sh
docker compose -f e2e/infra/docker-compose.yml --profile bigname up -d
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
echo 'VITE_BIGNAME_API_URL=http://127.0.0.1:5660' > apps/portal/.env.local
pnpm --filter portal dev   # :3001, VITE_USE_MOCK_WALLET=true for browser QA
```

### Seeding
A parent owned by someone else, plus a subname you own in its subregistry:
```sh
OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name
```
Then, as `user2`, deploy and attach a subregistry and register `sub` to
`0xf39F…2266`. `e2e/fixtures/makeSubname.ts` has `attachSubregistry` and
`registerSubname`, which the spec's `makeSubnameUnder` wraps. Check
`cast call <subregistry> "isEmancipated()(bool)"` returns `false`.

### Steps
1. Open `/sub.<parent>.eth/ownership/transfer` as `0xf39F…2266`. **Pass:** the parent-authority warning shows and the form is enabled.
2. Enter an EOA recipient and click Transfer name. **Pass:** the transaction modal opens with no "The transfer itself would fail" message.
3. Confirm. **Pass:** `getOwner` is the recipient, and the tx input starts with `0x` + the selector of `unsafeTransfer(address,uint256,bytes)`.
4. Repeat 1–2 with recipient `0xcA11bde05977b3631167028862bE2a173976CA11`. **Pass:** "The transfer itself would fail…" shows and no modal opens.
5. As `user2`, call `revokeRootRoles(0x1111…1111, user2)` on the subregistry, then transfer a second subname. **Pass:** `isEmancipated()` is `true` and the tx is `safeTransferFrom`.
6. Transfer any `.eth` 2LD. **Pass:** the tx is `safeTransferFrom`, which is unchanged.

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| U-F1 | High (fixed by #1391) | Before the fix, no subname in a user-deployed subregistry could be transferred from the explorer, whoever the sender. The ticket's shape was one case of this |
| U-F2 | Low (test debt) | The e2e mock indexer doesn't answer the explorer's bigname root-role read, so every V2 transfer test is disabled under `E2E_MOCK_INDEXER=true` on the bigname branch. That covers these three, F41 and F42 |
