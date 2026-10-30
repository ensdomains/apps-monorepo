# WEB-1485: a failed price read must block checkout, QA test plan and report

PR: [#1221 Block checkout when a token price read fails instead of pricing it at $0](https://github.com/ensdomains/apps-monorepo/pull/1221)
Report: Immunefi #92608
App: **portal** (`apps/portal`, `:3001`)
Spec: `e2e/projects/portal/tests/registration.spec.ts` (`Portal checkout — a failed price read blocks checkout instead of pricing it at $0 (WEB-1485)`)

---

## 1. What changed

Checkout reads one price per payment token: `getRegisterPrice` on the v2
`ETHRegistrar` for a registration, `getRenewPrice` on the name's renewer for an
extension. Before the fix, `buildTokenData` replaced any price it couldn't read
with `DEFAULT_PRICE` (`total: 0n`). So a reverted or malformed read made every
token "available" at $0. An empty wallet looked sufficient, the approval step
was skipped (any allowance is ≥ 0), and the registrar still pulled its live
price. The Extend modal let "Next" through with no price and then rendered an
empty confirm step.

Separately, renewals approved **2×** the price. `renew()` takes no amount (the
renewer pulls its own oracle price), so the allowance is the only cap on the
charge, and half of it was left standing after every renewal.

| File | Change |
|---|---|
| `register/utils/tokenData.ts` | `DEFAULT_PRICE` is gone. `buildTokenData` only accepts resolved prices |
| `register/components/PaymentTokenPicker.tsx` | A settled price read that errored, or returned a malformed result, shows a "Couldn't load price" card with Try again (`PriceErrorCard`, exported). Any selection the parent holds is cleared |
| `register/hooks/useRegistrationPrice.ts`, `RegisterNameSummary.tsx`, `renew/hooks/useNamePricing.ts` | `token` is required on the price params. The summaries pass USDC, so they share one cache entry with the picker's USDC price instead of reading it twice. `useNamePricing` also returns `refetch` |
| `renew/components/ExtendNameModal.tsx`, `ExtendNameSettings.tsx` | "Next" is disabled until the price resolves. If the latest read errored, the confirm step shows the error card instead of nothing |
| `renew/hooks/useRenewalTransactions.ts`, `transaction-manager/helpers/intents.ts` | The renewal approval is exactly the quoted price, for single renewals and per renewer in a batch |

---

## 2. Automated coverage

### How the price failure is produced

The portal's RPC goes through the dev server's `/rpc` proxy as JSON-RPC
batches. `failPriceReads` routes `**/rpc`, decodes each `eth_call` against the
`getRegisterPrice` / `getRenewPrice` ABI, and replaces only the chosen price
calls' results with a code-3 revert. That's what a broken oracle or a flaky
node returns, and viem neither retries nor fails over on it. Every other
request in the batch reaches the fork untouched. It also records every price
call the page made. Each test asserts that a read really failed before it
asserts anything about the page, so no negative can pass on a page that never
priced.

The app's query client has `retry: false` and a 1-hour `staleTime`, so each
price key is read once. A key is re-read only on a new duration, a remount
after an error, or Try again.

### e2e (real browser, real fork, real query cache)

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | a register page whose price reads fail offers no token and no Register, then recovers on Try again (`@smoke`) | The reported repro. Every registration price read reverts: no token rows, no "available", no `$0.00`, the error card shows, Register is disabled, and the wallet gets no request. Positive control: with reads restored, Try again shows the registrar's own on-chain price and Register enables | FAIL: 2 tokens offered "available" at $0 | pass |
| 2 | a later price read that fails clears the picked token and offers none at $0 | USDC is picked at a known price, then a new duration's read fails. Register is disabled (a **guard**: the base also cleared the pick on a duration change) and no token is offered. After recovery the visitor must pick again | FAIL: 2 tokens offered at $0 | pass |
| 3 | the summary and the token picker read one price, so they cannot disagree | Only the first USDC price read fails. Exactly one USDC read per duration goes out, and both panels show the same failure. One Try again recovers both | FAIL: 2 identical USDC reads (summary and picker keyed apart) | pass |
| 4 | Extend keeps Next disabled while the renewal price read fails, and prices it once it loads | Waits on the failed read itself (before the fix Next was enabled with no price, so Next is no settle signal). Next is disabled and no amount shows. Positive control: reopened with reads working, it prices and reaches the confirm step | FAIL: Next enabled with no price | pass |
| 5 | the Extend confirm step offers no token whose renewal price failed, and says so when the price itself fails | Only DAI's renewal price fails: no token rows, the error card, Confirm disabled. Then the USDC price fails too: the whole step yields to "We couldn't fetch the renewal price…" with no Confirm. Positive control: Try again restores a confirmable step | FAIL: DAI offered "available" at $0 | pass |
| 6 | Extend approves exactly the renewal price and leaves no allowance behind | Real renewal from 0 allowance. The mined `approve` calldata equals the v2 registrar's `getRenewPrice` for the duration the modal quoted. The allowance afterwards is 0, the USDC delta equals the price, and the landed extension equals the quoted duration | FAIL: approved 16011002 = 2 × 8005501 | pass |
| 7 | a disconnected visitor whose price reads fail sees no price and no checkout, then the price once reads work | No wallet: the summary error, no amount, no token rows, "Connect to register". A **guard**: the base behaved the same | pass (guard) | pass |
| 8 | Extend paid in DAI approves exactly the DAI renewal price and leaves no allowance | As 6, in DAI (18 decimals). Also checks no USDC moved | FAIL: approved 16011000820800000000 = 2 × 8005500410400000000 | pass |
| 9 | renewing a V1 name approves ETHRenewerV1 exactly its price and leaves no allowance | An unmigrated V1 name, renewed from the names list (one selection, so the single-name flow) against `ETHRenewerV1`. The expiry oracle is the V1 BaseRegistrar's `nameExpires` | FAIL: approved 16043878 = 2 × 8021939 | pass |
| 10 | renewing a V1 and a V2 name together approves each renewer exactly its own total | The batch flow: two approvals, one per renewer, each exactly that renewer's price. Both allowances end at 0, and the USDC delta equals the sum | FAIL: v2 renewer approved 16011002 = 2 × 8005501 | pass |

Tests 9 and 10 list the V1 name through `mockV1Subgraph`, because the V1
subgraph can't see names created on the fork (see F3). Pricing, approvals
and renewals all run on the fork.

### Unit (vitest, `apps/portal`)

`useNamePricing` changed (it now prices in USDC and exposes `refetch`) and had
no test. New `renew/hooks/useNamePricing.test.ts`:

| Case | Pre-fix | PR |
|---|---|---|
| prices in USDC on the cache entry the token picker reads (a round trip: what the hook wrote is what `getRenewalPriceQueryOptions({ token: USDC })` reads) | FAIL: the picker's entry is `undefined` | pass |
| reports a failed read with no price, and `refetch` recovers it | FAIL: `refetch is not a function` | pass |

The PR's own unit tests (`PaymentTokenSection.test.tsx`,
`useRenewalTransactions.test.ts`, `tokenData.test.ts`) fail 5 of 17 on the
pre-fix code and pass 17/17 on the PR.

