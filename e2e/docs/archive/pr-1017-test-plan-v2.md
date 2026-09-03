# PR #1017 test plan (v2 — post-merge with `origin/main` @ `d2e8642b6`)

Branch `migration-hca` merged with latest main as `30af264d0`.
Manager `localhost:3000`, explorer `localhost:3001`, anvil fork `:8545`, indexer `:5655`.

## What changed since the v1 plan

| | v1 (Aug 10) | v2 (now) |
|---|---|---|
| HCA implementation | contracts-v2 **#388** `0xD213De41…` | **#409** `0xAA761541…` |
| Validator | `0x976D90c5…` | `0x5f249FCa…` |
| Anvil acct-0 HCA | `0x0534…` derived | **`0x48B9c6898baFc8A3D3a495BF7c44CF3351486628`** |
| Session storage key | `ens-sessions-v8` | `ens-sessions-v9` |
| Adapter field | `defaultReverseRegistrarAdapter` | `defaultReverseRegistrarHcaAdapter` |

Fork check already done: **both** #388 and #409 implementations/validators are deployed,
and the #409-derived HCA `0x48B9…6628` has **no code** — so the fresh-HCA path is live
without any reset. `ens-sessions-v9` means any stored session from prior QA is ignored.

## The oracle (derived from code, not from the PR body)

