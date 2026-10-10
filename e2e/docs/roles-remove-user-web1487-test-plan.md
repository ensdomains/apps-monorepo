# WEB-1487: Remove user keeps the transfer role — QA test plan

PR: [#1269 fix(roles): stop Remove user freezing a name it can't unfreeze](https://github.com/ensdomains/apps-monorepo/pull/1269) (Immunefi #92542, Medium)
App: **portal** (`apps/portal`, `http://localhost:3001`)
Specs: `e2e/projects/portal/tests/roles.spec.ts` (describe "Portal name roles — Remove user keeps the transfer role (WEB-1487)"),
`apps/portal/src/features/roles/hooks/useRemoveUserPlan.test.ts`, and the PR's own `utils/removeUserPlan.test.ts`

---

## 1. Change surface

| File | Role | Change |
|---|---|---|
| `utils/removeUserPlan.ts` (new) | Planner | `buildRemoveUserPlan` splits a row's roles into `rolesToRevoke`, `frozenRoles` (`ROLE_CAN_TRANSFER_ADMIN` on the owner's row or on its last holder), `unauthorizedRoles` (no effective `_ADMIN` for them) and `lockoutRoles` (revoked, but no other admin on the name or at root). |
| `hooks/useRemoveUserPlan.ts` (new) | Reader | Reads the caller's roles on the name by normalised label, and the registry root's holders. The union of the two is the caller's effective admin set. Root holders' admin roles are counted as restorable, and unread root holders count as unknown. |
| `components/RemoveUserConfirmDialog.tsx` (new) | UI | Names the exact roles being revoked. Shows a destructive alert for lockouts and a warning when the transfer role is kept or roles can't be revoked. |
| `components/RolesSidebar.tsx` | Writer | Revokes `plan.rolesToRevoke` instead of the raw role list. Remove user is disabled when nothing is revocable. |
| `components/RolesTable.tsx` | Wiring | Passes the name's holder map to the sidebar. |

**What a user can reach:** Roles → parent registry / roles → Edit user roles on any row → **Remove user**. Pre-fix, doing that on the owner's own row of a fresh `.eth` 2LD revoked `ROLE_CAN_TRANSFER_ADMIN` along with everything else. `PermissionedRegistry._update` checks that role on the owner, and nobody can grant it back, so the name could never be transferred again.

**What the PR's own tests don't reach:** the role set the registrar really grants, the caller and root-holder reads, the bitmap the revoke actually encodes, and whether the registry still lets the owner transfer afterwards.

---

## 2. Automated coverage

**Local workaround (test code only).** Local Panoptes answers `eacRolesChangeds` with `null`, which the roles reader can't recover from. `useNodeForRoleEvents` aborts that one query, so the app reads role logs from the node, as it would during an indexer outage. Every log is the chain's.

