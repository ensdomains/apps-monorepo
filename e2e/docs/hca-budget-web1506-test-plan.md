# WEB-1506: HCA registration budget, QA test plan and report

PR: [#1234 fix(manager): fund the resolver deploy in the HCA registration budget](https://github.com/ensdomains/apps-monorepo/pull/1234)
Reports: Immunefi #89462 (the unpriced deploy), #93021 (the swallowed quote failure)
App: **manager** (`apps/manager`, `:3000`), plus `packages/smart-account` and `packages/transaction-manager`
Spec: `e2e/projects/manager/tests/registration-rhinestone.spec.ts` (`HCA registration budget (WEB-1506)`)

---

## 1. What changed

A standalone-HCA registration funds itself once. The commit leg carries a
single EIP-2612 permit sized by `estimateHcaBudget`, and the reveal leg pays
the registrar and the executor out of that balance with no funding of its own.
If the permit is short, the commitment is made and paid for, then expires.

The register leg's cost comes from one number: `/intents/route` prices purely
on `destinationGasUnits` and never reads the calls. Before the fix that number
was a flat 450,000. A first registration's reveal batch also starts with
`VerifiableFactory.deployProxy(...)` for the account's `PermissionedResolver`,
which costs ~186k gas and was never priced. Separately, a failed budget quote
was caught with `.catch(() => null)`, so the picker showed the rent alone,
unhedged, and let checkout start.

| File | Change |
|---|---|
| `smart-account/.../budget.ts` | `registerLegGasLimit` takes a `RegisterLegShape` and adds `HCA_RESOLVER_DEPLOY_GAS` (210,000) when the resolver has no code. `isResolverDeployed` is required on `HcaBudgetParams`, with no default |
| `transaction-manager/.../registration.hca.actors.ts` | One shared `isResolverDeployed` read feeds both the quoted batch and its gas limit. `submitRevealBatchActor` uses the same helper |
| `manager/.../hcaBudget.query.ts` | New exported `isHcaBudgetQuoteRequired`, now also the query's `enabled` |
| `manager/.../TokenPickerContent.tsx` | A failed quote blocks checkout, keeps the "up to" hedge and shows an error, on both the render path and the click path. The EOA route, which has no budget, is not gated |
| `manager/src/locales/*/messages.po` | The new error string |

**Out of scope, by design:** a funding pair on the reveal leg. The reveal is
session-signed with no wallet prompt, and a permit there would add a second
signature mid-flow.

---

## 2. Automated coverage

### What the local stack can and can't show

The pinned mockestrator quotes every intent at **zero fee** and ignores
`destinationGasUnits`. Before each fill it also writes 1e12 base units of
every configured token (1e6 USDC) into the account. So an underfunded permit
never fails locally, and a "first registration completes" test passes with or
without the fix.

The e2e oracle is therefore the gas limit on the wire: the `destinationGasUnits`
the app sends to `/orchestrator/intents/route` for the register leg. That is
the one number the real orchestrator prices the leg from. It is checked
against the deploy's gas measured on the fork (`eth_estimateGas` of the exact
`deployProxy` calldata, from a never-deployed sender, minus the 21,000
intrinsic cost).

"First registration" is set up by clearing the resolver's code with
`anvil_setCode` and reloading. "Resolver exists" restores it, or sets
placeholder code. The original code is put back in a `finally`. The manager
suite runs with `workers: 1`, so nothing else sees the window.

### e2e (real browser, real chain reads, real router)

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | funds the resolver deploy in the register leg of a first registration (primary name on) | Same batch shape quoted with the resolver absent and present. The deploy is in the batch exactly when the resolver has no code (guard), and the gas limit with it exceeds the one without by at least the deploy's measured cost | FAIL: +0 gas against 162,346 measured | pass: 450,000 → 660,000 (+210,000) without the primary-name call; 700,000 with it |
| 2 | same, primary name off | The toggle is switched off, so the batch carries no `setNameWithHCA`. Same assertions | FAIL: +0 against 162,346 | pass: +210,000 |
| 3 | blocks checkout and keeps the "up to" hedge when the budget quote fails (`@smoke`) | Only the registration's own quotes return 500. The picker shows the refusal, Register is disabled, the hedge stays. Positive control: with the orchestrator back, the same name checks out | FAIL: no error, "$16.52" unhedged, Register enabled | pass |
| 4 | a quote that fails at the click does not start the registration | The picker shows a healthy quote, the 60s cache lapses, then the click's re-quote fails. The flow must not start: no "Registration Failed" screen, nothing persisted to resume, then the refusal is shown | FAIL: the flow started and ended on "Registration Failed — HCA budget could not be quoted (source: fallback)" | pass |

The session-enable intent in front of the picker also goes through
`/intents/route`, so tests 3 and 4 fail only requests whose batch carries
`commit` or `register`.

### Unit (vitest, `packages/transaction-manager`)

`estimateHcaBudgetActor` had tests for the primary-name widening but none for
the deploy. Added to `registration.hca.actors.test.ts`:

