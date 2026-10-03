# WEB-281: Transports assert `request.chainId`, QA test plan and report

PR: [#1108 Assert request.chainId in both transport actors](https://github.com/ensdomains/apps-monorepo/pull/1108)
App: **portal** (`apps/portal`, `:3001`), through `packages/transaction-manager`
Specs:
- `e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer — wallet on an undeclared chain (WEB-281)`)
- `e2e/projects/portal/tests/registration.spec.ts` (`Portal Extend — wallet on an undeclared chain (WEB-281)`)

---

## 1. Change surface

**The bug.** A `TransactionRequest` is built for one chain: its calldata,
contract addresses and quoted price all belong to `request.chainId`. Nothing
downstream compared that with the chain the wallet would actually send on.

The portal declares Sepolia alone (`apps/portal/src/lib/wagmi.ts`,
`syncConnectedChain: false`). `ConnectWalletDialog` forces Sepolia only at
connection time. Nothing re-checks the chain afterwards. When the wallet is
switched to another network, wagmi can't find that chain in `config.chains`,
so `walletClient.chain` becomes `undefined`. The EOA transport then passed
`chain: walletClient.chain ?? null` to viem. viem runs its live
`eth_chainId` / `assertCurrentChain` check only when `chain !== null`, so the
check was skipped in exactly the dangerous case. The wallet was asked to send
Sepolia calldata on whatever chain it was on.

**How a user reaches it:** connect on Sepolia, switch networks in the wallet,
then start any portal write (transfer, Extend, register, roles, records via
the transaction manager). The page gives no sign that anything is wrong.

| File | Role | Change |
|---|---|---|
| `actors/eoa-transport.actor.ts` | EOA writer | Refuses with `ChainIdMismatchError` before the wallet is prompted when `walletClient.chain` is missing or differs from `request.chainId`. Passes a real `Chain` to viem, never `null` |
| `actors/warp-transport.actor.ts` | Smart-account writer | Same check against `config.chain`. The `\|\| sepolia` fallback is removed |
| `errors/transaction.errors.ts`, `index.ts` | Error | New tagged `ChainIdMismatchError(expected, actual)`. Its message is shown verbatim as the modal summary |
| `machines/retry-policy.ts`, `transaction.machine.ts` | Machine | `ChainIdMismatchError` is non-retryable |

---

## 2. Automated coverage

