# WEB-674: On-chain revocation of HCA sessions, QA test plan and report

PR: [#1113 feat(smart-account): implement on-chain session revocation](https://github.com/ensdomains/apps-monorepo/pull/1113)
App: **manager** (`apps/manager`, `:3000`), plus `packages/smart-account`
Spec: `e2e/projects/manager/tests/hca-session-revoke.spec.ts` (`revoke smart sessions on-chain (WEB-674)`)

---

## 1. Change surface

**The bug.** A standalone-HCA session could only be "removed" from
`localStorage`. The deployed `HCAOwnerAndSessionValidator` is stateless: every
session-signed intent carries the owner's authorization inline, and the
validator checks it against the account's current session nonce. So the stored
record *is* the session. A copy taken off the device kept working until
`validUntil` (1 day), and disconnecting deliberately keeps sessions, so an owner
had no way to end one early.

**How a user reaches it:** sign a session (the "Enable sessions" step before
paying with stablecoins), then lose the browser, or suspect the record leaked.

**The fix, by role.**

| Role | File(s) | What changed |
|---|---|---|
| Writer | `smart-account/.../revoke-sessions.ts` | `revokeSessionsOnChain`: pins both clients to the HCA's chain, deploys first if asked, checks `ownerAndSessionNonce().owner`, sends the owner's `revokeSessions()` transaction, and requires the HCA's own `SessionsRevoked` log before clearing the stored record |
| Errors | `smart-account/src/errors.ts` | `SessionRevokeError` with a typed `reason` (`not-deployed`, `not-owner`, `wrong-chain`, `transaction-failed`, `unknown`) |
| State | `SmartAccountContext.tsx` | `revokeSession({ deployFirst })`, `forgetLocalSession`, `isRevokingSession`, `revokeError`, `revokeErrorReason`. The deployment call is built for the connected wallet, so a non-owner fails before paying for it |
| UI | `WalletSection.tsx`, `RevokeSessionsModal.tsx` | A "Revoke smart sessions" wallet-menu entry for any HCA (not only one with a session saved here). A confirm dialog that states the gas cost and that every session is ended, and offers "Set up and revoke" (plus the gas-free "Remove saved session") for an undeployed account |
| Docs | `HCA_SESSION.md`, `session-storage.ts` comments | Describes the current stateless validator. Local removal is labelled as not being revocation |

**What must still work:** enabling a new session after a revoke (the gate
re-prompts and signs against the new nonce); registration; disconnect, which
still keeps sessions.

**What the PR's unit tests don't reach:** the real menu and dialog, a real owner
transaction mined on the fork, the HCA's real `onlyOwner` check and nonce, the
real factory deployment, and wagmi's real wallet client when the wallet changes
chain.

**Why the oracle is the nonce.** For a deployed HCA, the local mockestrator
impersonates the account and never runs the validator. A revoked session would
still "register" through the UI, so a UI registration can't prove a copied
session is dead. The tests compare the copied record's `hcaSessionNonce` with
`ownerAndSessionNonce()` on chain instead. The validator rejects any proof
whose nonce isn't current.

## 2. Automated coverage

E1 to E4 use the shared `user` account (Anvil #0). A fresh fork starts with its
HCA undeployed, so E1, E2 and E4 deploy it first through the permissionless
`StandaloneHCAFactory.deploy` (`ensureHcaDeployed`) rather than depending on
another spec having registered. The implementation address comes from the
app's own manifest (`getDestinationContracts`), because ensjs doesn't export it
and the factory has no getter. The test therefore follows each redeploy the app
follows; the 2026-10-01 redeploy (#1301) changed it. The precondition also
checks that the factory returns the app's HCA address. E5 and E6 connect a
freshly generated owner, so its HCA has no code. Every test
signs a real session through the registration gate first, except E3. Mined
transactions are read from the fork and filtered to the owner as sender.

| Test | What it proves | Pre-fix | PR |
|---|---|---|---|
| E1 `revoking a deployed account bumps the nonce, kills a copied session, and clears this browser` (`@smoke`) | The dialog says "in every browser and on every device" and "costs gas". Exactly one owner transaction, to the HCA, with calldata `0xac2d5d4b` (`revokeSessions()`). `ownerAndSessionNonce` goes up by one, and the HCA's `SessionsRevoked` log carries the new nonce. The copied record's nonce is now stale, and the stored record is gone. Positive control: the gate prompts again, and the new session is signed against the new nonce | FAIL: menu entry missing | pass |
| E2 `a rejected revoke keeps the session and the dialog; Try Again then revokes` | On a wallet rejection the dialog stays open with "Couldn't revoke sessions" and **Try Again**. The nonce is unchanged and the stored record is kept (storage is cleared only after a confirmed revoke). Try Again then revokes: nonce +1, record cleared | FAIL: menu entry missing | pass |
| E3 `loaded on another chain, the menu hides the revoke entry` (guard) | Positive control first: the entry is shown on Sepolia. After a switch to an undeclared chain and a reload, the page's provider reports chain `0x1`; the entry is absent once the menu has rendered (Disconnect visible), and still absent after a 5s settle window. (The trigger label is no readiness signal: it shows the primary name once another spec has set one.) | FAIL: positive control (entry absent on Sepolia too) | pass |
| E4 `a live chain switch with the dialog open sends nothing and leaves sessions live` | The wallet switches chain while the dialog is open. Revoking fails with an error and **Try Again**; the wallet queue stays empty, nothing is mined, the nonce is unchanged and the stored record is kept | FAIL: menu entry missing | pass |
| E5 `an undeployed account offers set-up-and-revoke, sends nothing until confirmed, then deploys and revokes in order` | First click: "isn't set up on-chain yet", "two transactions", **Set up and revoke**; nothing sent or mined; record kept (no local-only "success"). Confirmed: exactly two owner transactions, the factory (`ensHcaFactory`) deployment and then `revokeSessions()` on the HCA. The HCA now has code, its owner is the fresh EOA, its nonce is 1, `SessionsRevoked(1)` was emitted, and the record is cleared | FAIL: menu entry missing | pass |
| E6 `on an undeployed account, "Remove saved session" clears only this browser and touches no chain` | Negative control: with no saved session, only **Set up and revoke** is offered. With one, the dialog says "doesn't stop a copy made elsewhere". Clicking **Remove saved session** clears the record; nothing is sent or mined, and the HCA still has no code | FAIL: menu entry missing | pass |
| Unit: `RevokeSessionsModal.test.tsx` (9 cases) | Scope and gas copy. A plain revoke never asks to deploy; the dialog closes on success and stays open on failure. Try Again with the error. Undeployed asks `{ deployFirst: true }` and says two transactions. "Remove saved session" appears only for an undeployed account with a saved session, never for a deployed one, and it clears without revoking. Every control is locked and the dialog can't be dismissed while a transaction is in flight | FAIL: component absent | pass |

### Mutation checks

The pre-fix revert only shows that the feature is absent. To show that the chain
and storage checks catch real regressions, three mutations were applied to the
PR build one at a time:

| Mutation | Tests run | Result |
|---|---|---|
| M1: "revoke" only clears `localStorage` and reports success (the pre-WEB-674 behaviour) | E1 | FAIL: "expected >= 1 pending transaction, received 0" |
| M2: the stored record is cleared before the receipt confirms | E2, E4 | FAIL, both: "stored session still present" received `undefined` |
| M3: the context ignores `deployFirst` | E5 | FAIL: no transaction requested after **Set up and revoke** |
| M4: the menu entry is shown even with no HCA (`accountAddress` check dropped) | E3 | FAIL: "expected 0, received 1" on the foreign-chain absence check |

## 3. Results (PR merged onto `e2e-tests-coverage`)

The PR conflicts with `main`. The merge needed two fixes, both committed on
the verify branch: the `messages.po` source-reference conflict (kept the PR's
`RevokeSessionsModal.tsx` line), and a 3-line rename of `customSepolia` to
`appChain` in the PR's new code, because #1188 removed `customSepolia` (see
finding 1).

| Check | Result |
|---|---|
| `hca-session-revoke.spec.ts`, PR build | 6/6 pass (1.2m), on a long-lived fork and again on a fresh fork where `user`'s HCA started undeployed |
| Same spec, 11 PR app/package files reverted to `e2e-tests-coverage` | 6/6 fail. E1, E2, E4, E5, E6 fail at clicking "Revoke smart sessions"; E3 fails its positive control |
| Mutations M1 to M3 (M4 on the retrofit) | Each fails on the intended assertion (section 2) |
| Manager unit tests (`smart-account`, `wallet`, `navigation`) | 99/99 pass (13 files), including the 9 new modal tests |
| `packages/smart-account` unit tests | 99 pass, 1 skipped, including the PR's 12 revoke tests |
| `pnpm typecheck` (manager, smart-account, e2e) | pass (manager only after the rename) |
| `biome check` (PR files and new test files) | pass |
| `pnpm test:manager-smoke` | 5/5 pass (1.7m); the new `@smoke` test takes 9.5s. Needs `MAILINATOR_API_KEY` set to any value, because `notification.spec.ts` throws at import without it |
| Baseline A2 HCA registration (`registration-rhinestone.spec.ts`) | pass |

### Retrofit onto `e2e-tests-coverage` after merge (2026-10-02)

PR #1113 merged as `6ba58762a` with the rename already applied, so the merge
fixup wasn't needed. The tests were re-run on `e2e-tests-coverage` + `origin/main`:

| Check | Result |
|---|---|
| `hca-session-revoke.spec.ts` | 6/6 pass (1.2m) |
| Unit tests (manager `smart-account`/`wallet`/`navigation`, `packages/smart-account`) | 99/99; 99 pass, 1 skipped |
| `pnpm typecheck` (manager, smart-account, e2e), `biome check` | pass |
| `pnpm test:manager-smoke` | 5/5 pass (1.7m) |

Two test fixes were needed after `main` moved:
- The 2026-10-01 Sepolia redeploy (#1301) changed the HCA implementation, so the precondition's hardcoded address was rejected (`HCAImplementationNotApproved`). It now reads the address from the app's manifest.
- E3 had waited for the trigger to read "Connected". Once A16 (smoke) sets a primary name, the trigger shows that name instead, so E3 now waits for the page's chain id. M4 confirms the negative still has teeth.

## 4. Manual test plan

### Setup

```sh
# Stack (CI service set), then fund the test account
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# Manager on the HCA path (CI env has VITE_FF_USE_EOA=false)
cp apps/manager/.env.ci apps/manager/.env
pnpm --filter manager dev -- --port 3000

# A name to start a registration with (only needed to reach the session gate;
# any available label works too)
OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name
```

Point a browser wallet at `http://127.0.0.1:8545` (chain 11155111) as Anvil
account #0. For the undeployed-account steps, import a **new** private key
(`cast wallet new`) and fund it:
`cast rpc anvil_setBalance <address> 0x8AC7230489E80000 --rpc-url http://127.0.0.1:8545`.

Read the HCA's nonce at any point with:

```sh
cast call <HCA> "ownerAndSessionNonce()(address,uint96)" --rpc-url http://127.0.0.1:8545
```

The HCA address is shown in the revoke dialog (truncated), and in full in
`localStorage['ens-sessions-v9'][].smartAccountAddress` once a session exists.

### Steps

1. **Sign a session.** Search an available name, open it, click **Pay with stablecoins**, then **Enable sessions**. *Pass:* one signature; `ens-sessions-v9` holds a record whose `hcaSessionNonce` equals the on-chain nonce.
2. **Menu entry.** Open the account menu. *Pass:* **Revoke smart sessions** sits above **Disconnect**.
3. **Dialog copy.** Click it. *Pass:* the HCA address (not the owner's), "This ends every session you have signed for this account, in every browser and on every device", and "costs gas".
4. **Reject.** Click **Revoke sessions** and reject in the wallet. *Pass:* "Couldn't revoke sessions. Please try again.", **Try Again**, dialog open, nonce unchanged, record still in storage.
5. **Revoke.** **Try Again** and approve. *Pass:* one transaction from the owner to the HCA, about 58k gas; the dialog closes; nonce +1; the record is gone.
6. **Session after revoke.** Repeat step 1. *Pass:* **Enable sessions** is asked again, and the new record's `hcaSessionNonce` equals the new nonce.
7. **Copied session is dead.** Before step 5, copy the `ens-sessions-v9` value. After step 5, compare its `hcaSessionNonce` with the chain. *Pass:* they differ. (Replaying it against the validator needs the real orchestrator; see "Not covered".)
8. **Wrong chain, dialog open.** Open the dialog, switch the wallet to another network, click **Revoke sessions**. *Pass:* no wallet prompt and nonce unchanged. *Expected per the PR:* "Switch your wallet to Sepolia to revoke sessions." *Actual:* the generic error (finding 2).
9. **Wrong chain, reloaded.** With the wallet on another network, reload. *Pass:* the menu has no revoke entry, even after waiting a few seconds. (The trigger reads "Connected", or the primary name if one is set.)
10. **Undeployed, no session.** Connect the fresh key, open the dialog, click **Revoke sessions**. *Pass:* "Your smart account isn't set up on-chain yet…", **Set up and revoke**, no **Remove saved session**, no wallet prompt.
11. **Undeployed, remove locally.** Sign a session (step 1) with the fresh key, open the dialog, **Revoke sessions**. *Pass:* **Remove saved session** appears with "doesn't stop a copy made elsewhere". Click it: the record is gone, no transaction, and `cast code <HCA>` is still `0x`.
12. **Undeployed, set up and revoke.** With a new fresh key and a session, click **Revoke sessions**, then **Set up and revoke**. *Pass:* two wallet prompts in order, a factory deployment and then the revoke; afterwards the HCA has code, the owner is the fresh key, and the nonce is 1.
13. **Disconnect keeps sessions.** Sign a session, disconnect and reconnect. *Pass:* no **Enable sessions** prompt (unchanged behaviour).

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| 1 | Medium (merge) | The PR conflicts with `main` and doesn't compile once merged: its new code uses `customSepolia` three times (`SmartAccountContext.tsx`: the deployment call's `chainId`, the revoke call's `chain`, and the wrong-chain message), and #1188 removed it in favour of `appChain` from `@/config` (TS2304). Its green CI ran on the old base. Fix: rebase, rename to `appChain`, and re-extract the catalogs (`messages.po` conflicts on the "Try Again" source references) |
| 2 | Low (UX) | The wrong-chain message can't be reached. `assertChain` reads `walletClient.chain`, but wagmi keeps reporting the configured chain (Sepolia) after the wallet switches network. The send then fails in viem with `ChainMismatchError`, which maps to `reason: unknown`, so the user sees "Couldn't revoke sessions. Please try again." instead of "Switch your wallet to Sepolia…". It's safe: nothing is sent (E4). The PR's unit test passes because it mocks `walletClient.chain`. Suggest `await walletClient.getChainId()` in `assertChain`, or mapping `ChainMismatchError` to `wrong-chain` |
| 3 | Low (UX) | A wallet rejection also maps to `unknown` and shows the generic "Couldn't revoke sessions" text. `UserRejectedRequestError` could get its own, calmer wording |
| 4 | Info | Once the page has loaded on another chain, the smart-account context drops the HCA and the menu hides **Revoke smart sessions**. The owner has to switch back to Sepolia first. That seems reasonable, but it isn't mentioned in the dialog or PR |
| 5 | Info (docs) | `packages/smart-account/DEBUGGING_INTENTS.md` §7 still says "There is no `enableSessionWithRefund`, no `revokeSessions()`…". That's about the validator, but it now reads as if revocation doesn't exist. The PR rewrote `HCA_SESSION.md` but not this file |
| 6 | Info (a11y) | Opening the dialog logs Radix's "Missing `Description` or `aria-describedby={undefined}` for {DialogContent}" warning |

**Not covered automatically:**
- Replaying a revoked session against the real validator (the mockestrator skips signature checks for a deployed HCA; the nonce mismatch is the oracle instead).
- The not-owner path (the HCA is derived from the connected wallet, so the UI can't reach it; the PR's unit tests cover it).
- EOA mode, where the entry should be hidden (needs a `VITE_FF_USE_EOA=true` build).