---

## 3. Results

On the PR build merged onto `e2e-tests-coverage`:

- The 10 tests above pass in one run (1.6 min).
- `registration.spec.ts`: 39/40 passed in a full run (9.2 min) taken before tests 7–10 were added. The one failure is F2, which fails the same way without this PR. A full re-run with all 44 tests was cut short twice by Anvil crashing (F4): every failure in it is `ECONNREFUSED 127.0.0.1:8545`, and the 15 tests that ran before the crash passed
- `pnpm test:portal-smoke`: 13/14 passed (2.8 min), including test 1 above (2.5 s). The failure is F2
- Unit: portal `src/features/register`, `src/features/renew`, `src/features/transaction-manager`: 371/371.
- `pnpm typecheck` is clean in `apps/portal` and `e2e`. `biome check` shows two complexity warnings in `registration.spec.ts`, and both already exist on the base branch.

After the merge (`origin/e2e-tests-coverage` + `origin/main` at `f4ae2670`):

- `registration.spec.ts`: 42/44 passed (10.0 min). The failures are F2 and one
  run of test 6. In that run, the oracle's `fromBlock` came from viem's cached
  block number, which predated the test's own setup `approve(…, 0)`, so the
  setup approval was counted next to the app's exact one. The money tests now
  read block numbers with `cacheTime: 0`, and the 10 tests then passed 20/20
  (`--repeat-each=2`). The WEB-1229 test "closing the modal after a step really
  failed" failed once and passed on retry
