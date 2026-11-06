# WEB-1484: role holders checked against the registry, QA test plan and report

PR: [#1313 fix(portal): page role history and verify role holders against the registry](https://github.com/ensdomains/apps-monorepo/pull/1313)
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/roles.spec.ts` (`role holders checked against the registry (WEB-1484)`)
Unit: `apps/portal/src/features/transfer/hooks/useTransferRoleRevocations.test.ts` (new)

---

## 1. What changed

A V2 name's role holders are a replay of its `EACRolesChanged` history, read
from the indexer first and from the node as a fallback. Before the fix, any
history the indexer answered was taken as complete. A short or empty one (from
indexer lag, missing rows or a resource mismatch) produced these symptoms:

- The roles page said **"No role holders yet"**, with no edit or revoke
  control for the holders it missed.
- The profile's **Role holders** counter showed the short count.
- The ownership page's **Managers** row disappeared, hiding a live grant.
- The transfer form offered no revoke step for the missed holder. The registry
  then refused the transfer because another account still held roles, and the
  owner was told *"The transfer itself would fail, so nothing was sent. If the
  recipient is a contract…"*.

Separately, a history longer than one 1,000-row indexer page skipped straight
to the slow node scan.

| File | Role | Change |
|---|---|---|
| `lib/roles/roleChangeLogs.ts` | reader | The indexed read pages by block (up to 10 pages within the 8s budget), dedupes by row `id`, and orders by block then log index. The indexed and node reads are exported separately, and the node read takes a `toBlock` |
| `features/roles/hooks/useNameRoleAccounts.ts` | validator | Pins a block and checks the replay against `roleCount(resource)` (the sum of every holder's bitmap) and `roles(resource, account)` (each holder's roles are a subset). On a mismatch it re-reads the node up to the same block. Returns `{ holders, isVerified }` |
| `NameRolesOverviewTable.tsx` | UI | Shows a warning when unverified, plus the table if anything was found. Never shows "No role holders yet" when unverified |
| `ProtocolVersionWithCounter.tsx` | UI | The counter shows `?` when unverified |
| `V2NameManagersRow.tsx` | UI | Says "Couldn’t check who else holds permissions on this name" when unverified and nobody else was found |
| `useTransferRoleRevocations.ts` | gate | An unverified list is an `error`, so the transfer form won't plan from it |
| `useTokenRoleWarning.ts` | consumer | Reads `.holders` |

---

## 2. Automated coverage

### How the indexer is set up

Local Panoptes can't answer the typed `RoleChangeEvents` query (it returns
`null`; see e2e memory "local Panoptes role events null"). Each test serves
that query itself, from **the chain's own logs for the name**, with rows
dropped or padded to build the history the bug needs. Served rows page the
way the indexer does: `blockNumber >= fromBlock`, in block order, cut at
`first`.

"Node down" means failing that resource's `eth_getLogs` on **every** endpoint.
The portal's transport is a viem `fallback`, so if only the `/rpc` proxy
fails, the read goes to Sepolia's public nodes. Those can't see the fork and
answer an empty history. Other calls in the same JSON-RPC batch get the real
answer.

The oracle is always the chain. The setup asserts the manager's
`ROLE_SET_RESOLVER` bitmap and that its grant log exists. The transfer test
reads `getOwner` and the manager's bitmap after the transfer. Node fallbacks
are counted from the page's own `eth_getLogs` requests, filtered to the
name's resource topic.

### e2e

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | an empty indexed history still lists every holder on chain (the report repro, disconnected) `@smoke` | **The report.** The indexer has nothing for a name with two on-chain holders. The disconnected roles page shows no "No role holders yet" and exactly the owner and manager rows, with no warning. The indexer was asked, and the mismatch sent the read to the node | FAIL: "No role holders yet" | pass |
| 2 | a grant the indexer hasn't caught up with is listed, with its edit control | The indexer has the registration's grants but not the manager's later one (lag). **Positive control:** the owner row is listed. The manager row is listed with "Set Resolver" and **Edit user roles**, with no warning, via a node read | FAIL: no manager row | pass |
| 3 | an empty indexed history with the node down shows a warning, never "No role holders yet" | Neither source can confirm anything. The warning shows, there's no "No role holders yet", and there's no table | FAIL: "No role holders yet" | pass |
| 4 | a short indexed history with the node down is flagged on the roles, profile and ownership pages | **Roles:** warning plus the owner row that was found. **Profile:** the Role holders counter reads `?`. **Ownership:** "Couldn’t check who else holds permissions on this name", and the missed manager isn't claimed | FAIL: no warning (list shown as complete) | pass |
| 5 | a live grant behind more than a page of role events is listed from the indexer, without the node | 1,000 older rows on the same resource (a throwaway account granted and revoked, two per block, ending revoked) come before the real rows. Both holders are listed, with no warning. The second indexer request starts at the first page's last block, so the two rows straddling it are re-read and deduped. **Zero** node reads | FAIL: one full page and no second request (then a node scan) | pass |
| 6 | the transfer form revokes a manager the indexer missed, and the transfer goes through | The indexer lacks the manager. **Revoke everyone else’s permissions** is offered (on) and names the manager. The detach, revoke and transfer steps all succeed. On chain, the recipient owns the name and the manager holds nothing | FAIL: no revoke step. The form showed "The transfer itself would fail…" | pass |
| 7 | with the list unconfirmed, the transfer form won't build a plan that might miss someone | Short indexer plus node down. The form says "Couldn’t check who else holds permissions on this name…", and **Transfer name** is disabled | FAIL: no such message (the short list was planned from as if complete) | pass |
| 8 | guard: a complete indexed history is verified without the node | The indexer serves the full history: both holders, no warning, zero node reads. It pins the node-read counter used by #5: an unrelated read would show up here | pass (guard) | pass |

### Unit (vitest)

The PR's own tests cover the reader (paging, ordering, a full single block,
the page budget) and the validator (verified, node fallback, node failure,
registry failure). Nothing covered the transfer gate, so this adds
`useTransferRoleRevocations.test.ts`:

| Test | What it proves |
|---|---|
| plans the revoke from a verified list | Positive control: a verified manager becomes a revocable grant |
| reports a verified list with no one else as ready and empty | Verified "nobody" is a real `ready` state |
| errors on an unverified list, even one naming a holder | It never plans from an unverified list |
| errors on an unverified list naming no one else, rather than reading as "nobody" | The case that would have handed the name over silently |
| stays pending while an unverified list is refetching | A refetch doesn't flash `error` |

Pre-fix, the hook took a bare `Map` and had no `isVerified` input, so these
tests check the new contract and have no pre-fix twin.

---

## 3. Results

Built from PR head merged onto `e2e-tests-coverage` (`4df274401`), on the
shared local stack. The anvil clock was ~1.7 years ahead of wall time, which
doesn't affect these EOA flows. Dev servers ran on `:3003` and `:3004`
because another checkout held `:3000` and `:3001`.

| Check | PR build | Pre-fix (the PR's 7 app files from `e2e-tests-coverage`) |
|---|---|---|
| WEB-1484 e2e (8 tests) | **8/8 pass**, ~40s | **7/8 FAIL**, each on the assertion that encodes the bug. The guard (#8) passes, as a guard should |
| `useTransferRoleRevocations.test.ts` (new) | 5/5 pass | n/a (new contract) |
| Portal vitest, touched dirs | 535 pass, 1 expected fail (56 files) | n/a |
| `pnpm typecheck`, portal and e2e | clean | n/a |
| `biome check`, PR files and these test files | clean. One existing `noNonNullAssertion` warning in `roles.spec.ts`, also on the base | n/a |
| Full `roles.spec.ts` (48) | 38 pass, 10 fail | The same 10 fail |
| `pnpm test:portal-smoke` (19) | 15 pass, 4 fail. The new `@smoke` test passes, 3.7s | The same 4 fail |

The 10 `roles.spec.ts` failures and the 4 smoke failures are all pre-existing,
and each fails the same way with the PR reverted:

- **C1, C4, C5, C11 and C12** look for a heading "parent registry roles". The
  page says "parent registry / roles", so those locators are stale on this
  branch.
- **Five WEB-1469 badge tests**, one of them `@smoke`, look for the owner
  as `0xf39F…2266`. That wallet now has a primary name (`e2e-muy1v9wu.eth`),
  so the page shows the name instead.
- **Registration name-switch (`@smoke`)** fails with "name A's flow kept
  prompting the wallet", the known headless-wallet issue.
- **F41 and F42 (`@smoke`)** fail at Transfer name enabled pre-fix. On the PR
  build, F41 gets further and fails on its own subname-count alert.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env      # VITE_USE_MOCK_WALLET=true for steps that need a wallet
pnpm --filter portal dev -- --port 3001
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name   # note the name it prints
```

Grant a second holder (Anvil account 1, `0x7099…79C8`) Set Resolver from the
roles page's **Add user**, or with ensjs `grantRoles`. Find the name's
resource:

```sh
cast call 0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4 "getResource(uint256)(uint256)" <labelToCanonicalId(label)>
```

Local Panoptes can't serve `RoleChangeEvents`, so the steps below put a proxy
on `:5656` in front of it and point `VITE_INDEXER_GRAPHQL_URL` at the proxy.
The proxy answers that one query and forwards everything else. Use DevTools
→ Network → *Block request URL* on the RPC hosts to take the node down.

### Steps

1. **Report repro.** The proxy answers `RoleChangeEvents` with
   `{"data":{"eacRolesChangeds":[]}}`. Open `/<name>/roles`, disconnected.
   **Pass:** no "No role holders yet". Both accounts are listed, there's no
   warning, and the console logs `Role holders fell back to the node …
   registry-mismatch`.
2. **Lag.** The proxy returns only the owner's registration row. Connect as
   the owner. **Pass:** the second holder's row is listed with Edit user
   roles.
3. **Node down, empty.** As step 1, and also block `eth_getLogs` to `/rpc`
   and to every public Sepolia RPC. **Pass:** the red "Couldn't confirm this
   list against the registry…" warning, no table, no "No role holders yet".
4. **Node down, short.** As step 2, with the node blocked. **Pass:** the
   roles page shows the warning plus the owner row. `/<name>` shows Role
   holders **?**. `/<name>/ownership` shows "Couldn’t check who else holds
   permissions on this name".
5. **Transfer, lag.** As step 2, then open `/<name>/ownership/transfer` and
   enter another address. **Pass:** "Revoke everyone else’s permissions" is
   on and names the second holder. Transfer: three steps succeed, and
   afterwards `roles(resource, 0x7099…)` is `0`.
6. **Transfer, node down.** As step 4, on the transfer form. **Pass:** the
   "Couldn’t check who else holds permissions…" message, and Transfer name is
   disabled.
7. **Healthy indexer (regression).** Remove the proxy rules. **Pass:** the
   roles page lists both holders without the warning, and with no
   `EACRolesChanged` `eth_getLogs` for the resource in Network.
8. **Sepolia, long history.** On a deployed build, pick a name with more
   than 1,000 role events on its resource, if one exists. **Pass:** more than
   one `RoleChangeEvents` request, each `fromBlock` equal to the previous
   page's last block, and no node scan.

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Low | **When both sources disagree with the registry, the node's list wins outright.** `getNameRolesAccounts` returns the node replay even when the indexed replay found holders the node didn't. Seen locally: the indexer served the owner's grants and the node answered an empty history. The page then showed the warning with **no** table rows, although the indexer had the owner. The result is flagged unverified and the transfer is blocked, so nothing unsafe follows. But the list shows less than the app knew. Using the union, or keeping the indexer's holders when the node's replay is also wrong, would show more |
| F2 | Info | **Pre-fix transfer impact.** With a holder missing from the list, the plan had no revoke step and used `safeTransferFrom`, which the registry reverts (`TransferUnsafeWithMultipleAssignees`) while anyone else holds roles. So the common outcome was a dead end with a misleading message ("…If the recipient is a contract…"), not a grant that outlives the transfer. A grant can only outlive the transfer on the `unsafeTransfer` path: the owner opts out of revoking, or an unrevocable grant sits alongside the missed one. The comment in `useTransferRoleRevocations.ts` describes that narrower case |
| F3 | Info (test env) | **The portal's RPC transport fails over to public Sepolia.** `sepoliaFallbackTransport` lists the `/rpc` proxy, then public endpoints. A read that fails on the fork is retried against real Sepolia, which can't see fork names and answers empty, and that answer is accepted. Any e2e test that simulates a node outage has to fail every endpoint (as `watchNodeRoleReads` does) |
| F4 | Info (local stack) | Unrelated to this PR, local Panoptes still answers `RoleChangeEvents` with `null`. Before the fix, that threw out of the reader. With the PR, it's a caught `failed` and falls back to the node, so the indexer no longer has to be aborted locally for role reads to work |