Confirmation count is fully determined. From
[buildStepDescriptors.ts](apps/manager/src/features/migration/service/buildStepDescriptors.ts)
and [planMigrationApprovals](apps/manager/src/features/migration/service/migrationApprovals.ts#L274):

```
N = D + A_base + A_wrap + A_reg + B + C

D      = 1 if eth_getCode(HCA) == '0x'                       ("Create migration account")
A_base = 1 if hasUnwrapped
              && !isApprovedForAll(BaseRegistrar, wallet, MigrationHelper)
              && (noTokenIds || someTokenMissingApproval)
         → exactly 1 token missing  → "Approve <name>"        (per-token ERC-721)
         → otherwise               → "Approve <k> registrations" (operator, k = unwrapped selected)
A_wrap = 1 if hasWrapped && !isApprovedForAll(NameWrapper, wallet, MigrationHelper)
A_reg  = 1 if requiresManagerRestoration
              && !isApprovedForAll(ETHRegistry, wallet, HCA)   ("Approve manager restoration")
B      = atomicBatches.length  (≥1; if >1 rows read "Upgrade batch i of n")
C      = 1 if A_reg was included                              ("Revoke temporary HCA access")
```

where `hasUnwrapped` = unwrapped ≠ ∅, `hasWrapped` = unlocked ∪ locked2ld ∪ childNames ≠ ∅,
and `requiresManagerRestoration` = some classified name has `managerAddress !== null`, i.e.
V1 registry `owner(node)` ≠ registrant — **unwrapped names only**
([classifyNames.ts:163](packages/migration/src/service/classifyNames.ts#L163)).

Operator approvals go to **`MigrationHelper`** and persist. Per-token ERC-721 approvals clear
on transfer. The ETHRegistry approval goes to the **HCA** and is the *only* one that is revoked.

### Oracle hygiene — one thing the v1 report got wrong

v1 used "footer count === dialog row count" as a per-scenario oracle. That is **tautological**:
the footer's `<Plural value={steps.length}>` and the dialog's `<ol>` both render the same
`estimate.plan.stepDescriptors` array ([SelectNamesStepFooter.tsx:44](apps/manager/src/features/migration/components/SelectNamesStepFooter.tsx#L44)).
It can never disagree and proves nothing.

v2 uses two independent oracles instead:
- **O1 (external state)** — compute N from chain state read directly over RPC *before* clicking,
  and compare to the rendered count. This is the real check.
- **O2 (actual prompts)** — count the wallet prompts actually issued during the run and compare
  to the prediction. Catches a plan that is right on paper but wrong in execution.

## Scenarios

Run in one session so HCA + approval state carries over — that carry-over is what moves N.
Chain state is re-read via `node e2e/qa-reset.mjs --report-only` before each scenario.

### Core matrix (state carry-over is the point)

| # | Selection | Precondition | Expected rows (in order) | N |
|---|-----------|--------------|--------------------------|--:|
| A1 | 1 unwrapped | fresh HCA, no approvals | Create migration account · Approve `<name>` · Upgrade 1 name | **3** |
| A2 | 1 unwrapped | HCA now deployed, per-token consumed by A1 | Approve `<name>` · Upgrade 1 name | **2** |
| A3 | 2 unwrapped | 2 tokens missing → operator form | Approve 2 registrations · Upgrade 2 names | **2** |
| A4 | 1 unwrapped | BaseRegistrar→helper now persists | Upgrade 1 name | **1** |
| A5 | 1 unlocked wrapped | NameWrapper→helper absent | Approve wrapped names · Upgrade 1 name | **2** |
| A6 | 1 locked 2LD | NameWrapper→helper persists | Upgrade 1 name | **1** |
| A7 | 1 wrapped + 1 unwrapped | both operator approvals persist | Upgrade 2 names | **1** |
| A8 | emancipated child (PCC) | approvals persist | Upgrade 1 name | **1** |

Oracle for A2 vs A4 is the crux: A2 must ask again (per-token approvals are consumed by
transfer) while A4 must not (operator approval persists). If A2 shows 1, per-token approvals
are leaking; if A4 shows 2, operator approvals are not persisting.

### Manager restoration — the branch v1 could never reach

| # | Selection | Expected rows | N |
|---|-----------|---------------|--:|
| M1 | 1 unwrapped with V1 `owner(node)` ≠ registrant | Approve manager restoration · Upgrade 1 name · Revoke temporary HCA access | **3** |
| M2 | same, ETHRegistry→HCA already approved | Upgrade 1 name | **1** |

Requires new test data (below). M1 is the **only** path that still produces a revocation, and
it is exactly the case the PR body describes incorrectly — the body says a missing ETHRegistry
approval "adds one confirmation"; the code adds **two** (approval + cleanup).
Post-condition: after M1, the name's V2 manager role must be granted to the original manager
address, and `isApprovedForAll(ETHRegistry, wallet, HCA)` must be **false** again.

### Multi-batch

| # | Selection | Oracle |
|---|-----------|--------|
| G1 | enough names to exceed the RPC gas cap | rows read "Upgrade batch 1 of n"…, footer adds "split into n gas-safe atomic batches", N = D+A+n+C, and n>1 |

### Continuation after fresh HCA deployment (the route change)

| # | Steps | Oracle |
|---|-------|--------|
| C1 | reset HCA → start A1 → confirm the deploy prompt | Flow **stays in the migration run** and proceeds to the approval/upgrade prompts. It must NOT bounce back to name selection. This is what moving `MigrationUiProvider` outside `RequireConnectedWallet` ([migration.tsx](apps/manager/src/routes/migration.tsx)) is for — with the old nesting the actor unmounted while smart-account state refreshed. |

### Edge cases

| # | Case | Oracle |
|---|------|--------|
| E1 | wallet with nothing eligible | "No eligible names found for this wallet", CTA `UPGRADE 0 NAMES` **disabled**, no fee line, no confirmation link |
| E2 | `Locked+All` (all 7 child fuses) | v1 found this silently ineligible. Re-check post-merge. Oracle: either it migrates, or the UI names the dropped name and says why. "No eligible names found" for a name the user explicitly navigated to is a failure. |
| E3 | grace presets (expired) | Excluded at selection is **correct** (unrenewed + expired). Oracle: excluded, and ideally with a reason. Not a migration failure. |
| E4 | `/migration?names=<not-owned>.eth` | no crash; name excluded |
| E5 | deselect to zero mid-flow | CTA disables, fee line disappears |

### Regression (adjacent surfaces sharing this code)

| # | Case | Oracle |
|---|------|--------|
| R1 | **Registration** via HCA (`/register`) | Still works. Shares `computeStandaloneHcaAddress`, the #409 validator and `ens-sessions-v9`. Highest-risk regression from the merge. |
| R2 | **Transfer ownership** of a V2 name (main's #926) | Still works. It is the new consumer of `ensureOwnedPermRes`, which this PR deleted and I restored — so this specific path validates my merge resolution. |
| R3 | Dashboard after migration | Migrated names appear under OWNED with Owner/Manager badges |
| R4 | Migrated name's profile page | `Owner` = connected wallet `0xf39F…2266` (the PR's headline claim) |
| R5 | Success dialog + dashboard nav | "redesign success dialog and dashboard navigation" — dialog renders, its CTA lands on the dashboard |

### State-dependent rendering (vary the state, confirm output tracks)

| # | Vary | Oracle |
|---|------|--------|
| S1 | locale → `sv` | New migration strings are translated (PR adds 239 lines to `sv`) |
| S2 | locale → `de`/`es`/`ru` | PR **removes** 13 lines from each and adds none, so new copy falls back to English. Expected-but-worth-recording, not a bug. |
| S3 | viewport 375×812 vs 1440×900 | Footer stays reachable and the CTA is not clipped ("stabilize migration page viewport layout" + the loading-container height change in the route diff) |

## Test data that must be added

The 8 dev-panel presets (`unwrapped`, `wrapped`, `locked`, `locked-all`, `grace`,
`grace-renewable-wrapped`, `grace-renewable-unwrapped`, `emancipated`) cannot reach part of the
PR's own acceptance list:

1. **Distinct V1 manager** — needed for M1/M2 and for the whole revocation branch.
   [buildMockDomain](packages/dev-migration-tool/src/MigrationTestPanel.helpers.ts#L798) hardcodes
   `owner: { id: owner }` = registrant, so `managerAddress` is always `null`. Needs (a) an on-chain
   `ENSRegistry.setOwner(node, MANAGER)` after registration and (b) `owner.id = MANAGER` in the
   mocked subgraph payload.
2. **Records to replay** — for unwrapped names the mock sets `resolver: null`, and the panel never
   writes V1 text/addr records on-chain. So "records" on the acceptance list is unobservable:
   there is nothing to replay. Needs a preset that sets a V1 resolver + a couple of records.
3. **Grace + renew** — grace names are expired and excluded, so "renew then migrate" needs an
   actual renew action before the migration.
4. **Bulk seed** — G1 needs enough names in one selection to exceed the gas cap.

Items on the PR's acceptance list that remain **out of reach** even with the above, and should
either get tooling or be dropped from the release gate: transaction replacement (needs a
wallet-level replacement hash), atomic rollback (needs an induced mid-batch revert).

## Known environment issues (not PR defects)

- **Node v26.4.0 breaks all `localStorage` unit tests.** Node 26 ships an experimental
  `localStorage` global that shadows happy-dom's and is unavailable without `--localstorage-file`.
  44 tests fail, including `src/utils/xstate-store.test.ts`, which is **not** in this PR.
  Workaround: `NODE_OPTIONS="--localstorage-file=/tmp/ls.json" pnpm vitest run` → 1499 pass.
- **[mock-v1-subgraph.ts:21](e2e/helpers/mock-v1-subgraph.ts#L21)** intercepts a Railway staging
  URL while the app queries `https://v1-graphql.ens.dev/subgraph`, so the Playwright
  `migration*.spec.ts` suite sees zero eligible names. The dev panel reads the URL from ensjs and
  gets it right.
- **Explorer `getAvailable` returns `true` for every name**, including registered ones, so migrated
  names stay invisible there. Independent of this PR (portal/ensjs side).

## Selector traps

1. The "Verify your wallet" modal `aria-hidden`s the page; dismissal is two clicks
   ("Skip for now" → "Skip Anyway"). Until then every `getByRole` returns 0.
2. The CTA renders `UPGRADE 1 NAME` but `textContent` is `Upgrade 1 name` (CSS uppercase) —
   locators must be case-insensitive.