- `pnpm test:portal-smoke`: 13/14 (2.7 min). The failure is F2
- Unit 371/371, and typecheck is clean in `apps/portal` and `e2e`

With the PR's 9 app files reverted to `e2e-tests-coverage`, tests 1–6 and
8–10 and both new unit tests fail, each on the assertion that encodes the bug.
Test 7 passes on both builds (a guard), and so does test 2's Register check.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
# a name you own, for the Extend steps
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name
```

- **Wallet:** a browser wallet on Anvil account 0 (`0xf39F…2266`), which holds USDC and DAI after funding.
- **Failing the price read:** in DevTools → Network, right-click a `/rpc`
  request → **Block request URL** only blocks *all* RPC. To fail just the
  price, use a local override or a proxy that answers `eth_call` with data
  starting `0x61907b12` (`getRegisterPrice`) or `0xddf0effc` (`getRenewPrice`)
  with `{"error":{"code":3,"message":"execution reverted"}}`. Blocking all of
  `/rpc` also works for M1/M4, but nothing else on the page will load either.
- **Allowance:** before M6–M8, set the renewer's allowance to 0
  (`cast send <USDC> "approve(address,uint256)" <renewer> 0`). The v2 renewer
  is `ensEthRegistrar`, and the V1 renewer is `ensEthRenewerV1` (both from the
  ensjs chain config).

### Steps

| # | Steps | Pass |
|---|---|---|
| M1 | Fail `getRegisterPrice`, open `/register?name=<new label>.eth` connected | The summary shows "Failed to load price". The picker shows "Couldn't load price" with **Try again**. No USDC/DAI rows, no "available", no `$0.00`. **Register** disabled |
| M2 | Stop failing it, press **Try again** | Rows appear with the real total (≈ $8.01/yr for a 5+ char label). Pick USDC and Register enables |
| M3 | Pick USDC, then fail the price and click **2 years** | Error card, Register disabled. After recovery, USDC is no longer selected |
| M4 | Disconnect, fail the price, open a register page | "Failed to load price", no amount, "Connect to register" |
| M5 | On your name, fail `getRenewPrice` and press **Extend** | "Failed to load price", **Next** disabled. Close, stop failing, reopen: the total shows and Next continues |
| M6 | Extend with USDC from 0 allowance; inspect the approve in the wallet | The approve amount equals the confirm step's total (not double). After the renewal, `allowance(owner, ensEthRegistrar)` is **0** |
| M7 | As M6 paying **DAI** | Same, in DAI, against the DAI total |
| M8 | Names list (`/addr/<you>/names`): select a V1 name and a V2 name, **Extend** | Two approvals, one per renewer, each equal to that name's subtotal. Both allowances are 0 afterwards |
| M9 | **Sepolia:** M6 with a real wallet | The wallet's approval prompt shows exactly the renewal price |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Info | A selection held across a failed re-read of the *same* price can't be reached in the real UI: with `retry: false` and a 1-hour `staleTime`, a price is only re-read on a new duration, and the base already cleared the pick then. That path is covered only by the PR's unit test, and test 2 labels its Register check as a guard |
| F2 | Medium (pre-existing, not this PR) | The `@smoke` test "switching to a different name mid-flow cancels the first registration instead of completing it" (WEB-1464) fails every time locally ("name A's flow kept prompting the wallet"). It fails identically with the PR's files reverted, and with every app file from the `main` merge reverted. Not investigated further |
| F3 | Medium (test infra) | `packages/v1-subgraph-shim` can't serve the names list: it rejects the list's `wrappedOwner` filter, so `/addr/…/names` shows "Error fetching names" locally. Its Docker image fails to build on `catalog:` deps, and its lockfile entry pins an ensjs build (`4fc0c2a4`) that isn't installed, so `pnpm start` crashes. Tests 9–10 work around it with `mockV1Subgraph` |
| F4 | Low (environment) | The shared Anvil exits (code 133) when its drpc fork upstream drops a TLS connection mid-read. Every spec then times out, which looks like a PR failure. Restart Anvil and reset Panoptes |
