# WEB-1229: Stale error after an automatic resubmission, QA test plan and report

PR: [#1284 fix(transaction-manager): clear a retried submission's error once it succeeds](https://github.com/ensdomains/apps-monorepo/pull/1284)
App: **portal** (`apps/portal`, `:3001`), through `packages/transaction-manager`
Spec: `e2e/projects/portal/tests/registration.spec.ts` (`a step that landed on a resubmission stays landed (WEB-1229)`)

---

## 1. Change surface

**The bug.** When a wallet send fails with a retryable error (anything but a
user rejection, a wallet refusal, a signer or chain mismatch, or a nonce
conflict), the transaction machine waits and sends again. If the second send
landed, the first send's error stayed in `context.error` through `pending`,
`confirming` and `success`. The portal reads `context.error` as "this step
failed" in two places:

- **Registration "Try again"** (`useRegistrationTransactions`) retires every
  step whose transaction has an error. A commitment that landed on its second
  send was retired along with the step that really failed, and went back to
  "Not Started".
- **Closing the transaction modal** (`TransactionModal`'s `onOpenChange`)
  calls `transactionManager.clear()` when the latest transaction has an error.
  `clear()` drops **every** transaction, so closing the modal during the
  commit-reveal wait wiped the whole run: the landed deploy and commitment read
  "Not Started", and the primary action became **Start** on the deploy.

The local history record and the `onTransactionArchived` payload also carried
`status: 'success'` together with the old error message.

**How a user reaches it:** register a name while the wallet connection drops
once (a dropped RPC socket, a wallet that times out the first request). The
app resubmits on its own and the step lands, and nothing looks wrong until a
later step fails or the user closes the modal.

| File | Role | Change |
|---|---|---|
| `transaction.machine.ts` | Writer | `submitting.onDone` assigns `error: undefined` with the hash. Every path to `success` goes through it, and `retrying` still carries the error for telemetry and the portal |
| `SUBMITTING.md` | Docs | The same, in the state doc |
| `transactionManager.test.ts`, `useRegistrationTransactions.test.tsx` | PR tests | The archived payload, and the hook's retry against a stubbed registration actor |

**Readers of `context.error` that the fix changes, in the portal:**
`useRegistrationTransactions` (Try again), `TransactionModal` (close),
`TransactionStateContent` (error alert, gated on `status === 'error'`, so
unaffected), the persisted record and the archived payload.

---

## 2. Automated coverage

### What the PR's own tests don't reach

The PR's tests stub the wallet transport, the receipt and the registration
actor (`getSnapshot` and `send` are mocked). They don't render the modal, and
they don't touch the close path or the local history store. These tests run
the real registration machine against the fork, with the headless wallet
failing one real `eth_sendTransaction`.

**Oracles:** the transaction ids' own state lines
(`Transaction tx-reg-<step> state: <state>`); the explorer hash on each "Done"
badge, read back from the chain (`status: success`, `from` the wallet); and a
scan of every transaction the wallet mined during the run, by target and
selector (`VerifiableFactory.deployProxy`, `ETHRegistrar.commit`).

**Harness note.** The headless wallet's `reject` crosses into the page through
Playwright's `exposeFunction`, which keeps only the error message. Every
rejection therefore reaches the app as a code-less error, which is retryable,
4001 included. The transient failure uses that directly. A step that must fail
for good is rejected on every attempt: one send plus three resubmissions, the
machine's default `retryCount`.

### e2e (real browser, real chain)

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | `Try again after a failed approve keeps the commitment that landed on its second send` **@smoke** | The reported repro. Commit: first send fails, the resubmission lands. Approve: every attempt fails. **Positive control:** the approve shows "Transaction Error" and Try again. After Try again: a new approve prompt arrives, Approve reads "In Progress", Deploy resolver and Submit commitment read **Done** and link their mined transactions, and the commitment's state lines are exactly `retrying → submitting → pending → success` | FAIL on `Submit commitment must still read Done`: received "Submit commitment Not Started" | pass, 15s |
| 2 | `the retried run finishes with the one commitment it already paid for` | The full legitimate path after Try again: the name is registered to the wallet (`getOwner`), and the chain holds exactly one deploy and one commitment, the one the modal linked | FAIL on `Submit commitment must still read Done` | pass, 1.1m |
| 3 | `closing the modal during the commitment wait keeps the steps that landed` | No approve step (allowance set to max), so the commitment is the latest transaction for the whole wait. Escape closes the modal. **View registration progress** reopens it with Deploy resolver and Submit commitment **Done**, Register name "Not Started" (the page has loaded), **Next** shown and no **Start**. The run then registers the name with exactly one deploy and one commitment on chain | FAIL on `Deploy resolver must still read Done`: received "Deploy resolver Not Started" | pass, 1.2m |
| 4 | `closing the modal after a step really failed keeps the steps that landed` | **Known defect E2E-018, `test.fail()`.** Not this PR's bug: after a real approve failure, closing and reopening the modal must still show the landed steps Done and offer no Start | FAIL (same defect) | FAIL on `Deploy resolver must still read Done`, reported as expected-to-fail |

Tests 1–3 fail on the assertion that encodes the bug, not on a timeout or a
setup step.

### Unit (vitest, `packages/transaction-manager`)

Added to the PR's `automatic submission retry` describe in
`transactionManager.test.ts`:

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| `archives a local history record with no error for a retried success` | The **local history record** (`getTransactionHistory()`, the store `archiveTransaction` writes), which the PR's test does not read, holds `state: success` and no `context.error` | FAIL: `expected 'Failed to submit transaction: An unkn…' to be undefined` | pass |
| `keeps the error of a submission that never lands` | **Guard.** The fix clears the error only once a hash arrives. A submission that runs out of retries ends in `error` with the message in the snapshot, the archived payload and the history record | pass (guard) | pass |

---

## 3. Results

Run on `test/verify-pr-1284-stale-error` (`e2e-tests-coverage` + PR head
`pr-1284-head`), local fork, Panoptes re-indexed for the 2026-10-01 redeploy.

| Check | Result |
|---|---|
| `pnpm typecheck`, `apps/portal`, `packages/transaction-manager`, `e2e` | pass |
| `packages/transaction-manager` vitest (all) | 260 passed |
| `apps/portal` vitest (`features/register`, `features/transaction-manager`) | 277 passed |
| PR's unit tests with the fix reverted | Both fail, as the PR says |
| `registration.spec.ts` (whole spec, with the harness) | 29 passed, 4 failed, none in WEB-1229 and none from the PR (F4, F5). The three WEB-1229 tests and the name-switch test re-run green together after the allowance fix (4 passed, 3.0m) |
| `pnpm test:portal-smoke` | 13 passed, 2.9m (WEB-1229 #1 in 15.5s) |
| Biome on the touched files | No new warnings (the two complexity warnings are on the base too) |

Pre-fix means only `packages/transaction-manager/src/machines/transaction.machine.ts`
reverted to the base, with Vite hot-reloading the portal.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
```

- **Wallet:** a browser wallet on Anvil account 0 (`0xf39F…2266`), on the local
  Sepolia fork.
- **Needs an approve step (M1, M2):** set the USDC allowance to the registrar to
  0 first:
  `cast send <usdc> "approve(address,uint256)" <ensEthRegistrar> 0 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://localhost:8545`
  (addresses from `ensL1Contracts[sepolia]`: `usdc`, `ensEthRegistrar`).
- **No approve step (M3):** the same with `$(cast max-uint)` in place of `0`.
- **A transient send failure.** Real wallets don't drop a send on demand. In
  DevTools, before pressing Start, fail the next `eth_sendTransaction` once:

  ```js
  const p = window.ethereum, send = p.request.bind(p); let armed = false
  p.request = (a) => a.method === 'eth_sendTransaction' && armed
    ? ((armed = false), Promise.reject(new Error('socket hang up')))
    : send(a)
  // then, once the resolver deploy has landed:
  armed = true
  ```

  Confirm it took effect: the console logs
  `Transaction tx-reg-commit state: retrying`, and the wallet asks for the
  commitment a second time about 2s later.
- **A step that fails for good:** reject the approve in the wallet. A real
  wallet's 4001 is terminal, so a single rejection is enough.

### Steps

| # | Steps | Pass |
|---|---|---|
| M1 | Open `/register?name=<new label>.eth`, pick USDC, **Register**, **Start**. Confirm the deploy. Arm the failure, confirm the commitment's second prompt. Reject the approve. Press **Try again**, then the back arrow | The approve prompts again. The overview shows Deploy resolver **Done**, Submit commitment **Done** (each badge links to its transaction), Approve **In Progress** |
| M2 | Continue M1: confirm the approve, wait out the countdown, confirm the register | The name is registered to the wallet. The wallet sent one commitment (Activity tab, or `cast` on the owner's transactions) |
| M3 | No approve step. As M1 up to the commitment landing. While "Ready in Ns" counts down, press **Esc**. Click **View registration progress**, then the back arrow | Deploy resolver and Submit commitment **Done**, Register name Not Started. The button reads **Next**, not **Start** |
| M4 | Continue M3 and finish | Registered, one deploy and one commitment |
| M5 | Control. Register a name with no injected failure | Unchanged: every step reads Done in turn, registered |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | S3, logged as **E2E-018** (pre-existing, outside the PR) | **Closing the modal after a real failure still wipes the run, and Start pays for it twice.** `TransactionModal` calls `transactionManager.clear()` on close whenever the latest transaction has an error. The PR stops a *stale* error from triggering it, but a *real* one still does, and `clear()` drops every transaction, not just the failed one. Measured on the PR build: approve fails for good → **Esc** → **View registration progress** shows all four steps "Not Started" with **Start**. Pressing Start begins a new run: the chain shows **two** `deployProxy` and **two** `commit` transactions from the wallet for one registration (gas for a second resolver and a second commitment, and an orphaned resolver). No USDC is charged twice. Reachable with a real wallet by rejecting the approve and closing the modal. Pinned by `closing the modal after a step really failed keeps the steps that landed`, marked `test.fail()` and measured failing on `Deploy resolver must still read Done`. Fix candidates: clear only the failed transaction, or route the reopened modal's Start through the existing run's RETRY |
| F2 | Harness | The headless wallet can't produce a terminal rejection: `exposeFunction` drops `code`, so a 4001 is retried like a network error. Tests that need a step to fail for good must reject every attempt. Worth knowing before reading any headless "user rejected" test as covering the terminal path |
| F4 | Test fragility (pre-existing) | `switching to a different name mid-flow cancels the first registration…` (@smoke) assumes the run has no approve step. With a partial USDC allowance to the registrar, A's approve prompt is queued before the switch and counted as a prompt "after" it, so the test fails in ~5s. Measured failing with the fix reverted too, and passing at max allowance. The WEB-1229 tests change the allowance to pick their flow, so they now restore it after each test |
| F5 | Environment (shared fork state) | Three tests (`the crafted link is ignored even on a name the visitor really owns`, `a real registration still shows the banner…`, the WEB-281 Extend test) wait for the Owner row to read `0xf39F…2266`. Account 0's primary name is `rh-e2e-murxslga.eth` on this fork, set by an earlier `rh-e2e` run, so the row shows the name. Not related to this PR |
| F3 | Harness, fixed on this branch | `e2e/infra/panoptes/contracts.json` still listed the 09-15 stack after #1301 moved the V2 contracts, so the indexer skipped every event and the harness check `panoptes: the indexer is watching the contracts the apps actually talk to` failed. Regenerated (separate commit), and the indexer re-synced from the new root registry's deploy block |
