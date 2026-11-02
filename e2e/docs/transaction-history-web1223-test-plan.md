# WEB-1223: Transaction history wiped on account switch, QA test plan and report

PR: [#1345 fix(transaction-manager): stop the tx- prefix scan from deleting the tx-history archive](https://github.com/ensdomains/apps-monorepo/pull/1345)
App: **manager** (`apps/manager`, `:3000`), through `packages/transaction-manager`
Spec: `e2e/projects/manager/tests/transaction-history.spec.ts` (`transaction history survives an account switch without IndexedDB (WEB-1223)`)

---

## 1. Change surface

**The bug.** When IndexedDB is unavailable (Firefox private browsing, Brave
with shields up), the transaction manager persists to `localStorage`. Active
records are `tx-<id>`, and the archive is `tx-history`. Both active-record
scans matched on `startsWith('tx-')`, which `tx-history` also satisfies. So:

- `clearActive()` deleted the archive along with the active records.
- `getAll()` parsed the archive array as one bogus active record.

**How a user reaches it:** sign in to the backend (the "Verify your wallet"
SIWE prompt), then switch to another account in the wallet. `WalletLifecycle`
sees an address that differs from the backend-authed one and calls
`transactionManager.clearAllAndPersistence()`, which calls `clearActive()`.

**The fix, by role.**

| Role | File | What changed |
|---|---|---|
| Key shapes | `transaction-persistence.ts` | `ACTIVE_KEY_PREFIX`, `HISTORY_KEY`, `activeKey(id)` and `isActiveKey(key)` replace eight inline literals |
| Reader | `getAll()` (localStorage branch) | Filters with `isActiveKey`, so the archive is no longer returned as an active record |
| Writer | `clearActive()` (localStorage branch) | Filters with `isActiveKey`, so the archive survives |
| Unit tests | `transaction-persistence.test.ts` | Eight cases on a `Storage`-shaped stub. Five fail pre-fix |

The IndexedDB and memory backends keep active records and history apart, and
are unchanged.

**What must still work:** the account-switch clear still removes active
records and signs the backend out. A finished transaction is still archived.
`clearHistory()` still clears the archive.

**What the PR's unit tests don't reach:** the real trigger (SIWE sign-in, then
a real `accountsChanged` into `WalletLifecycle`), the backend selection in a
browser whose transaction-manager IndexedDB refuses to open, and an archive
entry written by the app after a transaction that lands on chain.

**How the browser is made to look like Firefox private.** An init script makes
`indexedDB.open('ens-transaction-manager')` throw `InvalidStateError`. Other
databases open normally: refusing every `open` breaks the wallet stack before
the Connect button renders, which is a different failure from the one reported.
The app logs `IndexedDB unavailable` and writes `ens-tx-storage-type =
localstorage`, and both tests assert that marker.

## 2. Automated coverage

Both tests sign in to the backend for real (`signInBackendAuthModal`, which
reaches the deployed API worker). A seeded auth record doesn't work: the
backend answers its fake key with a 401, and `authFetch` signs out before the
switch, so the clear never runs.

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| T1 `switching accounts clears active records but keeps the archive (the report repro)` (`@smoke`) | Seeds two archived entries and two `tx-<id>` active records, signs in as `user` (the authed address must be `user`), then switches the wallet to `user2`. Positive control: the backend auth address goes to null, and every `tx-<id>` record is removed, so the clear really ran. The storage marker is `localstorage`. The archive must equal the seeded entries exactly | FAIL: `tx-history` is `null` | pass (3.4s) |
| T2 `a renewal archived by the app survives the switch to another account` | Renews a fresh V2 name by 28 days with the transaction-manager IndexedDB refused. The app archives the renewal to `tx-history` with state `success`. Chain oracle: the archived hash has a `success` receipt sent by `user`. After the switch to `user2` (positive control: backend signed out), the archive must still hold exactly that `{ id, hash }` | FAIL: `tx-history` is gone (`undefined`) | pass (12.0s) |
| Unit: `transaction-persistence.test.ts` (PR, 8 cases) | `clearActive()` keeps the archive. `getAll()`, `getActiveCount()` and `exportAllData()` ignore it. `clearHistory()` clears only it. Archive then clear keeps the new entry | 5 fail, 3 pass (detection, `clearHistory`, accumulation are guards) | 8/8 |

The pre-fix column reverts only `transaction-persistence.ts` to
`e2e-tests-coverage`. Both e2e tests pass every precondition and positive
control on the reverted build, and fail on the archive assertion itself.

## 3. Results (PR merged onto `e2e-tests-coverage`)

The merge was clean. It also brought in `main`'s `nameExtension.ts` change
(renew), which this PR doesn't touch.

| Check | Result |
|---|---|
| `transaction-history.spec.ts`, PR build | 2/2 pass (17.9s) |
| Same spec, `transaction-persistence.ts` reverted | 2/2 fail on the archive assertion |
| `packages/transaction-manager` unit tests | 303/303 pass (24 files) |
| PR unit tests, reverted | 5 fail, 3 pass, matching the PR description |
| `pnpm typecheck` (`packages/transaction-manager`, `e2e`) | pass |
| `biome check` (PR files, new spec) | pass |
| `pnpm test:manager-smoke` | 8/9 pass (3.3m); T1 passes in 4.2s. The failure is WEB-1483 `names what the last attempt left…`, and it fails the same way with the fix reverted (finding 3). Needs `MAILINATOR_API_KEY` set to any value |

## 4. Manual plan

Setup:

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
pnpm --filter manager dev -- --port 3000
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name
```

Use Firefox in a private window (or Brave with shields up), so IndexedDB is
unavailable. A wallet with two accounts is needed.

1. Open `http://localhost:3000`, connect account A, and click **Sign in with
   Wallet** in "Verify your wallet". Pass: the prompt closes.
2. Renew the seeded name by 28 days with stablecoins. Pass: "Renewal
   Complete!".
3. In devtools, Storage → Local Storage. Pass: `ens-tx-storage-type` is
   `localstorage`, and `tx-history` holds one entry with the renewal's hash.
   (On Chrome, IndexedDB is used and nothing is in localStorage: wrong browser.)
4. Switch the wallet to account B without disconnecting. Pass: the
   "Verify your wallet" prompt appears again (the backend was signed out).
5. Reload Local Storage. Pass: `tx-history` still holds the step 2 entry, and
   no `tx-<id>` keys remain. Pre-fix, `tx-history` is gone.
6. Disconnect from the wallet menu. Expected today: `tx-history` is removed
   (finding 1). This is not a regression of this PR.

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | Low | **Disconnect still wipes the history on the localStorage backend.** `clearAppLocalStorage` (manager, on disconnect) removes every key not prefixed `wagmi`, `ens-session` or the registration-resume key, which includes `tx-history`. The IndexedDB history survives a disconnect, so the two backends still differ. Confirmed on the PR build with a probe: `tx-history` is `null` after **Disconnect**. Out of scope for this PR |
| 2 | Info | **Nothing in the apps reads the history.** `getTransactionHistory` / `getArchivedTransactions` / `exportAllData` are exported but not called in `apps/manager` or `apps/portal`. The bug lost data silently, with no visible effect today. This fits the PR's own note that no user reports are confirmed |
| 3 | Info (unrelated) | WEB-1483 smoke test `names what the last attempt left…` fails on this fork: the HCA already holds a $16.52 leftover, which covers the registration, so the "Network fee" row isn't rendered. Same failure with the fix reverted, so it comes from fork state, not this PR |
| 4 | Info (unrelated) | `test:manager-smoke` fails at collection without `MAILINATOR_API_KEY`, because `notification.spec.ts` throws at import, although none of its tests are `@smoke` |