Oracles:
- `roles(resource, account)`, read through `assertRoleBitmap`
- a real `safeTransferFrom` from the owner, using the token id read back with `getState` (the revoke re-mints the token)
- `getState().latestOwner`

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| e2e `removing the owner's own row keeps Can Transfer, and the name can still be transferred` (`@smoke`) | The report's repro. The dialog says transfer permission is kept and flags the sole-admin lockout. After Remove, the owner holds exactly `ROLE_CAN_TRANSFER_ADMIN`, so the other four roles really were revoked. The owner can then transfer the name, and the recipient becomes `latestOwner`. | **FAIL** on `assertRoleBitmap`: missing `ROLE_CAN_TRANSFER_ADMIN` (both soft dialog checks also fail) | pass |
| e2e `removing another holder's row revokes everything they hold, and leaves the owner alone` | Guard and positive control. A non-owner row with Set Resolver and Set Subregistry is fully revoked, nothing is held back, and the owner's bitmap is unchanged. | pass (guard) | pass |
| unit `useRemoveUserPlan.test.ts` (7) | The owner's row never encodes the transfer role. The caller is read by normalised label. Root-only admin authority makes a role revocable, and a role the caller has no admin for is held back. A root holder of the same admin clears the lockout. Unread root counts as unknown, not empty. An unnormalisable label or no wallet revokes nothing. | n/a (hook added by the PR) | pass |
| unit `removeUserPlan.test.ts` (17, the PR's own) | Planner buckets, including last-holder and owner-unknown. | n/a | pass |

**Pre-fix confirmation on chain.** The pre-fix run left `roles-rm-owner-1791202760.eth` with no roles. A `safeTransferFrom` by its owner then reverts `TransferDisallowed(tokenId, owner)` (`0xe58f6d5a`): the name is frozen, exactly as reported.

**Mutation checks (PR build, one line at a time):**

| Mutation in `useRemoveUserPlan.ts` | Caught by |
|---|---|
| Drop the root-holder half of `callerAdminRoles` | unit "counts admin roles the caller holds only at the registry root" |
| Treat root holders as read before the query succeeds | unit "treats unread root holders as unknown, not empty" |

The e2e tests can't reach the `unauthorizedRoles` and non-owner `last-holder` branches on this deployment. An owner can't grant `_ADMIN` roles per name (`EACCannotGrantRoles`), so no delegated admin or second transfer-role holder can be built. Those branches are covered by the unit tests only.

---

## 3. Results

**Final, on `main` (2026-10-05).** Built from `origin/e2e-tests-coverage` merged with `origin/main`, so it includes #1269 (`8466def50`) and #1251. Pre-fix means the PR's `RolesSidebar.tsx` and `RolesTable.tsx` checked out from `8466def50^1`.

| Check | PR build | Pre-fix |
|---|---|---|
| New WEB-1487 e2e (2), no resource workaround | 4/4 with `--repeat-each 2` | owner-row test **FAIL** on the bitmap (`ROLE_CAN_TRANSFER_ADMIN` missing); guard pass |
| New `useRemoveUserPlan.test.ts` (7) | 7/7 | n/a |
| Portal unit tests, `src/features/roles` + `src/features/registry` | 195 passed | n/a |
| `pnpm typecheck` (portal, e2e) | clean, after updating `useTransferName.strand.test.tsx` to #1251's `startTransfer` and `buildTransferStepIntent` signatures | n/a |
| Full `roles.spec.ts` | 24 passed, 7 failed | C4 re-run: fails the same way |
| `pnpm test:portal-smoke` | 11 passed, 5 failed | F10 re-run: fails the same way |

None of the failures involve #1269's code.
- **The 7 roles tests** (C1, C4, C5, C11, C12, the E2E-009 C1, and the WEB-1418 second revoke) read the table without the Panoptes workaround, so they show "Error fetching role accounts".
- **4 transfer smoke tests** (F10, F41, F42, WEB-281) never get an enabled Transfer button. The likely cause is #1251's role-holder check, which reads the same role events; that hasn't been traced. Nothing on the transfer path imports #1269's files.
- **The registration name-switch test** also failed before #1251 merged.

**First pass, before #1251 was on the branch.** PR head `8e685506c` merged onto `e2e-tests-coverage` (`a6a7153d3`). The new e2e tests needed a second workaround for the since-fixed Finding 1, and gave the same pass/fail split: 6/6 PR, owner-row **FAIL** pre-fix. Full `roles.spec.ts` gave 24 passed and 7 failed, and smoke 15 passed and 1 failed, both the same on pre-fix.

Screenshots (1440×900): `before-1-owner-confirm`, `before-2-owner-after-remove`, `after-1-owner-confirm`, `after-2-owner-after-remove`, `after-3-other-holder-confirm`.

---

## 4. Manual plan

### Setup

Local Panoptes can't answer the roles query (see §2), so run the portal behind a small indexer proxy that refuses it. The portal then reads roles from the chain.

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator panoptes-indexer panoptes-api
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
node indexer-only-proxy.mjs    # script in Appendix A: :5656 → Panoptes :5655, 503 for RoleChangeEvents
cd apps/portal && VITE_USE_MOCK_WALLET=true \
  VITE_INDEXER_GRAPHQL_URL=http://127.0.0.1:5656/graphql pnpm dev
```

The mock wallet connects as `0xf39F…2266` (the owner) without prompts. This setup was checked in a browser on `main` (`a6ab0e7f6`): a seeded name's roles page lists the owner with Can Transfer, Set Resolver and Set Subregistry.

### Seeding

```sh
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name    # prints <name>; <label> is it without .eth
REG=0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4; RPC=http://127.0.0.1:8545
RES=$(cast call $REG "getResource(uint256)(uint256)" $(cast keccak <label>) --rpc-url $RPC | awk '{print $1}')
# part B only: grant user2 Set Resolver (0x1000000), signed by the owner
cast send $REG "grantRoles(uint256,uint256,address)" $RES 0x1000000 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url $RPC
```

Check any account's roles, and whether the owner can still transfer:

```sh
cast call $REG "roles(uint256,address)(uint256)" $RES 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url $RPC
TID=$(cast call $REG "getState(uint256)((uint8,uint64,address,uint256,uint256))" $(cast keccak <label>) --rpc-url $RPC | tr -d '()' | awk -F', ' '{print $4}' | awk '{print $1}')
cast call $REG "safeTransferFrom(address,address,uint256,uint256,bytes)" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0x000000000000000000000000000000000000dEaD $TID 1 0x \
  --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --rpc-url $RPC
```

A fresh owner's `roles` read is `0x1110000000000000000000000000000001100000` in hex (`cast to-base <n> 16`). From the left, the three `1`s are Can Transfer (admin), Set Resolver (admin) and Set Subregistry (admin); the `11` near the right is Set Resolver then Set Subregistry. Re-read `TID` after any revoke, because a revoke re-mints the token.

The `safeTransferFrom` simulation only succeeds while the owner is the sole holder. With a second holder it reverts `TransferUnsafeWithMultipleAssignees` (`0x677f1c18`), which is unrelated to this PR.

### A. The owner's own row (fresh name, no second holder)

1. Open `/<name>/roles`. **Pass:** the owner row `0xf39F…2266` lists Can Transfer, Set Resolver and Set Subregistry.
2. Click Edit user roles on that row, then **Remove user**. **Pass:** the dialog says "This revokes Set Resolver, Set Resolver (admin), Set Subregistry, Set Subregistry (admin) from 0xf39F…2266 on <name>". Can Transfer isn't in the list.
3. **Pass:** a red alert reads "No other account is admin for Set Resolver (admin), Set Subregistry (admin)… nobody can grant them back".
4. **Pass:** a yellow alert reads "Transfer permission is kept. This account is the last one holding it…".
5. Press **Cancel**. **Pass:** no transaction modal; the `roles` read is unchanged.
6. Repeat step 2 and press **Remove**, then complete the transaction. **Pass:** the `roles` read is `0x1000000000000000000000000000000000000000` in hex (Can Transfer admin only, bit 156). The `safeTransferFrom` simulation succeeds.

### B. Another holder's row (name with user2 granted Set Resolver)

1. Open `/<name>/roles`. **Pass:** two rows.
2. Click Edit user roles on `0x7099…79C8`, then **Remove user**. **Pass:** the dialog names only "Set Resolver", with no "Transfer permission is kept" alert and no red alert.
3. Press **Remove** and complete it. **Pass:** user2's `roles` read is `0`; the owner's is unchanged.

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | Withdrawn | First reported as a High bug on `main`: the roles table showed "No role holders yet" for every plain 2LD, because since #1216 it read role logs under the raw labelhash rather than the registry's id. #1251 (`ee751db53`) had already fixed it on `main`; the verification branch was cut before #1251 merged. Confirmed on the same seeded name: `ee751db53^` shows the empty state, `main` lists the owner. The tests no longer route around it. |
| 2 | Low | `useRemoveUserPlan` reads the caller's roles by normalised **label**, while the sidebar's rows and its revoke use the resolved **resource id** (#1216). They agree for plain names. For a `[<64 hex>]` label, ensjs would read the digits' id instead, so the caller would likely look like it has no admin and Remove user would be disabled. That's read from the code, not exercised. It would fail safe, but it's inconsistent with WEB-1458; passing `resource: resourceId` would line them up. |
| 3 | Low (test infra) | The confirm dialog's closed `dialog-content` stays mounted briefly after **Remove**, alongside the transaction modal, so `driveTransactionsToSuccess`'s strict `[data-slot="dialog-content"]` locator throws. The tests wait for it to detach. No user impact seen. |

---

## Appendix A: `indexer-only-proxy.mjs`

```js
// :5656 → Panoptes :5655. Answers 503 to the typed RoleChangeEvents query (which local
// Panoptes returns as null) so the portal uses its node fallback; forwards everything else.
import http from 'node:http'
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' }
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
  let body = ''
  for await (const chunk of req) body += chunk
  if (body.includes('RoleChangeEvents')) return res.writeHead(503, cors).end()
  const r = await fetch('http://127.0.0.1:5655/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  res.writeHead(r.status, { ...cors, 'content-type': 'application/json' }).end(await r.text())
}).listen(5656, () => console.log('indexer proxy :5656 → :5655'))
```