| Case | Pre-fix | PR |
|---|---|---|
| funds the resolver deploy in the register gas limit exactly when the batch carries it: `getCode` `'0x'` vs `'0xfe'`, the deploy is in the batch only in the first, and the limit differs by at least 185,904 (the PR's Sepolia measurement) | FAIL: `expected 0 to be ≥ 185904` | pass |

The assertion doesn't import `HCA_RESOLVER_DEPLOY_GAS`, so the pre-fix run
fails on the gas comparison, not on a missing export.

---

## 3. Results

On the PR build merged onto `e2e-tests-coverage`:

- `registration-rhinestone.spec.ts`: 8/8 pass, in 9.6 min (the 4 existing tests plus the 4 above).
- `pnpm test:manager-smoke`: 6/6 pass, in 2.3 min.
- Unit tests: transaction-manager 257/257, smart-account 103/103 (1 skipped), manager `src/features/register-v2` 221/221.
- `pnpm typecheck` is clean in `apps/manager`, `packages/smart-account`, `packages/transaction-manager` and `e2e`. `biome check` reports one complexity warning in `budget.ts`, and it already exists on the base branch.

With the PR's app files reverted to `e2e-tests-coverage`, all 4 e2e tests and
the new unit test fail, each on the assertion that encodes the bug.

**Locally, `test:manager-smoke` needs `MAILINATOR_API_KEY`.** The smoke config
loads `notification.spec.ts`, which throws at import without it. None of its
tests are `@smoke`, so any placeholder value works.

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
  wallet can't drive the HCA route (see the manager mock-wallet notes), so use
  it only for M5.
- **Open DevTools → Network**, filter on `intents/route`, and turn on
  "Preserve log". Each request's payload has `destinationGasUnits` and
  `destinationExecutions`.
- **First registration:** on a freshly started Anvil, account 0's HCA has no
  resolver. After any completed registration it has one. To get back to a
  first registration without restarting, clear the resolver's code with
  `cast rpc anvil_setCode <resolver> 0x`. The resolver is the `to` of the
  `0xb4436dde…` call in the register-leg payload. Afterwards, restore it with
  `cast code` saved beforehand.
- If owner rows are empty after an Anvil restart, reset Panoptes: wipe
  `ens_v2.db*` in the `infra_panoptes-data` volume and restart the indexer.

### Steps

| # | Steps | Pass |
|---|---|---|
| M1 | First registration. Open `/register/<new label>`, click **Pay with stablecoins**, enable sessions, and pick **USDC**. Find the `intents/route` request whose executions include `0xcff3e7c2…` (register) | The batch starts with a call to `0xDa70…2991` (`0x5d84121a…`, `deployProxy`). `destinationGasUnits` is **660000** with the primary-name toggle off, and 660000 + the primary-name gas with it on (700000 for any name up to 31 bytes) |
| M2 | Complete that registration, then repeat M1 with another new label | No `deployProxy` call. `destinationGasUnits` is **450000** (+ the primary-name gas when on) |
| M3 | Failed quote. Open the picker as in M1, so sessions are already enabled. Right-click any `intents/route` request → **Block request URL**, then reopen the picker by navigating to the same `/register/<label>`. Blocking before enabling sessions blocks the session-enable intent too | "We couldn't work out the full cost of this registration right now…" is shown, **Register name** is disabled, and the total reads **up to $…** |
| M4 | Unblock the URL and reopen the picker | No error. Register is enabled |
| M5 | Click path. Open the picker with a healthy quote and wait **70s**. Block `intents/route`, then click **Register name** | The picker stays open with the M3 message. No "Registration Failed" screen, and nothing to resume after a reload |
| M6 | EOA route. Set `VITE_FF_USE_EOA=true` (and `VITE_USE_MOCK_WALLET=true`), restart, block `intents/route`, open the picker | Register is enabled on the rent alone. No quote error, because this route never quotes a budget |
| M7 | **Sepolia, real orchestrator (the only end-to-end proof).** On a wallet whose HCA has never registered, register a name with USDC, primary name on | The reveal lands and the name is registered to the wallet. The HCA's USDC balance after the reveal is ≥ 0, and the reveal does not fail for insufficient funds. Before the fix this is the case that stranded the commitment |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Medium (test infra) | The local mockestrator can't reproduce the underfunding. Zero fees and a pre-fill top-up mean a short permit never fails, and no local test can show a stranded commitment. Coverage here stops at the gas limit sent on the wire. M7 on Sepolia is the only end-to-end check. A mockestrator mode that prices on `destinationGasUnits` and debits the fee token would close this |
| F2 | Low | The fork measures the deploy lower than the PR does: 162,346 execution gas here (estimate minus 21,000), against 185,904 on Sepolia. The 210,000 constant covers both. The unit test pins the Sepolia figure as the floor |
| F3 | Low | The EOA route (`VITE_FF_USE_EOA=true`) has no e2e coverage, because CI builds the HCA route. The PR's unit tests cover it, and M6 checks it by hand |
| F4 | Info | The PR description names `resolverDeployed` and `hcaBudgetQuoteRequired`, but the code uses `isResolverDeployed` and `isHcaBudgetQuoteRequired` |
| F5 | Info | `pnpm test:manager-smoke` fails locally without `MAILINATOR_API_KEY`, because `notification.spec.ts` throws at import. That isn't new with this PR |