The PR's unit tests hand-build `{ chain: undefined }` and never run the
machine. These tests use the real wagmi `walletClient` after a live
`chainChanged` (the headless wallet's `switchChain`), the real transaction
machine and retry policy, and the real modal. The oracle is the headless
wallet's own `eth_sendTransaction` queue, which is exactly the boundary the
bug crossed, plus chain reads.

Helpers: `switchWalletToUndeclaredChain` / `switchWalletToSepolia` in
`e2e/helpers/portal-auth.ts`. They add mainnet (chain 1, reads still routed
to the fork) to the headless wallet, switch it, and wait until the page's
provider reports the new id.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | Transfer: does not ask a wallet on another network to send, and says why (`@smoke`) | After switching to chain 1: no `eth_sendTransaction` prompt; the modal shows "Chain mismatch: this transaction is for chain 11155111, but your wallet is on a network this app does not support." with Try again; exactly one attempt after 5s (non-retryable); resolver and owner unchanged on chain | ❌ wallet prompted (expected 0, got 1) | ✅ 11.8s |
| 2 | Transfer: finishes from the same modal once the wallet is back on Sepolia | The same refusal, then the positive control: switch back and press Try again, the wallet is prompted, both steps succeed, and the chain shows the recipient as owner with the resolver detached | ❌ wallet prompted (expected 0, got 1) | ✅ |
| 3 | Extend: does not ask a wallet on another network to approve or pay, and renews once it is back on Sepolia | Money path. After switching to chain 1: no prompt at "Approve USDC for v2 renewal"; USDC balance, ETHRegistrar allowance and on-chain expiry unchanged. Back on Sepolia and Try again: approve and renew succeed, expiry goes up and USDC goes down | ❌ wallet prompted to approve (expected 0, got 1) | ✅ |
| 1′ | Test 1 with only `retry-policy.ts` reverted (mutation check) | The "exactly one attempt" assertion catches a retryable `ChainIdMismatchError`. This covers the machine branch the PR notes has no test | ❌ 4 attempts | ✅ |

Every ❌ fails on the assertion that encodes the bug, not on a timeout or a
setup step. On the first pre-fix run, test 2 timed out in fixture setup
(`page.goto`). A re-run failed on the prompt-count assertion like the others.

**Not reachable end to end:** the Warp half. Manager is the only Warp
consumer and sets `config.chain` to `customSepolia` unconditionally, so the
guard can't fire from any app today. The PR's unit tests cover it.

---

## 3. Results (PR merged onto `e2e-tests-coverage`)

- New tests: 3/3 pass on the PR build and 3/3 fail on pre-fix code, as above.
- `transfer.spec.ts` + `registration.spec.ts` in full: 73 passed, 13 failed.
  The **same 13 fail with the PR's package files reverted**, so they are
  pre-existing (F4).
- `pnpm test:portal-smoke`: 11/12 pass. The one failure
  (`registration.spec.ts:166`, switching names mid-flow) is among the 13.
- Typecheck is clean in `packages/transaction-manager`, `apps/portal` and `e2e`.
  `biome check` shows no new warnings.
- `packages/transaction-manager` vitest: 231 passed, **10 failed** (F1). The
  PR's own new tests pass.

### After merge (retrofit onto `e2e-tests-coverage`)

Re-run on `origin/e2e-tests-coverage` + `origin/main` (merge commit `7dc6df86` included):

- `packages/transaction-manager` vitest: **241/241** (F1 fixed).
- Typecheck clean in `transaction-manager`, `portal`, `manager` and `e2e`.
- The three WEB-281 tests: 3/3 pass.
- `pnpm test:portal-smoke`: 11/12. The one failure is the same pre-existing `registration.spec.ts:166` (F4).

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator panoptes-indexer panoptes-api
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
```

- **Wallet.** A browser wallet (MetaMask or Rabby) with Anvil account 0
  (`0xf39F…2266`) imported. Add the local fork as "Sepolia (local)", chain id
  11155111, RPC `http://127.0.0.1:8545`. Any second network works as the wrong
  chain; Ethereum mainnet is the realistic one.
- **Seed a name you own:** `OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name`.
  The steps below call it `MINE`.

### Steps

| # | Step | Pass |
|---|---|---|
| M1 | Connect on Sepolia (local). Open `/MINE/ownership/transfer`. In the wallet, switch to Ethereum mainnet. Enter any address, press Transfer name, then Start and Open wallet | **The wallet does not open.** The first step shows Transaction Error with "Chain mismatch: this transaction is for chain 11155111, but your wallet is on a network this app does not support." |
| M2 | Wait 10s after M1 | No further attempts: the console shows one `EOA transaction chain mismatch` line, and the wallet stays closed |
| M3 | Switch the wallet back to Sepolia (local) and press Try again | The wallet opens for the first step. Completing both steps transfers the name |
| M4 | Open `/MINE`, press Extend → Next → choose USDC. Switch the wallet to mainnet, then Confirm → Start → Open wallet | The wallet does not open. "Approve USDC for v2 renewal" shows the mismatch message. The USDC balance is unchanged |
| M5 | Switch back to Sepolia and press Try again | Approve and renew complete. The new expiry shows on the name page |
| M6 | Start a registration at `/register?name=<fresh>.eth` on Sepolia, then switch to mainnet before the commit step's wallet prompt | The commit is refused with the mismatch message and no wallet prompt. (Not automated) |
| M7 | Regression: any transfer or Extend with the wallet on Sepolia throughout | Unchanged: one prompt per step, completes |
| M8 | Regression: in the manager app with smart accounts (not `USE_EOA`), register or edit something | Unchanged. The Warp guard must not fire, because `config.chain` and `request.chainId` are both `customSepolia` |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | **High (blocks merge) — fixed at merge** | The PR's `quality-checks` CI job was red at the verified head. 10 tests in `providers/transactionManager.actors.test.ts` (added by #1214, already in the PR's base) fail with `ChainIdMismatchError`. The shared helper `test-utils/transactionActor.ts` `createCountingWallet` builds its wallet client without a `chain`, and its mock transport throws on every method except `eth_sendTransaction`. The fix needs both: pass `chain` (Sepolia, matching `TEST_CHAIN_ID`), and answer `eth_chainId`, which viem now calls before sending because `chain` is no longer `null`. Fixed in the squash commit `7dc6df86` exactly this way (`chain: sepolia` plus an `eth_chainId` answer); `transaction-manager` is 241/241 after the retrofit |
| F2 | Low (copy) | The PR says the user "has to switch networks and start over". In practice, switching back and pressing Try again in the same modal is enough (tests 2 and 3) |
| F3 | Info | Warp guard unreachable end to end today, as the PR says. Covered by unit tests only |
| F4 | Medium (environment/tests, pre-existing) | 13 tests in `transfer.spec.ts` / `registration.spec.ts` fail identically with and without the PR: fixture-side `setAddr` reverts, a Panoptes subregistry-discovery timeout, and transaction dialogs that never open. This is likely the chain-snapshot revert breaking Panoptes (F5 in [`transaction-scope-web1418-test-plan.md`](./transaction-scope-web1418-test-plan.md)). Not investigated further here |
| F5 | Info (UX follow-up, out of scope per the PR) | The portal still gives no wrong-network signal before a write, and the error has no "Switch network" action |

No functional defects found in the PR's app code.
