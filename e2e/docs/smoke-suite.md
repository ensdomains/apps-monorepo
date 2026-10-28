# The smoke suite

The subset of the e2e suite that runs on every PR, as a fast regression gate.
The full suites (every manager, portal and cross-app spec) run nightly in
`.github/workflows/e2e-nightly.yml`.

A test is in the smoke suite because it covers one of the flows the team
requires on every PR (the table below), or because it guards a fix for a
real, funds-at-risk bug.

## How to run it

```bash
pnpm e2e:smoke:portal     # portal: the harness checks, then every @smoke test
```

A test joins the suite with an `@smoke` tag next to its other tags.
`projects/portal/playwright.smoke.config.ts` keeps the portal config's
two-project shape (`harness` gates `portal-smoke`) and sets `grep: /@smoke/`
at the top level. Playwright applies that to every project, so the harness
project shrinks to the three checks tagged `@smoke`: distinct funded
wallets, the portal pointed at this fork, and the fork itself.

In CI (`.github/workflows/e2e.yml`), the portal job runs this config in two
shards when a PR touches the portal or shared e2e code. The manager job
still runs the full manager suite; it moves to its own smoke config with the
manager smoke batch.

## Required flows

"Explorer" is the portal, "Manager" the manager app.

| Flow | App | Version | Test | Where it runs |
|---|---|---|---|---|
| Registration | Explorer | V2 | `registration.spec.ts`: registers a name via headless wallet and stablecoin payment | per PR |
| Registration | Explorer | V1 | not applicable: new registrations are V2 only | — |
| Add 3LD | Explorer | V2 | `subnames.spec.ts`: creates a 3LD in the parent registry | per PR |
| Add 4LD | Explorer | V2 | `subnames.spec.ts`: creates a 4LD under a 3LD that owns its own registry; `v2-4ld.spec.ts`: creates a native 4LD in its immediate parent registry | per PR |
| Add 3LD / 4LD | Explorer | V1 | **gap** | — |
| Renew | Explorer | V2 | `registration.spec.ts`: Extend approves exactly the renewal price and leaves no allowance behind | per PR |
| Renew | Explorer | V1 | `registration.spec.ts`: renewing a V1 name approves ETHRenewerV1 exactly its price | per PR |
| Bulk renew | Explorer | V1 + V2 | `registration.spec.ts`: two V1 and two V2 names: one approval per renewer | per PR |
| Set primary (name) | Explorer | V2 | **gap** | — |
| Set primary (subname) | Explorer | V1 | cross-app `v1-4ld-observers.spec.ts`: explorer sets a V1 4LD primary name that survives migration | local, real bigname |
| Set primary (subname) | Manager | V2 | cross-app `v2-4ld-observers.spec.ts`: manager sets a native 4LD primary name visible in explorer | local, real bigname |
| Set primary (subname) | Explorer | V2 | **gap** | — |
| Edit records | Explorer | V2 | `records.spec.ts`: saves several text records in one transaction and reads them back on-chain | per PR |
| Edit records | Explorer | V1 | cross-app `v1-4ld-observers.spec.ts`: V1 4LD records edit in explorer resolves and manager requires upgrade | local, real bigname |
| CCIP read | Explorer | V2 | `offchain-resolver.spec.ts`: reads an offchain name and its wildcard subname in batches | per PR |
| Transfer | Explorer | V1 | `transfer.spec.ts`: transfers an unwrapped V1 name, moving BOTH the registrant and the controller; transfers a WRAPPED V1 name in a single ERC-1155 step; transfers a V1 REGISTRY subname via setOwner alone | per PR |
| Transfer | Explorer | V2 | `transfer.spec.ts`: transfers a name from wallet A to wallet B, and wallet B is shown as the owner; transfers a subname, moving the token in the parent subregistry | per PR |
| My Names | Explorer | V2 | **gap** (only indirect, in cross-app `transfer-in-explorer.spec.ts`) | — |
| Change resolver | Explorer | V2 | `resolver.spec.ts`: points a name at a different resolver | per PR |
| Change registry | Explorer | V2 | **gap** (`subnames.spec.ts` only checks the deploy is offered) | — |
| Transaction history | Explorer | V2 | **gap** | — |

The Manager flows (registration, renewal, bulk renewal, primary name,
records, header, migration, CCIP, My Names) join this table with the manager
smoke batch. The gaps are new tests still to be written.

The cross-app tests are tagged `@smoke` but skip unless the explorer reads a
real bigname indexer (`E2E_MOCK_BIGNAME` unset), which CI does not run. Run
them locally against the full stack with
`pnpm --filter @ens-apps/e2e exec playwright test --config=projects/cross-app/playwright.config.ts --grep @smoke`.

## Regression guards

Each of these guards a fix for a bug that could lose a user money or a name.
They are cheap: most need one seeded name and no indexer.

| Test | File | Fix |
|---|---|---|
| switching to a different name mid-flow cancels the first registration instead of completing it | `registration.spec.ts` | #1207: the registration survived a `?name=` change and charged for the first name |
| the reported crafted link does not tell a visitor they own someone else’s name | `registration.spec.ts` | #1247 (WEB-1490), see [the test plan](./registration-banner-web1490-test-plan.md) |
| Try again after a failed approve keeps the commitment that landed on its second send | `registration.spec.ts` | #1284 (WEB-1229), see [the test plan](./stale-retry-error-web1229-test-plan.md) |
| a resolver already deployed at the wallet’s address (as manager deploys it) is reused | `registration.spec.ts` | #1310 (WEB-1572), see [the test plan](./resolver-reuse-web1572-test-plan.md) |
| a register page whose price reads fail offers no token and no Register, then recovers on Try again | `registration.spec.ts` | #1221 (WEB-1485), see [the test plan](./zero-price-checkout-web1485-test-plan.md) |
| blocks detaching a registry with third-party subnames until the exact blast radius is acknowledged… | `transfer.spec.ts` | #1170: the registry-detach consent gate |
| shows "Registry detached" instead of "Configure registry" after a detach transfer | `transfer.spec.ts` | #1170: a detached slot let the new holder re-mint the old subnames |
| does not ask a wallet on another network to send, and says why | `transfer.spec.ts` | #1108 (WEB-281), see [the test plan](./chain-mismatch-web281-test-plan.md) |
| lets the user opt out of the ETH repoint when the resolver detach is not on offer | `transfer.spec.ts` | #1217 (WEB-1508), see [the test plan](./transfer-eth-addr-strand-web1508-test-plan.md) |
| offers the handover on by default for an unwrapped 2LD, warning when it is switched off | `transfer.spec.ts` | #1559, see [the test plan](./transfer-manager-handover-1559-test-plan.md) |

## Adding or removing a test

Tag the test `@smoke` next to its existing tags, and add it to one of the
tables above with the reason. A smoke test must pass on a fresh CI stack
with bigname mocked, or skip there with a stated reason. Keep the suite
inside the CI job's 30-minute timeout per shard; the registration tests are
the slow ones, at about a minute each for the commit-reveal wait.
