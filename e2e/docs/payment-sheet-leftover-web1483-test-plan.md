# WEB-1483: payment sheet with a leftover from the last attempt, QA test plan and report

PR: [#1303 feat(manager): name the leftover from the last attempt on the payment sheet](https://github.com/ensdomains/apps-monorepo/pull/1303)
App: **manager** (`apps/manager`, `:3000`), plus `packages/utils`
Spec: `e2e/projects/manager/tests/registration-rhinestone.spec.ts` (`payment sheet with a leftover from the last attempt (WEB-1483)`)

---

## 1. What changed

A standalone-HCA registration is funded for its quoted maximum, and only the
actual cost is spent. An attempt that funds the HCA but never finishes leaves
USDC behind, and the next attempt's sheet sets that against the cost. Before
the fix, the "Select payment" sheet did this without naming either figure:

- The headline still read **Total** over a figure that was now the wallet's
  share.
- The token row's balance was labelled **available**.
- The two messages that explained the subtraction said **"your account
  already holds"**. Support has ruled out "account" in copy.

| File | Change |
|---|---|
| `TokenPickerContent.tsx` | Feeds `registration` and `hcaCredit` into the summary. Mounts the breakdown for the whole HCA route. Rewords the shortfall and fully-covered messages. Holds Register while the quote is placeholder data (`isQuoteStale`), and doesn't hand a placeholder debit to the machine |
| `PaymentBreakdown.tsx`, `PaymentBreakdownRow.tsx` (new), `NetworkCostRow.tsx` (deleted) | Registration fee and Network fee as white rows with tooltips. "Left from your last attempt -$x" as a muted deduction, only when there is one |
| `PaymentTotalRow.tsx` | Takes a label. It reads **You pay now** when a leftover applies, and **Total** otherwise |
| `TokenListItem.tsx` | "available" → "in your wallet" |
| `paymentBreakdownFigures.ts` (new) | Rounds the lines to cents and derives the leftover from them, so the subtraction on screen adds up. Also derives the annual-fee tooltip term |
| `hcaBudget.query.ts` | Logs a refused quote. `placeholderData: keepPreviousData`, so the primary-name toggle keeps the figures on screen while it re-quotes |
| `TokenPickerDialog.tsx` | Focuses the sheet rather than its first tooltip trigger on open |
| `packages/utils/.../query.ts` | `resultQueryOptions` no longer drops `staleTime` and `gcTime`. **This applies app-wide**: every caller that passed them has been running on `staleTime: 0` until now |
| `locales/*/messages.po` | The new strings |

---

## 2. Automated coverage

### How the leftover is set up

The local mockestrator tops accounts up only before a fill, and these tests
never fill. So the leftover is seeded directly: `setStorageAt` on the USDC
balance slot (OZ ERC20, slot 0) of the HCA the picker quotes for, read from
the `account` on its `/intents/route` requests. The HCA is counterfactual on
the fork; the app's balance read doesn't care. The seeded balance is read back
as the oracle. Each test puts the original balance back in a `finally`, and
the manager suite runs with `workers: 1`.

The mockestrator quotes every intent at zero fee, so the Network fee line is
always `$0.00` locally. The arithmetic checks still hold with a zero fee, but
a non-zero fee is only seen on Sepolia (M6).

### e2e (real browser, real quote, real chain balances)

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | names what the last attempt left and makes the headline what the wallet pays now (`@smoke`) | **Guard:** with an empty HCA there's no leftover line, and the headline reads "Total". **The repro:** with $1.82 seeded, a "Left from your last attempt" line shows exactly the HCA's on-chain balance, and the headline reads "You pay now". Registration fee + Network fee add up to the old total, and minus the leftover they give the headline, to the cent. The tooltip trigger is there, no "account" appears anywhere in the sheet, and Register is enabled. The token row says "in your wallet", and its figure equals the wallet's on-chain USDC | FAIL: no "Left from your last attempt" line (headline "Total", fee line "Network cost", token row "available") | pass |
| 2 | a leftover that covers the whole registration says so, without calling it an account | With 1,000 USDC seeded, the sheet says "What was left from your last attempt covers the X USDC…". X equals the two lines' total, and the leftover line is credited only that much, not the whole balance. "You pay now" is $0.00, and Register is enabled (a zero debit is a real state) | FAIL: "Your account already holds the 16.52 USDC this registration needs…" | pass |
| 3 | a wallet short of the remainder is told what the leftover covers and what it still needs | Seeds $1.82 in the HCA and 5 USDC in the wallet. The USDC row is disabled, and the message gives cost, leftover, need and wallet figures, each checked against the lines and the chain. Register is disabled. **Positive control:** with the wallet refunded, Register is enabled and the message is gone | FAIL: "…and your account already holds 1.82, so you need 14.70 more — but your wallet holds 5.00 USDC." | pass |
| 4 | flipping the primary-name toggle keeps the breakdown and holds Register until the new quote lands | The toggle's default is read on a throwaway label first: it's on for a wallet with no primary name and off once it has one. The quote for the other state is held: with the toggle on, it's sent on open (both states are quoted together), and with it off, it's sent on the flip. After the flip, Register is disabled and stays disabled (rechecked after 2s), and the fee line keeps its figure. **Positive control:** releasing the quote enables Register | FAIL: Register enabled during the re-quote | pass, in both directions (on→off on a fresh wallet, off→on once it has a primary name) |

Tests 1–4 use the same readiness wait: the fee line shows a dollar figure.
It accepts either label (`Network fee` or `Network cost`), so the pre-fix
build gets as far as the assertions that encode the bug, rather than failing
in setup.

### Unit (vitest)

The PR adds unit tests for `getPaymentBreakdownFigures`, `getAnnualFeeTerm`,
`TokenPickerContentBase` (credited and plain breakdowns, the balance label),
the budget query's logging and placeholder options, and the
`resultQueryOptions` passthrough. These cover the writer and the reader of the
new figures, so no unit tests were added.

---

## 3. Results

On the PR build merged onto `e2e-tests-coverage`:

- `registration-rhinestone.spec.ts`: 16/16 pass in 15.6 min (the 12 existing tests plus the 4 above). The first full run had 5 commit-path failures (A2, WEB-1148 ×3, the WEB-1702 mid-registration test) while the HCA was still undeployed. Those depended on chain state, not on the PR: once the HCA was deployed, A2 passed on both the base and the PR build. The anvil clock is ~551 days ahead of wall time, and first-time deployment is the only path where the mockestrator runs the real executor and its deadline checks
- `pnpm test:manager-smoke`: 7/8 pass in 4.9 min, including the new `@smoke` test (1.1–1.2 min). `migration-grace` (WEB-424) fails waiting for "Renew your names before upgrading". It **fails the same way with the PR reverted**, so it isn't caused by this PR. The likely cause is the clock drift, since it seeds a grace-period name
- Unit tests: manager `src/features/register-v2` 286/286, `packages/utils` `tanstack-query` 2/2.
- `pnpm typecheck` is clean in `apps/manager`, `packages/utils` and `e2e`.
- `biome check`: one **new** warning. `TokenPickerContentBase` has cognitive complexity 20 against a limit of 15, and is clean on the base branch (F3).

With the PR's app files reverted to `e2e-tests-coverage`, all 4 e2e tests
fail, each on the assertion that encodes the bug (see the Pre-fix column).
The failure snapshots of tests 2 and 3 show the exact "your account already
holds" sentences from the report.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/manager/.env.ci apps/manager/.env      # VITE_FF_USE_EOA=false: the HCA route
pnpm --filter manager dev -- --port 3000
```

- **Wallet:** a browser wallet on Anvil account 0 (`0xf39F…2266`). The mock
  wallet can't drive the HCA route.
- **The HCA** for account 0 is `0xF1554d7361E0663896F57A121C83638856f0ED91`. To
  confirm it, check the `account.address` of any `intents/route` request in
  DevTools.
- **Seeding a leftover** (USDC is `0x240b0316Df57887DBBE58b586508b19e633a14aa`,
  balances at slot 0):

  ```sh
  HCA=0xF1554d7361E0663896F57A121C83638856f0ED91
  USDC=0x240b0316Df57887DBBE58b586508b19e633a14aa
  # $1.82 left behind; use 0 to clear, 1000000000 for "covers everything"
  cast rpc anvil_setStorageAt $USDC $(cast index address $HCA 0) $(cast to-uint256 1820000)
  ```

  Reopen the sheet with a full page load after each change: the balance is
  read with the quote, and cached for 60s.
- No name needs seeding, because every step uses a fresh, unregistered label.
  For a name in its temporary premium, add `OWNER=user2 STATE=premium pnpm
  --filter @ens-apps/e2e seed:name`. **This warps the shared clock.**

### Steps

| # | Steps | Pass |
|---|---|---|
| M1 | HCA at 0. Open `/register/<new label>`, click **Pay with stablecoins**, enable sessions, pick **USDC** | "Registration fee" and "Network fee" rows, each with an ⓘ. No "Left from your last attempt" line. The headline reads **Total**, and the token row says **in your wallet** |
| M2 | Seed $1.82, reload, reopen the sheet | A muted **Left from your last attempt -$1.82** line under the two rows. The headline reads **You pay now**, and Registration fee + Network fee − 1.82 equals it. Hovering the ⓘ shows the "funded for their quoted maximum cost" explanation. The word "account" appears nowhere |
| M3 | Seed 1000 USDC, reopen | **What was left from your last attempt covers the X USDC…** with X = Registration fee + Network fee. The leftover line equals X, not 1000. "You pay now $0.00". Register is enabled |
| M4 | Seed $1.82, and set the wallet's USDC to 5 (`cast rpc anvil_setStorageAt $USDC $(cast index address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 0) $(cast to-uint256 5000000)`), then reopen | USDC row disabled. "Not enough USDC. This registration costs X USDC and 1.82 is left from your last attempt, so you need Y more, but your wallet holds 5.00 USDC." Register is disabled. **Afterwards, restore the wallet** with `fund-account.sh` |
| M5 | HCA at 0. Open the sheet. In DevTools, block `intents/route`, then flip **Set as primary name** off and on again a few times | The rows keep their figures throughout and never go to "—". Register is disabled while a quote for the current toggle state is outstanding |
| M6 | **Sepolia, real orchestrator.** Start a registration with USDC, sign the permit, and close the tab before the reveal. Then open the sheet for another name | A non-zero network fee, and a leftover equal to the HCA's USDC balance on Etherscan. The lines add up to the headline to the cent |
| M7 | Keyboard: open the sheet with the keyboard | Focus lands on the sheet, not on the first ⓘ, and no tooltip opens by itself |
| M8 | Language → Svenska, then repeat M2 | Every new line is translated, with no English fallback |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Low | **A sub-cent leftover can still show a line.** The PR says `getPaymentBreakdownFigures` "returns zero … for a sub-cent balance". That only holds when the rounding residue goes negative, which is the case its unit test covers. Seen on the fork with 0.004 USDC in the HCA and a $16.52 name: the sheet shows **Left from your last attempt -$0.01** and **You pay now $16.51**. The subtraction is consistent, since the debit really does round to 16.51, but a balance under a cent produces a line, which contradicts the description. Either gate on `hcaCredit >= 0.005`, or reword the claim |
| F2 | Low (copy) | **The PR description doesn't match the build.** It describes the first row as `Name price` and the deduction as `−$1.82` (a minus sign). The build renders **Registration fee** and **-$1.82** (a hyphen-minus). The pricing card on the previous step still says "Registration", which the PR acknowledges. Worth confirming which label design signed off |
| F3 | Low (code health) | `biome check` reports a new `noExcessiveCognitiveComplexity` warning (20 against a limit of 15) on `TokenPickerContentBase`. The base branch is clean |
| F4 | Medium (wide reach, one plausible regression) | **A shared fix outside the ticket.** `resultQueryOptions` destructured `staleTime` and `gcTime` away, so every caller ran on its app's default: **portal 1 hour, manager 0**. The fix makes 17 call sites honour their own values, and 13 of them change behaviour. **Portal:** `getDnsOwner`, `getDnsImportData` (also `gcTime: 0`), `getDnsOffchainStatus` and `useNameRegistryDiscovery` asked for `staleTime: 0` but were cached for an hour. That was a latent bug the fix closes, at the cost of more DoH and RPC reads. `useOracleParams`, `useBaseRate` and `useAppliedDiscount` go from 1 hour to never. **Manager:** `baseRates`, `oracleParams` and push go from refetch-on-every-mount to never. `nameStats` and `hcaBudget` go to 60s. `useV1Names` goes to 5 min. **Risk:** nothing invalidates `qk('migration','v1_names')` after a migration (only `renewalUi.machine.ts` does, after a renewal). So after migrating a name and returning to /upgrade in the same tab, the list can show the migrated name as still eligible for up to 5 minutes, until the window regains focus. Before the fix it refetched on mount. Not verified in this run. **Update at retrofit:** #1316 (merged to `main` just before this PR) added `invalidateMigrationQueries`, which `MigrationPage` calls on success. It invalidates every `migration`-keyed query, `v1_names` included, so this specific path is closed in code. Still deferred to follow-up work (agreed at review): an e2e test that migrates a name and returns to /upgrade in the same tab, plus a run of `test:manager-migration` and the portal DNS-import tests for the other changed caches |
| F5 | Info (test infra) | The mockestrator quotes at zero fee, so the Network fee line is always `$0.00` locally, and the e2e arithmetic never exercises a non-zero fee. M6 on Sepolia covers that |
| F6 | Info | With the leftover covering everything, the headline reads "You pay now **up to** $0.00". The hedge is accurate (the machine re-quotes), but "up to $0.00" reads oddly. Design may want to drop the hedge when the debit is zero |
| F7 | Info (test infra, not this PR) | The local V1 subgraph shim (`packages/v1-subgraph-shim/server/abis.ts`) decodes the controller's `NameRegistered`/`NameRenewed` without the trailing `bytes32 referrer` that the fork's controller emits (topic `0xc2240194…` on chain vs `0x69e37f15…` in the ABI). It never learns a `.eth` label, so every V1 name reads `[labelhash].eth` and a manual `/upgrade` run lists nothing. The e2e migration specs mock the subgraph, so they aren't affected. Found while trying to check F4 by hand |
