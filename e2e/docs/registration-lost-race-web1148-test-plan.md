# WEB-1148 / WEB-1224: Registration retry loops, QA test plan and report

PR: [#1259 fix(registration): unbreakable retry loops in the registration machine](https://github.com/ensdomains/apps-monorepo/pull/1259)
App: **manager** (`apps/manager`, `:3000`), through `packages/transaction-manager`
Spec: `e2e/projects/manager/tests/registration-rhinestone.spec.ts` (`lost same-name registration race (WEB-1148)`)

---

## 1. Change surface

**WEB-1148, the bug.** Two people register the same name. Both commits land,
the winner reveals first, and the loser's reveal then fails because the label
is already owned. Nothing recognised that. On the standalone-HCA path (the
default, `VITE_FF_USE_EOA=false`), the reveal's price re-read reverts inside
`submitRevealBatch`. The machine went straight to `error` with
`retryTarget: 'submittingRhinestoneBundle'`, and the failure screen showed
"Registration Failed" with a raw `getRegisterPrice` revert and **Try Again**.
Each press re-ran a reveal that can never succeed. Measured pre-fix: after 3
presses, 4 failed reveal attempts and the same screen. Only CANCEL or a refresh
got out. On a retry with no `retryTarget`, the machine's catch-all restarts at
`deployingResolver`, which pays for a new commitment on every press. That is
the commit loop in the report. It wasn't reached on the HCA path here.

**How a user reaches it:** start registering a name that someone else is
registering at the same moment, and lose the reveal.

**WEB-1224.** `preparingCommitment.onError` targeting `committingTransaction`
is **already fixed on `main`** by #1272 (`9545ef49d`). This PR's WEB-1224
commit only adds comments and unit tests, so there is no pre-fix app build to
test against.

| File | Role | Change |
|---|---|---|
| `registration.actors.ts` | Reader (EOA verify) | `verifyRegistrationActor` returns `registeredToOther` (owner set and not us); `pollUntilVerified` stops polling on it |
| `registration.hca.actors.ts` | Reader (HCA verify) | `verifyHcaRegistrationActor` returns `registeredToOther` (`REGISTERED`, `latestOwner` ≠ wallet) |
| `registration.machine.ts` | Machine | Reveal failures (`registeringDomain`, `submittingRhinestoneBundle`) go to `verifyingRegistration` with `revealSubmitFailed` (read once, keep the submit error). `registeredToOther` → `error` with `nameUnavailable`, no `retryTarget`. RETRY is refused while `nameUnavailable` |
| `registrationUi.machine.ts` | UI machine | Carries `nameUnavailable` onto `failure`; the `retry` transition is guarded |
| `FailureStep.tsx`, `messages.po` | UI | "Name No Longer Available", explanation, no Try Again, Back to Quote as primary |

---

## 2. Automated coverage

The PR's unit tests stub the verify actors, the reveal actor and the UI child
machine. These tests run the whole thing on the fork. A second account
(`user2`) really registers the exact label during our cooldown, using
`makeName({ exactLabel: true })`. The real price re-read reverts, the real HCA
verify reads the registry, and the real failure screen renders. The oracle for
ownership is `ETHRegistry.getState(labelHash).latestOwner`. The oracle for "no
re-submission" is the transaction manager's `tx-reg-commit` and
`tx-reg-register` state lines.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | Ends on "Name No Longer Available" with no retry when another address registers the name first | Chain shows `user2` as owner; the screen shows "Name No Longer Available" and "`<name>` was registered by another address first"; Back to Quote shown, **no Try Again**, no "Registration Failed"; nothing re-submitted for 5s; owner unchanged; Back to Quote lands on the name's profile | ❌ fails on `Name No Longer Available` visible: the page shows "Registration Failed" + Try Again | ✅ 1.2m |
| 2 | Still offers Try Again for a reveal failure nobody else caused, and the retry completes without re-committing | Positive control. `getRegisterPrice` calls get an injected 503 during the reveal. The label is still `AVAILABLE` on chain; the screen shows "Registration Failed" with the real 503 error and Try Again. Removing the fault and pressing Try Again registers the name to the wallet, with a `tx-reg-register` success and **no** new `tx-reg-commit` | ✅ guard | ✅ 1.4m |
| 3 | A reload after losing the race shows the new owner and re-submits nothing | The failed run is persisted (`stage: error`). After a reload: redirected to the name's profile showing `user2` as owner, no failure screen, no commit/reveal lines for 10s, the resume record is dropped | ✅ guard (the route loader, not the PR, does this) | ✅ 1.4m |

Test 1 fails on the assertion that encodes the bug, not on a timeout or a
setup step. Tests 2 and 3 are guards: they check that the new terminal branch
doesn't swallow ordinary failures and that reload can't bring back the loop.
Neither behaviour changed.

Not tagged `@smoke`. Each test sits through the real 60s commitment cooldown,
and the manager smoke set is already about 4.7 of its 5-minute budget.

**Not reached end to end:** the pure-EOA reveal (`registeringDomain`) and its
verify actor. CI runs the HCA path. The PR's unit tests cover the EOA half.

---

## 3. Results (PR merged onto `e2e-tests-coverage`)

- New tests: 3/3 pass on the PR build. Test 1 fails on pre-fix code; 2 and 3
  are guards and pass on both.
- `registration-rhinestone.spec.ts` in full (A2 + the three above): 4/4.
- `pnpm test:manager-smoke`: 3/3. Needs `MAILINATOR_API_KEY` in the
  environment. `e2e/.env.ci` doesn't carry it; CI injects it as a secret.
- Unit tests: `packages/transaction-manager` registration 128/128,
  `apps/manager` register-v2 204/204.
- Typecheck is clean in `apps/manager`, `packages/transaction-manager` and
  `e2e`. `biome check` shows no new warnings.

**Stack note.** The shared anvil's clock had drifted about 29 days ahead of
wall time, from earlier time-travel runs. On it, every HCA registration,
including the existing A2 test, failed before reaching the PR's code ("Commitment
timestamp not recorded"). A restart of anvil plus a Panoptes reset fixed it.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator panoptes-indexer panoptes-api
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/manager/.env.ci apps/manager/.env      # VITE_FF_USE_EOA=false (HCA path)
pnpm --filter manager dev -- --port 3000
```

- **Wallet.** A browser wallet with Anvil account 0 (`0xf39F…2266`) on the
  local fork (chain id 11155111, RPC `http://127.0.0.1:8545`).
- **The rival.** Pick a fresh label, say `race-test-1`. The command below
  registers it verbatim to `user2` (`0x7099…79C8`). Run it **during the
  commitment countdown** of step M1:

  ```sh
  OWNER=user2 STATE=active LABEL=race-test-1 EXACT_LABEL=1 pnpm --filter @ens-apps/e2e seed:name
  ```

### Steps

| # | Step | Pass |
|---|---|---|
| M1 | Search `race-test-1`, open it, Pay with stablecoins → USDC → Register name → Set up later. Wait for the commit to confirm and the countdown to start, then run the rival command | The rival command prints `registered race-test-1.eth` |
| M2 | Wait for the countdown to end | The failure panel reads **Name No Longer Available** and "race-test-1.eth was registered by another address first." The body says another address registered it first. **No Try Again**; Back to Quote is the only (blue) button |
| M3 | Wait 30s on that screen; watch the console | No new `tx-reg-commit` or `tx-reg-register` lines; no wallet prompts |
| M4 | Press Back to Quote | Lands on `/race-test-1.eth`, which shows `0x7099…79C8` as owner |
| M5 | Repeat M1–M2 with `race-test-2`, but press reload on the failure screen instead | Lands on the profile for `race-test-2.eth` owned by `0x7099…79C8`; no registration resumes; no wallet prompt |
| M6 | Ordinary failure: start `race-test-3` and, during the countdown, block `127.0.0.1:8545` / `/rpc` in DevTools (Network → Block request URL). Unblock after the failure screen appears | "Registration Failed" with the network error and **Try Again**. Pressing Try Again completes the registration with no new commit (the wallet is not asked to pay again) |
| M7 | EOA path (optional): set `VITE_FF_USE_EOA=true` and repeat M1–M4 | Same as M2–M4; the wallet is asked for the reveal, which fails, and the screen still ends on Name No Longer Available |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Info | The WEB-1224 half of the PR changes no behaviour: the fix is already on `main` (#1272, `9545ef49d`). The PR description reads as if it introduces it |
| F2 | Low, pre-existing | A retryable failure shows the whole viem error on screen: the RPC URL and the full `eth_call` request body (see M6). It's not from this PR, but the PR now keeps the submission error as the message by design (`revealSubmitFailed`), so this is what users see after a flake |
| F3 | Low, pre-existing | `DataCloneError` when saving and archiving `tx-reg-register` to IndexedDB: the `onIntentSubmitted` callback in the request can't be cloned. No user-visible effect seen; persistence of that transaction silently fails |
| F4 | Test infra | `e2e/.env.ci` has no `MAILINATOR_API_KEY`, so `pnpm test:manager-smoke` can't run locally from the CI env copy alone |
