# WEB-1469: Missing-privilege warnings — QA test plan

PR: [#1311 feat(portal): warn when a name's owner is missing token privileges](https://github.com/ensdomains/apps-monorepo/pull/1311)
App: **portal** (`apps/portal`, `http://localhost:3001`)
Specs: `e2e/projects/portal/tests/roles.spec.ts` (describe "Portal name roles — missing-privilege warnings (WEB-1469)"), plus the PR's own unit tests

---

## 1. Change surface

| File | Role | Change |
|---|---|---|
| `features/roles/utils/missingPrivileges.ts` (new) | Rules | `getTransferWarning` (no `ROLE_CAN_TRANSFER_ADMIN` → *cannot-transfer*; any other account holding roles → *cannot-transfer-safely*). `getResolverWarning` / `getSubregistryWarning`: owner holds neither the role nor its `_ADMIN` → *locked* (both missing); holds only the role → *cannot-grant* (admin missing); holds the admin → nothing. A subregistry equal to the derived WrapperRegistry is exempt. |
| `features/roles/hooks/useTokenRoleWarning.ts` (new) | Reader | Resolves the name's versioned EAC resource (`getVersionedResourceQueryOptions`), then reads its role holders with the Roles tab's query. ENSv2 only; off while the name is in grace. |
| `features/registry/utils/wrapperRegistry.ts` (new), `packages/smart-account/src/wrapper-registry.ts` (new) | Derivation | `computeWrapperRegistryAddress`: the CREATE2 chain from `LockedMigrationController`, moved out of the manager's `computeExpectedWrapperRegistry` (which now calls it). |
| `features/roles/components/PrivilegeWarnings.tsx`, `PrivilegeWarningBadge.tsx` (new) | UI | Red badge, reason in a tooltip on a focusable trigger. |
| `features/registry/components/v2/UnconfiguredRegistry.tsx` (new) | UI | A never-configured slot shows a red "No registry configured / Subregistry is locked. Missing …" notice instead of the configure form, unless the connected wallet holds `ROLE_SET_SUBREGISTRY` itself. |
| `routes/$name/ownership/index.tsx`, `NameOwnerRow.tsx`, `Owner.tsx` | Wiring | "Cannot transfer" / "Cannot transfer safely" next to the V2 owner. |
| `routes/$name/resolver.tsx` | Wiring | "Resolver locked" on the Contract row and on the "no resolver set" panel. |
| `RegistryTreeItem.tsx` | Wiring | "Subregistry locked" on the name's own configured subregistry row; the empty slot goes through `UnconfiguredRegistry`. |

**The gap a user reaches:** an owner who has lost token roles (revoked by mistake, or via a past bug like WEB-1487) sees nothing on Ownership, Resolver or Registry. A transfer then reverts (`TransferDisallowed`, or `TransferUnsafeWithMultipleAssignees` when someone else holds roles). On the Registry tab the owner gets a disabled "Configure registry" with "You need the Set Subregistry role… Ask an admin to grant it", though nobody can grant it back.

**What the PR's own tests don't reach:** the role read itself (the component tests mock `getNameRolesAccountsQueryOptions`); real revocations; the badges on the real routes; a delegate who really holds `ROLE_SET_SUBREGISTRY`; and whether the derived WrapperRegistry matches what a real locked migration deploys on this chain.

---

## 2. Automated coverage

**Local workarounds (test code only):**
- Local Panoptes answers `RoleChangeEvents` with `null`, which the reader can't recover from. `useNodeForRoleEvents` aborts that one query, so the app reads role logs from the node, as in an indexer outage.
- Anvil forwards the pre-fork part of that `eth_getLogs` upstream. When the upstream errors, the app's retry can come back `[]` with no error (Finding 1). `gotoWithCleanRoleRead` watches the page's own role reads and reloads any load in which one errored. It never retries a clean read.

Oracles, all on chain:
- `roles(resource, account)` through `accountHasRoles`
- a simulated `safeTransferFrom` by the owner (token id read back via `getState`, since a revoke re-mints it)
- a simulated `setResolver` by the owner
- `getSubregistry(label)`

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| `flags "Cannot transfer" once the owner loses ROLE_CAN_TRANSFER_ADMIN, and the registry agrees the transfer reverts` (`@smoke`) | Disconnected visitor. Control: a fresh 2LD shows no badge and its transfer simulates. After the owner revokes `ROLE_CAN_TRANSFER_ADMIN`, the transfer reverts on chain, and the owner row shows "Cannot transfer" with tooltip "Missing token ROLE_CAN_TRANSFER_ADMIN". | **FAIL** on the badge | pass |
| `flags "Cannot transfer safely" while another account holds roles on the token, and clears it once they hold none` | Connected as a stranger (someone else's name). With user2 holding Set Resolver, the owner still holds the transfer role and a plain transfer reverts `0x677f1c18`; the row shows "Cannot transfer safely" (not "Cannot transfer") with the "Another address holds roles on this token" tooltip. After the grant is revoked, the transfer simulates and both badges are gone. | **FAIL** on the badge | pass |
| `flags "Resolver locked" next to the resolver contract when only the admin role is gone, naming just that role` | Control: no badge. After revoking only `ROLE_SET_RESOLVER_ADMIN`, `setResolver` by the owner still simulates; the Contract row shows "Resolver locked" with tooltip exactly "Missing token ROLE_SET_RESOLVER_ADMIN". Ownership on the same name stays clean (the badge is scoped to its role). | **FAIL** on the badge | pass |
| `flags "Resolver locked" on the "no resolver set" panel when the owner can never set one` | Resolver set to `0x0`, then both resolver roles revoked; `setResolver` reverts. The "This name does not have a resolver set." panel shows the badge with tooltip "Missing token ROLE_SET_RESOLVER and ROLE_SET_RESOLVER_ADMIN". | **FAIL** on the badge | pass |
| `replaces "Configure registry" with a locked notice when the owner holds neither subregistry role` | Connected owner. Control: the form is offered. After revoking both subregistry roles (slot still `0x0`), the red notice "Subregistry is locked. Missing ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN" replaces it and no "Configure registry" button is left. | **FAIL** on the notice | pass |
| `keeps "Configure registry" for a delegate who holds ROLE_SET_SUBREGISTRY when the owner holds neither` | User2 holds `ROLE_SET_SUBREGISTRY` on chain, the owner holds neither. As the owner: locked notice, no form. Switched to user2: the form stays, no notice. | **FAIL** on the owner's notice (the delegate half is a guard) | pass |
| `flags "Subregistry locked" on a configured subregistry once the owner holds neither subregistry role` | A real UserRegistry attached via `attachSubregistry`. Control: no badge. After revoking both subregistry roles, the row (`permissioned registry 0x…`) shows "Subregistry locked" with both roles in the tooltip. This placement was covered by unit tests only in the PR. | **FAIL** on the badge | pass |
| `raises nothing for a locked migrated name: its subregistry is the WrapperRegistry the migration deployed` | **Guard.** `makeMigratedName({ type: 'locked' })` through the real `MigrationHelper`. On chain: non-zero subregistry, the owner holds neither subregistry role, holds the transfer role, and the transfer simulates. No "Subregistry locked" on Registry, and no transfer badge on Ownership. On the PR build this fails if `computeWrapperRegistryAddress` stops matching the deployed wrapper on Sepolia. | pass (guard: no badges exist) | pass |
| `suppresses every privilege warning while the name is in grace, and brings them back once the owner renews it` | Owner revokes all five roles. Active: Cannot transfer, Resolver locked and the locked registry notice all show (positive control). One day past expiry: the chain moves the name to a new resource version and the owner's `safeTransferFrom` reverts `TransferDisallowed`; the profile shows "This name has expired… grace period ends on…", and no warning appears on the profile, Ownership, Resolver or Registry. Renewed through the portal's own Extend modal (approve + renew): the resource returns, the revoked roles stay revoked, the transfer still reverts, and all three warnings are back. | **FAIL** on the active-state badge | pass |
| `raises nothing for a fully privileged name once it is renewed from grace, though the resource it is read under moved and moved back` | **Guard.** Fresh name, Ownership opened while active. In grace the chain reports no roles under the new resource version; in-app Ownership shows no warning. Renewed through Extend: the original resource and the full role set are back and the transfer simulates. Ownership (which must have read the roles), Resolver and Registry raise nothing, and "Configure registry" is offered. Fails on the PR build if the warning reads the grace-era resource (no logs under it, so "owner holds nothing"). | pass (guard) | pass |

**Negatives:** every absence check waits for the page's own role read and a positive sign that the page loaded (owner row, Contract row, registry row, or the configure button). It then settles 2s before asserting. The same tests render the badge from the same read on the same page well inside that window.

**Grace, measured on the fork.**

| Stage | `getResource(labelhash)` | Owner's roles | Owner transfer | Portal |
|---|---|---|---|---|
| Active | `…00000000` | full set | simulates | normal tabs |
| Grace (expiry + 1 day) | `…00000001` | `0` | reverts `TransferDisallowed` (`0xe58f6d5a`) | profile: "This name has expired"; Ownership, Resolver and Registry: "Name not registered" |
| Renewed | `…00000000` | the pre-expiry set | as before expiry | normal tabs, after a reload (Finding 5) |

**Mutation check.** Removing the grace gate from `useTokenRoleWarning` (enabled regardless of grace, warning not cleared) leaves the grace test green. On v2 the routes already render "Name not registered" in grace, so the badge components never mount; the gate is defence in depth, reachable only if a route renders an owner in grace. The tests pin the user-facing outcome.

**The grace tests move the shared anvil clock** forward about 29 days each (expiry of a 28-day registration plus a day). There is no snapshot revert: `evm_revert` permanently breaks Panoptes (see `fixtures/chain-snapshot.ts`).

**Not covered by e2e:**
- **ENSv1 names:** the badge prop is V2-only in `NameOwnerRow`, and that's unit-tested.
- **"Cannot grant" on Subregistry:** same rule as Resolver, unit-tested.

---

## 3. Results

Build: PR head `cb15fffa2` merged onto `e2e-tests-coverage` (`e495cf2da`). Pre-fix: the PR's 13 non-test files under `apps/portal/src` and `packages/smart-account/src` restored to `e2e-tests-coverage` (new files removed), with Vite hot-reloading.

| Check | PR build | Pre-fix |
|---|---|---|
| New WEB-1469 e2e (10) | 10/10 | 8 **FAIL**, each on its badge/notice assertion; the locked-migration and renewal guards pass |
| PR unit tests (portal roles/registry/ownership/routes: 272; smart-account `wrapper-registry`: 6; manager migration service: 587) | all pass | n/a |
| `pnpm typecheck` (portal, manager, smart-account, e2e) | clean | n/a |
| `biome check` on PR files and the spec | no new warnings | n/a |
| Full `roles.spec.ts` (24, before the grace tests) | 17 passed (all 8 WEB-1469 at the time), 7 failed | n/a |
| `pnpm test:portal-smoke` (18) | 13 passed (incl. the new `@smoke`), 5 failed | F10 re-run: fails the same way |

None of the failures involve #1311. They are the same sets the [WEB-1487 plan](./roles-remove-user-web1487-test-plan.md#3-results) records on `main`:
- **The 7 roles tests** (C1, C4, C5, C11, C12, the E2E-009 C1, the WEB-1418 second revoke) read the table without the Panoptes workaround.
- **4 transfer smoke tests** (F10, F41, F42, WEB-281) never get an enabled Transfer button. F10 fails identically on the pre-fix build.
- **The registration name-switch smoke test.**

The full `roles.spec.ts` run includes C7, which time-travels past expiry, so the shared anvil clock ends about 29 days ahead. That doesn't affect these tests (each seeds its own name).

Screenshots (1440×900): `before-1-transfer-ownership`, `after-1-transfer-ownership` (tooltip open), `before-2-registry-locked`, `after-2-registry-locked`, `after-3-delegate-configure`, `after-4-locked-migrated-registry`.

**First pass (2026-10-06, PR head `b83350da1`):** the PR didn't build. `useTokenRoleWarning` still passed `name` to `getNameRolesAccountsQueryOptions`, which takes `resource` since #1216. Portal typecheck failed with TS2353, and so did the PR's own CI. `cb15fffa2` fixed it by resolving the versioned resource first.

---

## 4. Manual plan

### Setup

Local Panoptes can't answer the roles query, so run the portal behind the indexer proxy from [the WEB-1487 plan, Appendix A](./roles-remove-user-web1487-test-plan.md#appendix-a-indexer-only-proxymjs). The portal then reads roles from the chain.

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator panoptes-indexer panoptes-api
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
node indexer-only-proxy.mjs    # :5656 → Panoptes :5655, 503 for RoleChangeEvents
cd apps/portal && VITE_USE_MOCK_WALLET=true \
  VITE_INDEXER_GRAPHQL_URL=http://127.0.0.1:5656/graphql pnpm dev
```

The mock wallet connects as `0xf39F…2266` (the owner). If a badge appears that the chain doesn't support, reload once: see Finding 1.

### Seeding

```sh
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name     # prints <name>; <label> is it without .eth
REG=0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4; RPC=http://127.0.0.1:8545
OWNER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; USER2=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
RES=$(cast call $REG "getResource(uint256)(uint256)" $(cast keccak <label>) --rpc-url $RPC | awk '{print $1}')
revoke() { cast send $REG "revokeRoles(uint256,uint256,address)" $RES $1 $2 --private-key $OWNER_PK --rpc-url $RPC; }
grant()  { cast send $REG "grantRoles(uint256,uint256,address)"  $RES $1 $2 --private-key $OWNER_PK --rpc-url $RPC; }
```

Role bits:

| Role | Hex |
|---|---|
| `ROLE_CAN_TRANSFER_ADMIN` | `0x1000000000000000000000000000000000000000` |
| `ROLE_SET_RESOLVER` | `0x1000000` |
| `ROLE_SET_RESOLVER_ADMIN` | `0x100000000000000000000000000000000000000` |
| `ROLE_SET_SUBREGISTRY` | `0x100000` |
| `ROLE_SET_SUBREGISTRY_ADMIN` | `0x10000000000000000000000000000000000000` |

Use a fresh seeded name for each section; revoking is one-way for the owner. Check roles with `cast call $REG "roles(uint256,address)(uint256)" $RES $OWNER --rpc-url $RPC`. Re-read `$RES` is not needed after a revoke, but the token id is (see the WEB-1487 plan's `getState` command).

### A. Cannot transfer (disconnected)

1. Open `/<name>/ownership` with the wallet disconnected. **Pass:** the owner `0xf39F…2266` has no red badge.
2. `revoke 0x1000000000000000000000000000000000000000 $OWNER`, then reload. **Pass:** a red **Cannot transfer** badge follows the owner. Hovering or tabbing to it shows "Missing token ROLE_CAN_TRANSFER_ADMIN".

### B. Cannot transfer safely

1. On a fresh name, `grant 0x1000000 $USER2`. Open `/<name>/ownership`. **Pass:** **Cannot transfer safely**, tooltip "Another address holds roles on this token". No "Cannot transfer".
2. `revoke 0x1000000 $USER2`, reload. **Pass:** no badge.

### C. Resolver locked

1. On a fresh name, `revoke 0x100000000000000000000000000000000000000 $OWNER` (admin only). Open `/<name>/resolver`. **Pass:** **Resolver locked** on the Contract row, tooltip exactly "Missing token ROLE_SET_RESOLVER_ADMIN". `/<name>/ownership` has no badge.
2. On another fresh name, `revoke 0x100000000000000000000000000000001000000 $OWNER` (both). **Pass:** tooltip "Missing token ROLE_SET_RESOLVER and ROLE_SET_RESOLVER_ADMIN".

### D. Registry, never configured

1. On a fresh name, open `/<name>/registry` connected as the owner. **Pass:** the "No registry configured" panel with the **Configure registry** button.
2. `revoke 0x10000000000000000000000000000000100000 $OWNER`, reload. **Pass:** a red panel "No registry configured / Subregistry is locked. Missing ROLE_SET_SUBREGISTRY and ROLE_SET_SUBREGISTRY_ADMIN", and no Configure registry button.
3. Delegate: on another fresh name, `grant 0x100000 $USER2` first, then the revoke from step 2. As the owner: the locked panel. Switch the wallet to user2 (manual browser wallet, or `VITE_USE_MOCK_WALLET` off): **Pass:** Configure registry is offered.

### E. Registry, configured

1. On a fresh name, use **Configure registry** and complete it. **Pass:** the name's row shows `permissioned registry 0x…` with no badge.
2. `revoke 0x10000000000000000000000000000000100000 $OWNER`, reload. **Pass:** **Subregistry locked** next to that row, with both roles in the tooltip.

### F. Locked migrated name (exemption)

1. `npx tsx e2e/scripts/seed-transfer-names.ts` and open the **locked** name it prints, on `/registry`. **Pass:** a `permissioned registry 0x…` row with no **Subregistry locked** badge, although `roles` shows the owner has no subregistry role.
2. Its `/ownership`. **Pass:** no badge.

### G. Grace (moves the shared anvil clock about 29 days)

1. On a fresh name, `revoke` all five roles (sum of the five bits, or one `revoke` each). Check A, C and D show their warnings.
2. Read the expiry and warp one day past it:
   ```sh
   EXP=$(cast call $REG "getState(uint256)((uint8,uint64,address,uint256,uint256))" $(cast keccak <label>) --rpc-url $RPC | tr -d '()' | awk -F', ' '{print $2}' | awk '{print $1}')
   NOW=$(cast block latest -f timestamp --rpc-url $RPC)
   cast rpc evm_increaseTime $((EXP - NOW + 86400)) --rpc-url $RPC && cast rpc evm_mine --rpc-url $RPC
   ```
   Reload the page so the browser picks up the chain time.
3. Open `/<name>`. **Pass:** "This name has expired" and "The grace period for this name ends on …". Open Ownership, Resolver, Registry. **Pass:** no red badge and no locked notice anywhere.
4. On `/<name>` press **Extend**, then **I Understand**, **Next**, **USDC**, **Confirm**, and complete both transactions. Reload, then open Ownership, Resolver, Registry. **Pass:** the warnings from step 1 are back.
5. Repeat 2–4 on a fresh name with no revokes. **Pass:** no warning at any step, and Registry offers Configure registry after renewal.

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | Medium | **An incomplete role read turns into a red warning.** The badges treat "no holders read" as "the owner holds nothing", while a *failed* read renders nothing. On the local fork, anvil forwards the pre-fork part of the node `eth_getLogs` upstream. When that errors (`query block range exceeds server limit`, then `pruned history unavailable`), the app's retry gets `result: []` with no error, and a locked migrated name whose owner holds `ROLE_CAN_TRANSFER_ADMIN` (transfer simulates) showed **Cannot transfer**. Reproduced on 1 of 3 fresh migrated names in one probe run, and once more in an earlier probe. The same read feeds "Resolver locked" and "Subregistry locked". The trigger here is the fork, but in production the node fallback (taken whenever the indexer errors) has the same shape against a pruned or rate-limited RPC. A registered v2 name always has at least one role log (the registration grant), so an empty holder set could be treated as "unknown" rather than "owner holds nothing". The e2e tests detect and reload such loads (`gotoWithCleanRoleRead`). |
| 2 | Resolved | `b83350da1` didn't build: `useTokenRoleWarning` passed `name` where #1216 expects `resource`, so the read would have thrown and every badge would have stayed hidden. The PR's unit tests mocked the read and stayed green. Fixed in `cb15fffa2`. |
| 3 | Info | `useTokenRoleWarning` runs the versioned-resource read for ENSv1 names too (only the role read is gated on ENSv2). Harmless, but it's one wasted RPC per V1 page. |
| 4 | Info (test design) | An owner who revokes its own `_ADMIN` can no longer revoke the matching role (`0xa604e318`), so the admin-only and both-missing states can't be reached in sequence on one name. The e2e tests use one name per state. |
| 5 | Medium (pre-existing, not #1311) | **After renewing from grace, the portal keeps showing the name as unregistered until a reload.** Straight after a successful Extend in grace (chain expiry already in the future), the profile shows "Name not found / Could not retrieve info", and in-app Ownership still shows "Name not registered" 20 seconds later; a reload shows the name correctly. Reproduced the same on the pre-#1311 build. For this PR it means the warnings come back only after a reload. The grace tests load each tab fresh after renewal for that reason. |
| 6 | Info | The PR's grace gate in `useTokenRoleWarning` is unreachable on v2 today: the routes render "Name not registered" in grace, so no badge mounts (mutation check above). Harmless; worth knowing if the routes are changed to show an owner in grace, because the grace-era resource has no role logs and every badge would fire without the gate. |
