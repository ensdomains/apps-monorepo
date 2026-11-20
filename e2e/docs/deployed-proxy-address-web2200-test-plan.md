# WEB-2200: Deployed proxy read from the factory's own log, QA test plan and report

PR: [#1832 Read a deployed proxy only from the factory's ProxyDeployed log](https://github.com/ensdomains/apps-monorepo/pull/1832)
App: **portal / explorer** (`apps/portal`, `:3001`), plus `packages/smart-account` and the shared registration machine (`packages/transaction-manager`)
Specs: `e2e/projects/portal/tests/resolver.spec.ts` and `registration.spec.ts` (the `WEB-2200` describes), helper `e2e/helpers/wrapped-receipt.ts`

---

## 1. Change surface

**The bug.** After a `VerifiableFactory.deployProxy`, three writers took the new
proxy's address from the first `ProxyDeployed` log anywhere in the receipt. A
transaction carried by another contract (a relayed Safe execution, say) can
hold a `ProxyDeployed` with the same signature from that contract, ahead of the
factory's. The app then used whatever address that contract announced.

**How a user reaches it:** deploy a resolver from "Change resolver", deploy a
subregistry from "Configure registry", or register a wallet's first name, in a
transaction whose receipt holds another contract's `ProxyDeployed` first. The
name ends up pointing at that address.

**The fix.** `findDeployedProxyAddress({ logs, factory })` keeps only logs the
factory emitted with the `ProxyDeployed` topic. None gives `null` (the callers'
existing "not found" error), and more than one is an error.

| File | Role | Change |
|---|---|---|
| `smart-account/src/verifiable-factory.ts`, `errors.ts`, `index.ts` | Reader | New `findDeployedProxyAddress`, `AmbiguousProxyDeploymentError`, `DecodeProxyDeployedError` |
| `portal/…/useDeployPermissionedResolver.ts` | Writer | Reads the resolver through it, with the factory it sent the deploy to |
| `portal/…/deploySubregistry.ts` | Writer | Same, for the subregistry |
| `portal/…/permissionedResolver.ts` | Reader | Unfiltered `parseProxyDeployedAddress` removed |
| `transaction-manager/…/registration.actors.ts`, `registration.machine.ts` | Writer | `resolveResolverDeploymentActor` takes `chainId` and the factory from `getDestinationContracts(chainId)`; the machine passes `context.chainId` |

**What must still work:** a normal deploy (one factory log) still attaches the
new proxy in all three flows.

**Factory addresses agree.** The deploys are sent to
`getChainContractAddress(chain, 'ensVerifiableFactory')`. The registration
actor now reads `getDestinationContracts(chainId).verifiableFactory`. Both
resolve to `ensjsSepolia.ensVerifiableFactory`, so the filter matches the real
emitter. The e2e run checks this: a mismatch would end the registration at
"ProxyDeployed event not found".

---

## 2. Automated coverage

The PR's unit tests decode hand-built logs, and its actor test stubs the
receipt. The machine tests and the portal register route test stub the actor.
None of them run a real deploy.

The app sends its deploys straight from the wallet, so the fork never produces
a wrapped receipt by itself. `wrapFactoryReceipts(page)` routes the page's
`/rpc`: in every receipt holding the factory's `ProxyDeployed`, it puts a copy
in front, emitted by a random `wrapper` address and naming a random `decoy`
proxy with no code. The transaction, the factory's own log and the chain are
unchanged. The helper returns the hashes it wrapped, and each test reads the
factory's event from the **untouched** receipt on anvil (`factoryDeployment`),
so the test fails if the page never read a wrapped receipt.

Oracle: what the .eth registry records on chain (`getResolver`), compared with
the factory's `ProxyDeployed` and checked to be not the decoy.

| # | Test | What it proves | Pre-fix | PR |
|---|---|---|---|---|
| 1 | Portal resolver: attaches the resolver the factory deployed, not one another contract announced first `@smoke` | "Deploy new permissioned resolver" then `setResolver`, with the decoy in front. The name's resolver is the factory's proxy, which has code. Covers `useDeployPermissionedResolver` | FAIL: `getResolver` is the decoy (`the resolver must not be the decoy`) | pass |
| 2 | Portal registration: registers with the resolver the factory deployed, not one another contract announced first | A fresh wallet's first registration (the deploy step is listed and lands), with the decoy in front. The registry records the factory's proxy, and the ETH address resolves to the owner through it. This also shows the new `chainId` input reaches `resolveResolverDeploymentActor` and that its factory matches the real one | FAIL: `getResolver` is the decoy. The pre-fix run completed: the name was registered with a resolver address that has no code | pass |

Both fail on the assertion that encodes the bug, not on a timeout or setup.
In both, the factory's real proxy is the positive control: it must be the one
attached.

**Subregistry deploy: verified locally, not in the suite.** "Deploy a new
Permissioned Registry contract" is turned off by `IS_REGISTRY_DEPLOY_PAUSED`
(the user-registry implementation is pending an upgrade), and the configurator
is the only caller of `useDeploySubregistry`. To reach it, the flag was set to
`false` in the verify worktree only (never committed), and a test like test 1
was run: Configure registry, deploy, set parent and set subregistry, with the
decoy in front of the deploy receipt.

| Test | Pre-fix | PR |
|---|---|---|
| Portal subregistry: attaches the registry the factory deployed, not one another contract announced first (pause lifted locally) | FAIL: `getSubregistry` is the decoy (`the subregistry must not be the decoy`) | pass |

It is left out of the suite: with the pause on, the deploy option is disabled
and the test can't run. Add it when the pause is lifted. In CI,
`deploySubregistry.test.ts` (the PR's wrapped-receipt case) is the only
coverage of this path. With the pause lifted, "Configure registry" has to be
clicked to open the form; while paused, the form is open by default.

**Not covered by e2e: two factory logs.** No app flow emits two
`ProxyDeployed` from the factory in one transaction. The
`AmbiguousProxyDeploymentError` path is covered by the PR's unit tests only.

---

## 3. Results (PR merged onto `main` in a worktree; merged upstream as `dbb5dc670`)

- New e2e tests: 2/2 pass on the PR build and fail pre-fix on the decoy
  assertion. The local-only subregistry test also passes on the PR build and
  fails pre-fix on the same assertion. Its pre-fix run used `origin/main` at
  `4b75b39ce`, which does not contain the fix.
- `resolver.spec.ts` and `registration.spec.ts` in full on the PR build: 56
  passed, 7 failed, 2 skipped (29.1m). Neither WEB-2200 test failed. The 7
  failures are in surfaces this PR doesn't touch (see F2).
- Unit tests: `packages/smart-account` `verifiable-factory` 7/7,
  `packages/transaction-manager` registration 295/295, `apps/portal`
  `deploySubregistry` and `features/resolver` 151/151.
- Typecheck is clean in `apps/portal`, `packages/smart-account`,
  `packages/transaction-manager` and `e2e`. `biome check` reports no new
  warnings: the ones in `registration.actors.ts:1151` and in
  `registration.spec.ts` were already there.
- The smoke suite was not run locally. CI runs it on every PR.

---

## 4. Manual test plan

### Setup

```sh
docker compose -f e2e/infra/docker-compose.yml up -d anvil alto paymaster mockestrator
bash e2e/infra/scripts/fund-account.sh 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
cp apps/portal/.env.ci apps/portal/.env
pnpm --filter portal dev -- --port 3001
OWNER=user STATE=active pnpm --filter @ens-apps/e2e seed:name   # a name you own
OWNER=user2 STATE=active pnpm --filter @ens-apps/e2e seed:name  # someone else's name
```

Use a browser wallet on the local fork (chain id 11155111, RPC
`http://127.0.0.1:8545`) holding the `user` key. For M3, use a key that has
never registered on this fork (fund it as in the
[WEB-1572 plan](./resolver-reuse-web1572-test-plan.md#setup)).

A browser can't produce a wrapped receipt by hand. That case is covered by the
e2e tests above (`pnpm --filter @ens-apps/e2e test:portal -- -g WEB-2200`).
These steps check the legitimate path still attaches the factory's proxy.

### Steps

| # | Step | Pass |
|---|---|---|
| M1 | On your name, open `/<name>/change-resolver`, turn on "Deploy new permissioned resolver", Save changes, approve both transactions | Lands on `/<name>/resolver`. Run `cast receipt <deploy tx hash> --rpc-url http://127.0.0.1:8545`: the `ProxyDeployed` log from `ensVerifiableFactory` names the proxy (topic 2). `cast call 0x… "getResolver(string)(address)" <label>` on the .eth registry returns that proxy |
| M2 | Save a text record on that name from `/<name>/edit-records` | The record shows on `/<name>/records`, so the attached resolver is the working one |
| M3 | With the fresh key, register a new name with USDC | "Deploy resolver" is listed and lands, then the commitment, register and ETH address steps. The name's resolver equals the factory's proxy in the deploy receipt, and the ETH address resolves to the wallet |
| M4 | Register a second name with the same fresh key | No "Deploy resolver" step (WEB-1572), and the name points at the same proxy |
| M5 | On someone else's name, open `/<name>/change-resolver` | The change is refused without `ROLE_SET_RESOLVER`, and no transaction is sent (unchanged) |
| M6 | On your name, open `/<name>/registry` | "Deploy a new Permissioned Registry contract (temporarily disabled)" is shown and can't be selected (subregistry deploy is paused, see §2) |
| M7 | Only with the pause lifted locally (`IS_REGISTRY_DEPLOY_PAUSED = false` in `registryDeployPause.ts`): on your name, Configure registry, deploy a new registry, approve the three transactions | The .eth registry's `getSubregistry(<label>)` equals the proxy in the factory's `ProxyDeployed` log of the deploy receipt |

---

## 5. Findings

| # | Severity | Finding |
|---|---|---|
| F1 | Info | Subregistry deploy can't be reached while `IS_REGISTRY_DEPLOY_PAUSED` is on, so its e2e test is not in the suite (§2). Add it when the pause is lifted |
| F2 | Info | 7 failures in the full spec run, none in code this PR changes: the WEB-1485 failed-price-read tests at `registration.spec.ts:2508`, `2646` and `2842`, multi-name Extend B22–B24 (60s click timeouts), and offchain H19 (pulled in by the `resolver.spec.ts` filter). Not re-run on the pre-fix build |
| F3 | Low (hardening) | Pre-fix, the wallet's first registration completed with a resolver address that has no code: the commitment, register and ETH address writes all accepted it. Nothing checks for code at the deployed address before using it. The fix removes the way to get a wrong address, but a code check would also catch a wrong one from any future source |
