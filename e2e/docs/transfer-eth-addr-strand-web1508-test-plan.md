# WEB-1508: ETH address record ahead of the transfer — QA test plan

PR: [#1217 Tell the truth about the transfer's ETH address step, and recover when the move fails](https://github.com/ensdomains/apps-monorepo/pull/1217) (Immunefi #93008)
App: **portal** (`apps/portal`, `http://localhost:3001`)
Specs: `e2e/projects/portal/tests/transfer.spec.ts` (describe "ETH address record ahead of the move (WEB-1508, #1217)"),
`apps/portal/src/features/transfer/hooks/useTransferName.strand.test.tsx`

---

## 1. Change surface

| File | Role | Change |
|---|---|---|
| `components/SendNameForm.tsx` | UI | The ETH switch's "Not needed while the resolver is being detached" state now keys off the detach **in the plan** (`effectiveOptions.detachResolver`), not the stored toggle, which defaults to on even when hidden. New warning when the resolver can't be detached. New destructive alert for a stranded record, with **Restore ETH address**. |
| `hooks/useTransferName.ts` | Writer / state | Reads the pre-flow ETH record at prepare time (fresh, `staleTime: 0`). Tracks which steps confirmed and which were sent but never settled. Derives `recordAheadOfMove` only once the modal is closed. `restoreEthAddress` swaps the plan for a one-step `restore-eth-addr` flow. A retry keeps the first attempt's pre-flow address. |
| `utils/buildTransferPlan.ts` | Reader | New `restore-eth-addr` step kind (never in a plan) and `isRecordAheadOfMove`. |
| `utils/buildTransferStepIntent.ts` | Writer | `restore-eth-addr` uses the same setter builder as `set-eth-addr`, targeting `previousEthAddress`; refuses when there is none. |
| `queries/getEthAddress.ts` | Reader | Exports the error type. |

**What a user can reach.**
1. The false "Not needed" label: any name with its own resolver and an ETH record, where the sender can't detach the resolver (V1 wrapped with `CANNOT_SET_RESOLVER` burned; V2 without `ROLE_SET_RESOLVER`).
2. The stranded record: any transfer whose plan includes `set-eth-addr`, where the move fails afterwards, either because the second wallet prompt is rejected or because the recipient starts refusing the token after the preflight.

**What the PR's own tests don't reach:** a real fuse driving the option rules, a real ETH record, the real modal's retry policy and Close, a move that really reverts on chain, and the restore transaction landing.

---

## 2. Automated coverage

All e2e tests use V1 wrapped names on the V1 PublicResolver. On this fork a fresh V2 name's per-name resolver has no `setAddr`, so it can't hold an ETH record (that's why F12 and the F9 ETH rows fail on every build). `CANNOT_SET_RESOLVER` on a locked V1 name is the reachable "record offered, detach not" shape. The V2 role-missing case is covered only by the PR's `SendNameForm.test.tsx`.

Oracles: `addr(60)` via `getAddressRecord`, `NameWrapper.ownerOf`, `ENSRegistry.resolver`, and the step transaction ids.

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| e2e `lets the user opt out of the ETH repoint when the resolver detach is not on offer` (`@smoke`) | With the detach hidden, the ETH switch is live, no "Not needed" claim is made, and the "stays attached" warning shows. Opting out sends one step; the name moves while `addr(60)` and the resolver stay. | **FAIL**: switch disabled (`toBeEnabled`) | pass |
| e2e `still marks the ETH repoint redundant while a real resolver detach is planned, and repoints it once the resolver is kept` | Guard and positive control. "Not needed" still shows when the detach really is planned, the new warning doesn't. Keeping the resolver re-enables the switch, and the two-step flow lands `addr(60)` = recipient and moves the name. | pass (guard) | pass |
| e2e `says the ETH address was already repointed when the transfer prompt is rejected, and restores it` | Exact repro. `set-eth-addr` lands, the move prompt is rejected until Failed, and the chain shows record = recipient, owner = sender. No alert while the modal is open. After Close, the alert names the recipient and `Restore it to <owner>`. Restore is a single step and writes `addr(60)` back; the name doesn't move. | **FAIL**: no alert after Close | pass |
| e2e `restores the original ETH address after a recipient that starts refusing the token, even across a retry` | Report repro. The recipient is an EOA at preflight; the move is broadcast with automine off, the recipient is given Multicall3's code, and the block is mined, so it reverts on chain ("Transaction 0x… reverted"). The alert shows. A retry (recipient fixed, second prompt rejected) still offers the **pre-flow** owner, not the recipient. Restore lands it. | **FAIL**: no alert after Close | pass |
| unit `useTransferName.strand.test.tsx` (7) | Hook round trip: stranded after close with the pre-flow address; quiet while the modal is open, when the move confirmed, and when the record was rejected too; restore is one `restore-eth-addr` step built from the pre-flow address; a retry keeps it; no restore when the record was unset. | n/a (API added by the PR) | pass |

**Mutation checks (PR build, one line at a time):**

| Mutation | Caught by |
|---|---|
| Retry uses `saved.previousEthAddress` instead of keeping the first attempt's | e2e test 4 (alert said `Restore it to <recipient>`); unit "keeps the first attempt's address" |
| Drop the `!isOpen` gate | unit "stays quiet while the modal is still open" |
| Stop recording confirmed steps | 4 unit tests |

---

## 3. Results (2026-10-05, PR head `84db3921b` merged onto `e2e-tests-coverage`)

- Pre-fix = the PR's 5 app files checked out from `origin/main` (the PR's merge base for those files).
- New tests: 4/4 e2e and 7/7 unit pass on the PR build. Pre-fix: 3 e2e fail on the bug assertion, and the guard passes.
- `apps/portal` typecheck clean; transfer unit suite 166 passed + 1 expected fail; biome clean on touched files; e2e typecheck clean.
- Full `transfer.spec.ts` on the PR build: 63 passed, 12 failed, and all 12 fail identically on pre-fix:
  - 6 fail at `setEthAddressRecord` (per-name resolver has no `setAddr`): F10 ×2, F11, F12, F9 ×2.
  - F14 matches `Transaction <id> state: success` exactly and misses the `--<scope>` suffix the app now appends.
  - F5, F8, F15, F19, F20 are refused up front by `preflightMove` ("The transfer itself would fail"). F5 expects the modal to open; F8 is the known multiple-assignee revert. See Finding 1 for the subname three.
- `pnpm test:portal-smoke`: 14 passed, 1 failed: `switching to a different name mid-flow…` (registration), which fails identically on pre-fix.

---

## 4. Manual plan

### Setup

```sh
pnpm e2e:infra:up            # or the CI set: docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cd apps/portal && VITE_USE_MOCK_WALLET=true pnpm dev     # connected as 0xf39F… without prompts
```

Use a real wallet extension instead of the mock wallet for step B4, because rejecting a prompt needs one.

### Seeding

```sh
SHAPE=eth-locked-resolver pnpm --filter @ens-apps/e2e seed:v1-transfer   # detach not offered
SHAPE=eth-wrapped         pnpm --filter @ens-apps/e2e seed:v1-transfer   # detach offered
```

Each prints the name and the `/ownership/transfer` URL. Recipient: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (user2).

Check the ETH record at any point:

```sh
cast call 0x8FADE66B79cC9f707aB26799354482EB93a5B7dD "addr(bytes32)(address)" $(cast namehash <name>) --rpc-url http://127.0.0.1:8545
```

### A. The label (`eth-locked-resolver`)

1. Open the transfer URL and enter the recipient. **Pass:** no "Detach the resolver" switch; a yellow warning: "Your wallet isn't allowed to detach this name's resolver, so it stays attached…".
2. **Pass:** "Set the ETH address to the recipient" is on and clickable, with no "Not needed while the resolver is being detached." line.
3. Turn it off and transfer. **Pass:** one step ("Transfer name"); afterwards the `cast` read still prints your address.

### B. The stranded record (a fresh `eth-locked-resolver`)

1. Enter the recipient, leave the ETH switch on, click Transfer name. **Pass:** the modal lists "Update ETH address" then "Transfer name".
2. Approve the first prompt. **Pass:** "Update ETH address" shows Done; `cast` prints the recipient.
3. Reject the second prompt (repeat if the wallet asks again) until "Transfer name" shows Failed. **Pass:** no red alert is visible behind the modal.
4. Close the modal. **Pass:** a red alert: "The transfer didn't go through, so you still own this name — but its ETH address was already changed and now points to 0x7099…", then "Restore it to 0xf39F…", and a **Restore ETH address** button.
5. Click Transfer name again, approve step 1, reject step 2, close. **Pass:** the alert still says "Restore it to 0xf39F…", not the recipient.
6. Click Restore ETH address. **Pass:** a one-step modal ("Restore ETH address"); after approving, the modal closes, the alert is gone, and `cast` prints your address. The Ownership tab still shows you as owner.

### C. The positive control (`eth-wrapped`)

1. Enter the recipient. **Pass:** "Detach the resolver" is on; the ETH switch is greyed out with "Not needed while the resolver is being detached."; no "isn't allowed to detach" warning.
2. Turn the detach off. **Pass:** the ETH switch becomes clickable and on.
3. Transfer and approve both steps. **Pass:** redirected to Ownership with the recipient as owner, no red alert, and `cast` prints the recipient.

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | Medium (not this PR, unconfirmed) | On `main`, `preflightMove` refuses the subname transfers F15, F19 and F20 with "The transfer itself would fail" on both builds. If that's the same `TransferUnsafeWithMultipleAssignees` revert F8 hits (the parent also holding roles on the subname), subname transfer is blocked on `main`. Not investigated here. |
| 2 | Low (test debt) | F14 and F5 are stale against `main`: F14's console matcher misses the attempt-scope suffix (`driveTransactionsToSuccess` already handles it), and F5 expects a modal that `preflightMove` now never opens. |
| 3 | Harness | The headless wallet swallows `eth_sendTransaction` errors and never answers the page, so a send that fails at estimate time hangs the modal on "Waiting...". Test 4 forces an on-chain revert instead (automine off, change state, mine). |
| 4 | Coverage gap | The V2 "missing `ROLE_SET_RESOLVER`" variant isn't reachable end to end on this fork; only `SendNameForm.test.tsx` covers it. |
| — | None in the PR | No defects found in the change itself. |
