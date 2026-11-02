# WEB-1572: One resolver per wallet, QA test plan and report

PR: [#1310 Reuse the wallet's resolver across explorer registrations](https://github.com/ensdomains/apps-monorepo/pull/1310)
App: **portal / explorer** (`apps/portal`, `:3001`), plus the shared registration machine (`packages/transaction-manager`) and manager's stage copy
Spec: `e2e/projects/portal/tests/registration.spec.ts` (`one resolver per wallet (WEB-1572)`, and the adapted `WEB-1229` describe)

---

## 1. Change surface

**The bug.** Every explorer registration deployed a new `PermissionedResolver`
proxy through the `VerifiableFactory`, under a random salt. A wallet paid for a
deploy transaction on every name and ended up with one resolver per name.

**How a user reaches it:** register a name in the explorer, then register
another one with the same wallet. The second checkout lists "Deploy resolver"
again, and the wallet mines a second `deployProxy`.

**The fix.** The salt is fixed per owner (`computeResolverSalt(owner)`, the same
formula manager uses), and the factory namespaces it by the deployer, so a
wallet's resolver has one CREATE2 address. The registration machine checks for
code there before deploying.

| File | Role | Change |
|---|---|---|
| `transaction-manager/…/registration.actors.ts` | Writer | `computeDedicatedResolverAddress`, `hasDeployedCode`, `checkResolverDeploymentActor`. `encodeDeployDedicatedResolverCall` takes the salt from the owner. The random salt generator is gone |
| `transaction-manager/…/registration.machine.ts` | Machine | New pure-EOA `checkingResolver` state: code present goes to `preparingCommitment` with that `resolverAddress`, otherwise `deployingResolver`. Deploy failures and the catch-all RETRY go back to `checkingResolver`, because resending a deploy that landed would revert |
| `transaction-manager/…/registration.persistence.ts` | Resume | Comment only: a pre-commit restart now picks up the resolver the abandoned run deployed |
| `portal/…/useRegistrationTransactions.ts` | Reader / UI | Reads the wallet resolver's code (`useBytecode`, `staleTime: 0`). Lists "Deploy resolver" only when there is none, decided on Start, the same way as the approve step. With no deploy step, "Submit commitment" starts the run. The deploy estimate uses the real call |
| `manager/…/registration.stages.ts`, `txStageMessages.ts`, `messages.po` | UI | Progress value and copy for `checkingResolver` (manager's EOA path only) |

**What must still work:** a wallet's first registration still deploys, and the
name points at that resolver; the approve step and the commit-reveal wait are
unchanged; resume and Try again don't send a deploy twice.

---

## 2. Automated coverage

The PR's unit tests check the address against manager's
`computeResolverAddress`, the code check with a mocked client, and the step list
with the code read mocked. These tests register on the fork, each with a
**fresh wallet** (new key, gas, 10 000 USDC), so "the wallet's first
registration" is a real state, not fork history. The oracles come from the
chain, not the app's formula: the `ProxyDeployed` event of the one deploy, every
transaction the wallet mined, sorted by target (factory = deploy, registrar
`commit` = commitment), and the resolver the .eth registry records for each
name.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | A wallet deploys its resolver on its first registration and reuses it on the next | Positive control: the first checkout lists "Deploy resolver", and the run mines exactly one deploy; the name's resolver is that proxy. The second registration (fresh load) lists no deploy, mines no factory call and one commitment, logs no `tx-reg-deploy-resolver` state, and its name points at the **same** proxy | FAIL: second checkout lists "Deploy resolver" (expected 0 rows, got 1) | pass |
| 2 | A resolver already deployed at the wallet's address (as manager deploys it) is reused `@smoke` | The wallet deploys its resolver itself with manager's salt, outside the portal. The portal lists no deploy, the run's first transaction is the commitment, nothing goes to the factory, and the registry records the seeded proxy. This also checks the PR's claim that explorer and manager share the address | FAIL: "Deploy resolver" listed (expected 0, got 1) | pass |
| 3 | A deploy that lands after its run was lost is reused, not sent again | Automine off: the deploy is authorized and held in the mempool, the page reloads, then the block is mined. The test checks the deploy really landed, then that the reloaded page lists no deploy, the registration completes with that one deploy, and the name points at it. This is the case `checkingResolver` exists for | FAIL: "Deploy resolver" listed (expected 0, got 1), after the held deploy was confirmed mined | pass |
| 4 | A run abandoned after its deploy landed reuses that resolver when restarted | Guard. A reload at the commit prompt reopens the run at the commitment. No second deploy, and the name points at the first one's proxy | pass (guard: resume-at-commit never redeployed) | pass |

All three regression tests fail on the assertion that encodes the bug, not on a
timeout or setup step. Test 4 is labelled as a guard in the spec.

**Adapted, `WEB-1229` describe (4 tests).** These assumed every run starts with
a deploy: `startWithResubmittedCommit` waited for
`tx-reg-deploy-resolver:success`, and three tests checked a "Deploy resolver"
Done badge and one mined deploy. On the PR build, `user`'s resolver exists after
any earlier registration, so the first one timed out at that wait (seen on the
first baseline run). They now deploy `user`'s resolver up front
(`ensureWalletResolver`, a no-op when it is there), check the step list has no
deploy, and expect no deploy mined. Their own oracles (the commitment's state
lines, Done badges against mined transactions, the E2E-018 expected failure) are
unchanged. These were not run pre-fix: there, the deploy step is always listed,
so they fail at the "no Deploy resolver row" check by construction. **They must
land on `e2e-tests-coverage` together with the PR, not before.**

`minedRegistrationSends` now reads the block number uncached (`cacheTime: 0`).
With viem's default cache, a send mined moments earlier could fall outside the
scanned range, and a "no deploy" check could pass on an empty scan.

---

## 3. Results (PR merged onto `e2e-tests-coverage`)

- New e2e tests: 4/4 pass on the PR build. Pre-fix: 1–3 fail on the "no Deploy resolver row" assertion, 4 passes (guard).
- `registration.spec.ts` in full on the PR build: **33/33 in 15.0m** (one worker), including the adapted WEB-1229 tests, E2E-018 as its expected failure, and the name-switch test (allowance at `maxUint256`, see F5).
- `pnpm test:portal-smoke`: the new `@smoke` test passes in 1.1m. The run had 5 failures, none from this PR: the name-switch test with allowance 0 (F5, same on pre-fix) and four transfer tests (F6, same on pre-fix).
- Unit tests: `packages/transaction-manager` registration 144/144, `apps/portal` register 182/182, `apps/manager` register-v2 267/267.
- Typecheck is clean in `apps/portal`, `apps/manager`, `packages/transaction-manager` and `e2e`. `biome check` shows no new warnings on the PR's files or the spec (the two in the spec, and one in `registration.actors.ts`, predate it).

**Stack note.** The shared anvil panicked three times during this run (exit
133, the drpc upstream dropping a TLS connection mid-request). Each time anvil
was restarted, Panoptes was wiped and restarted, mockestrator, paymaster and alto
were restarted, and account 0 was re-funded. No result above comes from a run
that crossed a crash.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
```

- **Wallet.** A browser wallet on the local fork (chain id 11155111, RPC
  `http://127.0.0.1:8545`). Use an account that has **never registered on this
  fork**: import a new key, then fund it with
  `cast rpc anvil_setBalance <addr> 0x56BC75E2D63100000` and mint USDC with
  `cast send 0x240b0316Df57887DBBE58b586508b19e633a14aa "mint(address,uint256)" <addr> 10000000000 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.
- **A name owned by someone else** (M8 only):

  ```sh
  OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name
  ```

### Steps

| # | Step | Pass |
|---|---|---|
| M1 | Open `/register?name=<fresh>.eth`, pick USDC, press Register | The overview lists Deploy resolver, Submit commitment, Approve payment, Register name |
| M2 | Start and confirm every prompt until the name is registered. Note the Deploy resolver transaction | One `deployProxy` to the VerifiableFactory. On Etherscan-style inspection (or `cast receipt`), its `ProxyDeployed` address is the resolver the name shows on its Records/Resolver page |
| M3 | Reload, then open `/register?name=<another fresh>.eth`, pick USDC, Register | The overview has **no** Deploy resolver. It starts with Submit commitment |
| M4 | Press Start | The first wallet prompt is the commitment (to the ETH registrar), not a factory deploy. Complete the registration |
| M5 | Check the second name's resolver | Same address as M2's proxy |
| M6 | Switch the wallet to a different never-used account and repeat M1 | Deploy resolver is listed again: the resolver is per wallet |
| M7 | Lost deploy: on a fresh account, `cast rpc evm_setAutomine false`. Start a registration and confirm the deploy prompt, then reload the page before mining. Run `cast rpc evm_mine` and `cast rpc evm_setAutomine true` | After the reload the run (reopened or new) lists no Deploy resolver, and completes with no second deploy |
| M8 | Disconnected: open `/register?name=<fresh>.eth` with no wallet connected | The page renders the checkout as before. No error from the resolver code read |
| M9 | Register a second name **in-app** without reloading: after M2's success page, search the next name, pick USDC and press Register | Known defect E2E-019: the modal shows the previous run as Done. Press Done, then Register: a fresh run with Start |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Low (S3), pre-existing, filed as E2E-019 | **After a registration, the next name's checkout opens on the finished run.** Register a name, then (without reloading) search another name and press Register: the modal lists the previous run's steps as "Done", linking that run's transactions, and offers Done instead of Start. Nothing is sent, but the second name looks registered. Pressing Done clears it, and Register then starts a fresh run; a reload does too. Same on the pre-fix build (it also lists the old Deploy resolver as Done), so not caused by #1310. Likely cause: the register page's unmount cleanup skips `success`, and the step ids are shared across names. Test 1 registers its second name on a fresh load for this reason. Details and screenshots in [`e2e-defects.md`](./e2e-defects.md) (E2E-019) |
| F2 | Info | Resolvers the explorer deployed before this PR used random salts, so they aren't found. Each wallet deploys once more at its fixed address on its next registration (stated in the PR) |
| F3 | Info | Any code at the address counts as deployed; the implementation and roles are not checked (stated in the PR, same as manager). The factory namespaces the salt by the deployer, so another account can't occupy a wallet's address first |
| F4 | Info, coverage gap | Manager's wallet-only (EOA) registration uses the new state, but CI runs manager on the smart-account path (`VITE_FF_USE_EOA=false`). That path is covered by the PR's unit tests only |
| F5 | Test infra, pre-existing | The `@smoke` name-switch test (`switching to a different name mid-flow…`) passes only when `user`'s USDC allowance to the registrar is high enough that the run has no approve step. With allowance 0 it fails on both the PR and pre-fix builds ("name A's flow kept prompting the wallet"); with `maxUint256` it passes on both. A fresh fork starts at 0 |
| F6 | Test infra, pre-existing | Four transfer smoke tests (F10, F41, F42, WEB-281 transfer) fail at "Transfer button enabled" on a freshly reset fork. Identical on the pre-fix build; not related to this PR |
