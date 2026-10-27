# #1559 — Optional manager handover on V1 transfer: QA test plan & report

PR: [#1559 fix(portal): make the manager handover optional when transferring a .eth name](https://github.com/ensdomains/apps-monorepo/pull/1559) (merged as `ad4b650`)
App: **portal** (`apps/portal`)
Spec: `e2e/projects/portal/tests/transfer.spec.ts` (`Portal name transfer — unmigrated V1 names › optional manager handover (#1559)`)

Builds on [`transfer-v1-web1396-test-plan.md`](./transfer-v1-web1396-test-plan.md),
which explains the registrant/controller split an unwrapped V1 2LD has.

---

## 1. Change surface

Before #1559 an unwrapped `.eth` 2LD always moved with `reclaim` (controller)
then `safeTransferFrom` (registrant). The sender could not hand over the token
alone.

| File | Role | Change |
|---|---|---|
| `utils/buildTransferPlan.ts` | plan | New `transferManager` option; `reclaim` is dropped from the `v1-registrar` move when it is off |
| `v1/rules.ts` → `getV1DetachTargets` | visibility | Offers `transferManager` only for `v1-registrar` subjects, including a registrant who is not the controller |
| `hooks/useTransferDetachTargets.ts` | visibility (V2) | Always hides it: V2 has no separate manager role |
| `components/SendNameForm.tsx` | UI | "Transfer the manager role too" switch, **on by default**; off-state warning |
| `v1/V1SendName.tsx` | UI copy | The "Another wallet manages this name" notice no longer claims the transfer always hands over both roles |
| `types.ts` | type | New `TransferDetachOptionKey` |

**What must still work:** the default plan (`reclaim` → `transfer-erc721`),
covered by F23/F28; wrapped and registry-only moves, which never had a
`reclaim`.

**What the PR's own tests don't reach:** the switch rendered for a real V1
subject resolved from chain; the one-step plan landing; the controller slot
actually staying put; and the recovery the warning promises (the recipient
pressing **Reclaim manager** on the Ownership page).

## 2. Automated coverage

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| `offers the handover on by default for an unwrapped 2LD, warning when it is switched off` (`@smoke`) | The switch is offered and checked; off, the warning says who keeps the records | **FAIL**: switch not found | pass |
| `with the handover off, moves only the registrant; the recipient then reclaims the manager` | Only `transfer-erc721` runs, no `reclaim` line is logged. On chain the registrant is the recipient and the controller is still the sender. Then, connected as the recipient, **Reclaim manager** moves the controller to them on chain | **FAIL**: switch not found | pass |
| `a registrant who does not manage the name can leave the third-party manager in place` | The notice no longer claims both roles move. Record options stay hidden but the switch is offered. Off, the third-party controller is untouched on chain | **FAIL**: old notice text | pass |
| `never offers the handover for a wrapped name or a registry subname` | The negatives are guards (pre-fix had no switch anywhere); the closing control (an unwrapped 2LD *is* offered it) is what fails pre-fix | **FAIL** on the control | pass |
| F23, F28 (existing) | Default plan is unchanged: both halves move | pass | pass |

Unit: `useTransferName.strand.test.tsx` (test-branch only, WEB-1508) gained
`transferManager: false` so it typechecks against the new `TransferOptions`.
No new unit tests: the PR's own plan, visibility and form tests cover the
writer and reader.

## 3. Results

Run 2026-10-27 against the local fork (mock bigname), PR merged onto
`e2e-tests-coverage`.

- PR build: the whole `unmigrated V1 names` block 37/37; portal transfer unit
  tests 236 passed + 1 expected fail; e2e typecheck clean.
- Pre-fix (the PR's six app files reverted): the four new tests fail on the
  assertions above; F23/F28 pass.
- Portal smoke: 18 passed, 2 failed in `registration.spec.ts` (WEB-1229,
  WEB-1572); both passed on an isolated re-run. The shared anvil clock was
  ~5.5 h ahead of wall time. Not this PR.

## 4. Manual plan

### Setup

```bash
pnpm e2e:infra:up
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

Run two mock-wallet portals, one per side of the transfer. `.env` beats the
shell, so use mode files (untracked) rather than `VITE_USE_MOCK_WALLET=true pnpm dev`:

```bash
cd apps/portal
printf 'VITE_USE_MOCK_WALLET=true\n' > .env.manual
printf 'VITE_USE_MOCK_WALLET=true\nVITE_MOCK_ACCOUNT=0x70997970C51812dc3A010C7d01b50e0d17dc79C8\n' > .env.manual2
pnpm exec vite --mode manual  --port 3042   # sender (user)
pnpm exec vite --mode manual2 --port 3043   # recipient (user2)
```

### Seeding

```bash
# from e2e/ — one per scenario; each name transfers once
SHAPE=ok          pnpm seed:v1-transfer   # A, B, C, D
SHAPE=eth-wrapped pnpm seed:v1-transfer   # E

REG=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
K=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# C: hand the manager to user3
cast send $REG "setOwner(bytes32,address)" $(cast namehash <C>) 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --private-key $K -r http://127.0.0.1:8545
# D: a registry-only subname sub.<D>
cast send $REG "setSubnodeOwner(bytes32,bytes32,address)" $(cast namehash <D>) $(cast keccak sub) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --private-key $K -r http://127.0.0.1:8545
```

Check ownership after each step:

```bash
cast call 0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85 "ownerOf(uint256)(address)" $(cast to-dec $(cast keccak <label>)) -r http://127.0.0.1:8545   # owner
cast call $REG "owner(bytes32)(address)" $(cast namehash <name>) -r http://127.0.0.1:8545                                                        # manager
```

Recipient for every transfer: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.

### Steps

1. **Default (A).** `:3042/<A>/ownership/transfer`, paste the recipient.
   *Pass:* "Transfer the manager role too" is on, no warning; the modal has two
   steps; afterwards owner and manager are both the recipient.
2. **Off (B).** Same route, switch it off. *Pass:* the warning "The current
   manager keeps control … from the Ownership page" appears; the modal has one
   step; afterwards owner = recipient, manager = sender.
3. **Recipient reclaims (B).** `:3043/<B>/ownership`. *Pass:* **Reclaim
   manager** is shown; after it lands, manager = recipient.
4. **Third-party manager (C).** Transfer route. *Pass:* the notice ends "You can
   still hand the recipient the manager role along with the name" and does not
   say the transfer hands over both roles; no ETH-address option; the switch is
   shown. Off → manager stays user3. On → manager becomes the recipient.
5. **Other shapes (D, E).** Transfer route, paste the recipient. *Pass:*
   Transfer name is enabled and there is no manager switch.
6. **Toggle back.** On an unused name, switch off then on. *Pass:* the warning
   disappears and the plan is two steps again.

## 5. Findings

| ID | Severity | Finding |
|---|---|---|
| H-F1 | Low (test branch only) | `useTransferName.strand.test.tsx`, which only `e2e-tests-coverage` carries, builds a `TransferOptions` literal without `transferManager` and fails typecheck once #1559 is in. Fixed in the retrofit commit. |
| H-F2 | Info, pre-existing | `useRemoveUserPlan.test.ts` has 5 portal typecheck errors on `e2e-tests-coverage`, unrelated to #1559. |

No defects in the PR itself.
