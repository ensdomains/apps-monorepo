# WEB-1418: Transaction actors scoped per attempt, QA test plan and report

PR: [#1214 Scope transaction actors to one attempt and settle every waiter](https://github.com/ensdomains/apps-monorepo/pull/1214) (also folds in WEB-1225, WEB-1226, WEB-1227, WEB-1228 from #1237 and #1238)
App: **portal** (`apps/portal`, `:3001`), plus `packages/transaction-manager`
Spec: `e2e/projects/portal/tests/roles.spec.ts` (`Portal name roles — repeat changes in one session (WEB-1418)`)

---

## 1. What changed

A transaction actor that reaches `success` stays in the transaction manager's
map on purpose, so the modal can keep showing the finished step. The roles,
transfer, registry and resolver flows named their steps with fixed ids
(`tx-grant-roles`, `tx-revoke-roles`, `transfer-<name>-<step>`, …). A second
attempt in the same session therefore looked up the first attempt's actor:
the step opened as **Done**, showing the first transaction's **actual cost**,
and pressing Done sent nothing. The user sees a completed change that never
reached the chain.

**How a user reaches it:** make a change, and when the modal shows the success
state, close it with **X or Escape** instead of pressing **Done**. Done runs
`transactionManager.clear()`, which hides the bug. Dismissing is the supported
"reopen and see the result" path (`TransactionModal` only clears on error).
Then make a second change of the same kind without reloading.

| File | Role | Change |
|---|---|---|
| `transaction-manager/helpers/flow-identity.ts` | ID writer | New `FlowScope` (account + nonce) and `scopeTransactionId(baseId, scope)`, which appends `--<account>-<nonce>` |
| `transaction-manager/providers/transactionManager.ts` | Manager | Records each actor's owning wallet. `setConnectedAccount` retires another account's settled actors and marks in-flight ones for retirement once they settle. `startTransaction` retires a settled occupant of the id, or returns the running one on a duplicate start |
| `transaction-manager/helpers/awaitTransactionOutcome.ts`, `waitForTransaction.ts` | Waiters | Every waiter settles: reads the current snapshot first, and rejects with `TransactionStoppedError` when the actor is stopped |
| `portal/…/useFlowAttempt.ts` | Flow hook | New. Mints a scope and opens the modal in one call. Never clears the manager |
| `portal/…/useTransactionManagerAccount.ts`, `routes/__root.tsx` | Account sync | Reports a settled `connected` address to the manager |
| Roles, transfer, registry and resolver sheets and builders | Flows | Step ids built through `scopeTransactionId` with the attempt's scope |
| `transfer/utils/canStartStep.ts`, `transferStepId.ts` | Transfer guard | A step is blocked only while it has an actor |

---

## 2. Automated coverage (e2e, real browser, real chain)

The PR's unit tests drive the manager and builders in isolation. These tests
use the real sheet → modal → wallet path, with the real module-level manager
surviving between two attempts in one page, a real `accountsChanged` switch,
and the chain role bitmap as the oracle.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | a second grant after dismissing the first asks the wallet again and lands on-chain (`@smoke`) | Add-user sheet. Grant 1 lands (positive control) and is dismissed with Escape. Grant 2 to a different wallet must open "Not Started", show no "Actual Cost", and appear in the grantee's on-chain bitmap | ❌ step opens "Done · Actual Cost 0.0001169 ETH"; bitmap empty | ✅ 9s |
| 2 | a second revoke from the role editor revokes on-chain instead of replaying the first | Role editor (`RolesSidebar`, the PR's reported repro). Revoke 1 lands and is dismissed. Revoke 2 of the remaining role must reach the chain | ❌ step opens "Done"; the role is still held on-chain | ✅ 11s |
| 3 | after an account switch, the new wallet's grant is not satisfied by the previous wallet's receipt | The owner grants on name A and dismisses. A real `accountsChanged` to the manager, then client-side navigation (no reload) to name B, which the manager owns. The manager's grant must reach the chain | ❌ the owner's receipt is shown as the manager's step; bitmap empty | ✅ 11s |

Each ❌ fails on the assertions that encode the bug: soft checks on the
modal's "Not Started" / "Actual Cost", then the hard chain bitmap check. None
fails on a timeout or setup step.

**Results on the PR build (merged onto `e2e-tests-coverage`):** 3/3 pass. Portal
smoke (`pnpm test:portal-smoke`) passes 11/11 in 150s. With the PR's 19
modified app/package files reverted, 3/3 fail as above.

The whole `roles.spec.ts` gives 9 passed and 5 failed. The five (C1, C4, C5,
C11, C12) are pre-existing and unrelated to this PR (see F4).

### Unit tests (vitest)

| File | Case | Pre-fix |
|---|---|---|
| `apps/portal/…/hooks/useFlowAttempt.test.tsx` (new) | Idle until started, so steps render under their bare id | n/a, new hook |
| | `start` scopes to the lower-cased signer and opens the modal in one call | n/a |
| | A second attempt by the same signer gets a different id (the WEB-1418 contract) | n/a |
| | Re-scopes when started again without ending | n/a |
| | Scopes to whichever wallet starts the attempt | n/a |
| | Returns to idle on `end` | n/a |
| | Never clears the transaction manager | n/a |
| | `start` and `end` keep a stable identity across renders | n/a |

`useFlowAttempt` is new in this PR, so these are contract guards and can't go
red on the pre-fix build. transaction-manager: 168/168. Portal
(transaction-manager, transfer, roles, resolver, registry): 400 passed plus 1
expected fail. Typecheck is clean for portal, transaction-manager, manager
and e2e. `biome check` shows no new warnings.

### Harness changes on the test branch

- `e2e/helpers/transaction-modal.ts`: `driveTransactionsToSuccess` matches
  `Transaction <id>(--\S+)? state: success`, which is the PR's anchored matcher,
  ported. Without it, every modal-driven test on this branch fails once the
  PR lands (F1).
- `e2e/infra/panoptes/contracts.json`: `l2_eth_registry` and
  `l2_eth_registrar` now point at the current stack (F3).

---

## 3. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator panoptes-indexer panoptes-api
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
```

- **Wallet.** A browser wallet with Anvil account 0 (`0xf39F…2266`) and
  account 1 (`0x7099…79C8`) imported, so you can switch between them.
- **Seed a name you own:** `OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name`.
  The steps below call it `MINE`.
- **Seed a name account 1 owns:** `OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name`.
  The steps below call it `THEIRS`.
- If the roles table is empty after an Anvil restart, or after any Playwright
  run that includes the harness project, wipe Panoptes (F5).

**The key move in every step below:** when a transaction succeeds, close the
modal with **X or Escape**. Do not press Done. Do not reload between attempts.

### Roles (automated as tests 1–3; spot-check by hand)

| # | Step | Pass |
|---|---|---|
| M1 | `/MINE/roles` → Add user → account 1, tick Set Resolver → Save → send → **Escape**, then close the sheet | Wallet prompted once. The new row appears |
| M2 | Add user again → any other address, tick Set Resolver → Save | The modal shows **Not Started** and **Est. Cost**, not Done or Actual Cost. The wallet is prompted. The grant appears on-chain |
| M3 | Edit user roles on account 1's row → untick Set Resolver → Save → send → **Escape**. Edit again → change another role → Save | The second change opens as Not Started and prompts the wallet |
| M4 | After M1, switch the wallet to account 1 (no reload), go to `/THEIRS/roles` through the search box, Add user → grant a role | Not Started. The wallet is prompted. It lands on-chain |

### Other flows the PR changed (not automated here)

| # | Step | Pass |
|---|---|---|
| M5 | `/MINE/registry` roles: Add user → grant → **Escape** → Add user again → grant | The second attempt prompts the wallet |
| M6 | Same, with Edit user on the registry roles table | The second attempt prompts the wallet |
| M7 | On a name with a permissioned resolver, `/MINE/resolver` roles: Add user twice, and Edit roles twice, dismissing each time | Every second attempt prompts the wallet |
| M8 | Transfer `MINE` with a multi-step plan (for example keep the resolver and set the ETH address, so there are two steps). Complete step 1, then **Escape**. Start the transfer again | The retry starts from step 1 of a fresh plan, and no step is pre-marked Done |
| M9 | Transfer: click Start / Open wallet twice quickly on one step | One wallet prompt, not two |
| M10 | Start a transaction, and while the wallet prompt is open switch accounts in the wallet | No crash. The in-flight transaction still completes or errors in the modal |

### Regression checks

| # | Step | Pass |
|---|---|---|
| M11 | Any single role change pressing **Done** (not Escape) | Modal closes, change on-chain, next change works as before |
| M12 | Lock the wallet with the success modal open, then unlock | The finished step still shows Done (the manager ignores a missing account) |
| M13 | Register a name end to end | Unchanged. The registration's history entry now records its chain id (WEB-1227/1228) |

---

## 4. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | **High (for the retrofit)** | The PR breaks the shared e2e console matcher on `e2e-tests-coverage`. Scoped ids no longer match `Transaction <id> state: success`, so C2 (`@smoke`) and every modal-driven roles and transfer test fail once the PR is merged into this branch. The PR updates only the old copy in `transfer.spec.ts` on `main`. Fixed here by porting the anchored matcher into `e2e/helpers/transaction-modal.ts` |
| F2 | Info | The bug only reproduces when the success modal is dismissed (X or Escape). Done clears the manager |
| F3 | Medium (environment, pre-existing) | `e2e/infra/panoptes/contracts.json` kept the pre-redeploy `l2_eth_registry` (`0xBDC85dD5…`) and `l2_eth_registrar` (`0xa88553F4…`). Panoptes reads role events through `l2_eth_registry`, so no grant on today's `.eth` registry (`0x657eA849…`) was ever indexed. Fixed on this branch |
| F4 | Low (tests, pre-existing) | C1, C4, C5, C11 and C12 fail on `nameRolesSection`, which looks for the heading "parent registry roles". The heading has read "Parent registry / roles" since #1105 (2026-08-27). F3 masked this, because those tests timed out at the indexer wait first. Fix: use `parentRegistryRolesPanel`. Not changed here |
| F5 | Medium (environment, pre-existing) | The harness `chain-snapshot` check (`specs/harness.spec.ts:539`) runs `evm_revert` on every run that includes the harness project, which permanently breaks Panoptes (see "A chain-snapshot revert permanently breaks Panoptes" in `e2e-defects.md`). Any indexer-backed test run after it fails until the volume is wiped |
| F6 | Info | Transfer, registry roles and resolver roles were covered by the PR's unit tests and typecheck only. They were not run end to end here (M5–M10) |

No functional defects found in the PR's app code.

---

## 5. Retrofit note: scope added after verification

The verification above ran against PR head `pr-1214-head` (40 files). Before
merge the branch was rewritten, and the squash commit `e6a69772` touches 60
files. The 40 verified files are identical in the merge, except
`flow-identity.test.ts`, which is a unit test only.

The **20 files added later** scope step ids for flows this plan did not run
end to end:

- **Renewal:** `ExtendNameButton`, `useRenewalTransactions`
- **Resolver:** `ChangeResolverForm`, `useChangeResolver`, and `resolver/$address/create-link` and `links`
- **Records and addresses:** `edit-records`, `AddressResolutionSidebar`, `ReverseResolutionSidebar`, `addr/$addr/names`
- **Subnames and registry:** `subnames`, `create-subname`, `SubregistryConfigurator` (plus the `ConfigureRegistryForm` test)
- **Other flows:** `fuses/burn`, `useDnsImportTransactions`, `useSyncManagerTransaction`, `ReclaimManagerButton`
- **New unit tests:** `scopedStepFlows.test.ts`, `useTransferName.test.tsx`

**Why it matters for this branch:** the records, resolver, subnames and
transfer specs drive these flows through `driveTransactionsToSuccess` with
fixed ids (`SAVE_RECORDS_TX`, `CHANGE_RESOLVER_TX`, `transferTxId(...)`).
Once a flow logs a scoped id, only the ported anchored matcher (F1) keeps those
specs green. The port is in place, but it has **not yet been run against the
merged code**.

**Pending, to run on `e2e-tests-coverage` after the retrofit:**

1. Unit tests (`packages/transaction-manager`, and `apps/portal` in full) and typecheck (portal, transaction-manager, manager, e2e)
2. `roles.spec.ts` (the WEB-1418 block, 3 tests) and `pnpm test:portal-smoke`
3. `records.spec.ts`, `resolver.spec.ts`, `subnames.spec.ts`, `transfer.spec.ts`, to confirm the matcher against the newly scoped flows
4. Manual spot checks M5–M10, plus one renewal and one records edit using the dismiss-then-repeat pattern from §3

Wipe Panoptes before step 3 (F5): step 2's smoke run includes the harness
project, which rewinds the chain.
