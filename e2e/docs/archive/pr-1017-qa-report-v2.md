# PR #1017 QA report v2 — `feat(manager): migrate names directly through HCA`

Branch `migration-hca` at upstream `197b228eb` (contenthash + ABI preservation), merged locally with
`origin/main` as **`e7c278548`**.
Manager `localhost:3000` · anvil Sepolia fork `:8545` · panoptes indexer `:5655`.
Driver: Playwright/Chromium against the real UI. Test data seeded through the app's own
**Dev tools → Migration** panel (creates real V1 names on the fork).

## Verdict

**The migration feature works for the cases I could reach.** 15 migrations run end-to-end, every one
reaching "…has been upgraded!", and the predicted wallet-confirmation count matched both the rendered
plan **and the actual on-chain transaction count** in **15/15** scenarios. The permission-reuse
behaviour the PR is built around is real, observable, and correct in both directions.

Two things need the author's attention before merge — one is a genuine code conflict with `main`,
the other is that the PR description does not describe the code.

**Coverage note:** the core matrix is all 2LDs with no records. Subname/descendant migration,
parent-first ordering, and record replay were initially untestable; I added three dev-panel presets
and they now pass too — see "Subnames, hierarchies and records" below. Still out of reach:
multi-batch (blocked by a 29-name cookie cap), transaction replacement, and atomic rollback.

---

## RESOLVED upstream: contenthash + ABI now preserved

`197b228eb fix(manager): preserve contenthash and ABI during migration` fixes the record-loss
finding. `Profile` gained `contentHash` and `abis`, `buildProfileReplayCalls` writes `setContenthash`
and `setABI`, and `getProfilesForDomains` now also requests `contentHash` and `abiChangeds`.

Re-tested end-to-end on the merged branch (`e2e/qa2-record-kinds.mjs`), on both a 2LD and a locked
subname:

| kind | in `Profile`? | on V1 | on V2 | outcome |
|---|---|---|---|---|
| `text:description` | yes | ✓ | ✓ | CARRIED |
| `text:com.twitter` | yes | ✓ | ✓ | CARRIED (normalised `@ens_qa` → `ens_qa`) |
| `text:com.github` (non-default key) | yes | ✓ | ✓ | CARRIED |
| `text:avatar` | yes | ✓ | ✓ | CARRIED |
| `text:header` (Banner) | yes | ✓ | ✓ | CARRIED |
| `text:agent-registration[…][19151]` (ENSIP-25) | yes | ✓ | ✓ | CARRIED |
| `addr:60` (ETH) | yes | ✓ | ✓ | CARRIED |
| `addr:0` (BTC, multicoin) | yes | ✓ | ✓ | CARRIED |
| **`contenthash`** | yes (new) | ✓ | ✓ | **CARRIED — was LOST** |
| **`ABI`** | yes (new) | ✓ | ✓ | **CARRIED — was LOST** |
| `pubkey` | no | ✓ | ✗ | LOST |
| `interface` (`interfaceImplementer`) | no | ✓ | ✗ | LOST |

### Still lost: `pubkey` and `interfaceImplementer`

Neither is a field on `Profile`, so both are still dropped silently, on 2LDs and subnames alike.
Lower impact than contenthash — `pubkey` is rarely set and `interfaceImplementer` rarer still — but
the failure mode is identical: the record disappears, the flow reports success, and
`verifyAtomicMigrationBatch` passes because it only post-checks what it knows about. Either carry
them or warn on names that have them.

### Note for whoever re-runs this

The fix depends on the **subgraph** reporting `contentHash` and `abiChangeds`. My fixture's mocked
`getProfilesForDomains` had to be updated to return those fields; until it was, contenthash and ABI
still read as LOST and the fix looked broken. So this test proves the replay path works **given** the
subgraph reports the records — it does not prove the real V1 subgraph populates `contentHash` and
`abiChangeds` for every name. Same caveat as the dynamic `agent-registration` keys.

## RESOLVED upstream: the `main` conflict on `ensureOwnedPermRes`

This PR originally deleted `apps/manager/src/features/migration/service/ensureOwnedPermRes.ts`, which
main's #926 transfer-ownership work had started consuming from
[setupControlledResolver.ts](apps/manager/src/features/profile/service/setupControlledResolver.ts)
(reached via **Edit profile → Save** and **Choose Primary Name**) — so merging failed typecheck with
`TS2307`. The author's own main merge (`bd0d43174`) restores the module, adopts the contracts-v2 #409
manifest with the `defaultReverseRegistrarHcaAdapter` rename, and re-pins the CREATE2 HCA address to
`0x29fBA8EAfc3a898B48a314182Ea5c93ce5734DBd` — the same value derived independently here. Nothing
left to do; verified by R2 below.

One merge artefact to be aware of if you merge this branch yourself: `V2_DEPLOY_BLOCK` ends up
declared twice in
[contracts/addresses.ts](apps/manager/src/features/migration/contracts/addresses.ts) if you had also
added it locally. Git merges it silently and the app fails at transform time with
`Identifier 'V2_DEPLOY_BLOCK' has already been declared` — typecheck catches it, HMR does not.

## Blocking-ish: the PR description contradicts the shipped code

Unchanged from the v1 report, and still true on the merged branch:

| PR body claim | Reality |
|---|---|
| "Remove the `MigrationHelper.migrate(...)` runtime route" | Still the runtime route. [buildAtomicMigrationBatches.ts:714](apps/manager/src/features/migration/service/buildAtomicMigrationBatches.ts#L714) calls `buildMigrationHelperCall` for every atomic batch |
| "helper approval planning" removed | [migrationApprovals.ts:90-115](apps/manager/src/features/migration/service/migrationApprovals.ts#L90-L115) still plans BaseRegistrar/NameWrapper approvals with `operatorAddress: V2_CONTRACTS.MigrationHelper` |
| "remove permission-revocation transactions" | `revokeTemporaryOperatorApprovals` still exists and still fires; the dialog still shows a **Revoke temporary HCA access** row |
| "A missing ETHRegistry approval … adds one confirmation" | It adds **two**. Measured in M1 below |
| "per-token ERC-721 approvals for **one or two** unwrapped names" | Per-token is used only when **exactly one** token is missing ([migrationApprovals.ts:299](apps/manager/src/features/migration/service/migrationApprovals.ts#L299)). A3 confirms: 2 names → one operator approval |

Corroborating evidence that the cleanup flow is live and was added late: three of its strings are
**missing from the `en` message catalog entirely** (never extracted) —
`Revoke temporary HCA access`, `Remove the temporary permission after the upgrade.`, and
`Your names were upgraded, but temporary HCA access still needs to be revoked.`

The code is self-consistent; the description is stale. But QA is asked to sign off against that
description, so it needs correcting first.

---

## Method — how these results differ from v1

The v1 report used "footer count === dialog row count" as its per-scenario oracle. **That check is
tautological**: the footer's `<Plural value={steps.length}>` and the dialog's `<ol>` both render the
same `estimate.plan.stepDescriptors` array
([SelectNamesStepFooter.tsx:44](apps/manager/src/features/migration/components/SelectNamesStepFooter.tsx#L44)).
It cannot disagree and proves nothing.

v2 replaces it with two independent oracles:

- **O1** — the expected count and the ordered row kinds, computed from chain state read directly
  over RPC *before* clicking, using the rule derived from `buildStepDescriptors` +
  `planMigrationApprovals`:
  ```
  N = D(hca not deployed) + A_base + A_wrap + A_reg + B(atomic batches) + C(cleanup if A_reg)
  ```
- **O2** — the connected EOA's **nonce delta** across the run. Every confirmation is one
  wallet-signed transaction, so the delta must equal N. This catches a plan that is right on paper
  but wrong in execution.

O2 caught a real harness bug immediately: sampling the nonce before seeding counts the dev panel's
own registration transactions, which made A1 look like 4 confirmations instead of 3.

**One late O2 mismatch, resolved as measurement contamination — not a defect.** A run immediately
after the 110-name seeding storm reported `nonceDelta=4` against a 1-confirmation plan. I re-ran the
same scenario under controlled conditions with every wallet transaction in the window captured and
decoded:

```
O2 nonce : 48180 -> 48181 = 1 (predicted 1)
  nonce 48180 block 11465704 to 0x48b9c689…86628 selector 0xf9056eaa  <== counted
counted 1 tx(s) vs predicted 1 -> O2 MATCH
```

Exactly one transaction, to the HCA, `executeByOwner`. The earlier delta straddled the tail of the
seeding run's 110 `BaseRegistrar.register` transactions still being mined. Final tally: **14/14 exact
matches.** Recorded because the raw number looked alarming and would otherwise read as a bug.

### O2 does hold for D=1 — a reported counter-finding, refuted

A Claude-in-Chrome pass reported that on a fresh HCA the UI renders 3 confirmations but only **2**
transactions are broadcast, with HCA deployment "folded into" the upgrade transaction, and concluded
O2 gives a false mismatch whenever `D=1`. **That is not what happens.** Re-audited from a clean reset
with the fork quiesced before the baseline (`e2e/qa2-o2audit-fresh.mjs`):

```
rendered: 3  ['deploy-hca','approve-token','upgrade']
nonce 48207 block 11465772 -> 0x900ff7cf…82672 (StandaloneHCAFactory)  0x1b3671bf
nonce 48208 block 11465773 -> 0x57f1887a…47ea85 (BaseRegistrar)        approve
nonce 48209 block 11465774 -> 0x48b9c689…86628 (HCA)                   executeByOwner
HCA bytecode first non-empty at block 11465772  <- the factory-deploy block
actual wallet txs: 3   =>  O2 holds for D=1
```

Three transactions at consecutive nonces, and the HCA receives its bytecode in the **factory-deploy**
block (11465772), *not* in the `executeByOwner` block (11465774). "Create migration account" is a
real, separate transaction to the factory. The likely error in the counter-finding is attributing the
appearance of HCA bytecode to the upgrade transaction; sampling `eth_getCode(hca, <block>)` per block
across the window distinguishes them unambiguously. The step→transaction mapping is now written into
the Chrome prompt so this is not re-derived by inspection.

---

## Core matrix — 8/8 PASS on all three oracles

One session, no reset between scenarios: the carry-over is what makes the counts move.

| # | Selection | Predicted N | Rendered N | Rows match | Nonce Δ | Result |
|---|-----------|--:|--:|---|--:|--------|
| A1 | 1 unwrapped, **fresh HCA** | 3 | 3 | ✅ | **3** | SUCCESS |
| A2 | 1 unwrapped | 2 | 2 | ✅ | **2** | SUCCESS |
| A3 | 2 unwrapped | 2 | 2 | ✅ | **2** | SUCCESS |
| A4 | 1 unwrapped | 1 | 1 | ✅ | **1** | SUCCESS |
| A5 | 1 unlocked wrapped | 2 | 2 | ✅ | **2** | SUCCESS |
| A6 | 1 locked 2LD | 1 | 1 | ✅ | **1** | SUCCESS |
| A7 | 1 wrapped + 1 unwrapped | 1 | 1 | ✅ | **1** | SUCCESS |
| A8 | locked 2LD **with** an emancipated child beneath it | 1 | 1 | ✅ | **1** | SUCCESS |
| A9 | 2 unlocked wrapped (batch-transfer path) | 2 | 2 | ✅ | **2** | SUCCESS |

Confirmed claims:

- **Fresh vs existing HCA** — A1 shows `Create migration account`; A2 onward drops it (3 → 2).
- **Per-token approvals are consumed by transfer** — A2 needs `Approve <name>` again after A1 used
  one. A2 and A4 are the crux pair and they behave correctly in *both* directions.
- **Operator approvals persist** — A3 grants one operator approval for two names; A4 then needs
  **zero** (N=1). Same for NameWrapper across A5 → A6 → A7.
- **Exact row order matched the prediction in all 8**, not just the count.

A9 additionally confirms the wrapped multi-name path (which should coalesce with
`safeBatchTransferFrom`): two wrapped names migrate under one `Upgrade 2 names` confirmation, and both
resolve in the indexer to the connected wallet. Note this observes the *consequence*, not the calldata
— the transfer call is inside the `executeByOwner` payload and I did not decode it.

## Subnames, hierarchies and records — now covered (tooling added)

These were unreachable, so I added three presets to the dev panel (`Records`, `Subname`,
`Subname+Rec`) and they now pass:

| Preset | Offered | Result | Records replayed onto V2 |
|---|---|---|---|
| `Records` — unwrapped 2LD + V1 resolver + records | `UPGRADE 1 NAME` | SUCCESS (N=2) | **yes** — description + ETH addr |
| `Subname` — locked 2LD + locked child | `UPGRADE 2 NAMES` | SUCCESS (N=1) | n/a |
| `Subname+Rec` — both, both with records | `UPGRADE 2 NAMES` | SUCCESS (N=1) | **yes, on both** |

Verified on the V2 side, not just in-band: for `Subname`, **both** `dev2486.eth` and
`sub-dev2486.dev2486.eth` come back from the indexer owned by `0xf39fd6e5…b92266` — so descendant
migration and parent-first hierarchy ordering genuinely work. For `Records`/`Subname+Rec` the
migrated profile renders the `description` and the ETH address that were written to the V1 resolver.

So the selection screen's promise — "Your names, text records, and addresses will migrate
automatically" — now has evidence behind it, on 2LDs and on subnames.

### Correction: `Locked+All` is *correctly* ineligible

I earlier logged `Locked+All` coming back 0-eligible as a real, unexplained finding. That was wrong.
`ALL_CHILD_FUSES` includes **`CANNOT_TRANSFER`**, and
[classifyNames.ts:253](packages/migration/src/service/classifyNames.ts#L253) rejects any name with
that fuse as `not-transferable` — a name that cannot be transferred genuinely cannot be migrated.

Proven by isolating the fuse: the new `Locked -xfer` preset burns `CANNOT_TRANSFER` and nothing else,
and classifies as `[] / ['not-transferable']`. The only real defect is that the UI neither names the
dropped name nor gives the reason.

### One finding this surfaced: replay depends on the resolver being *recognised*

`resolverStrategyFor` only returns `to-owned-permres` (the branch that replays records onto a fresh
owned resolver) when the name's V1 resolver is in `KNOWN_PUBLIC_RESOLVERS`
([knownResolvers.ts](packages/migration/src/contracts/knownResolvers.ts)). Anything else yields
`keep-v1`: the V2 name is pointed back at the old V1 resolver and **nothing is replayed**.

My first attempt used the panel's `V1_PUBLIC_RESOLVER` (`0xE99638b4…`), which is a live Sepolia
PublicResolver but is **not** in that list — so the fixture silently exercised `keep-v1` and no
records moved. Switching to `0x8FADE66B…5B7dD` (in the list, and deployed on the fork) is what made
replay happen. That is exactly the risk behind the PR's own release gate *"the live
`PublicResolverSet` contains every replaceable resolver"*: any real user whose resolver is missing
from that set keeps their V1 resolver instead of having records migrated. Worth confirming the
shipped list covers every resolver actually in use on mainnet.

Two `?names=` items remain out of reach: transaction replacement (needs a wallet-level replacement
hash) and atomic rollback (needs an induced mid-batch revert).

## Previously NOT TESTED — how it looked before the tooling existed

Being explicit, because three items on the PR's own acceptance list are **not covered by anything
above**, and one of my earlier scenario labels was misleading.

### Subnames and parent-first hierarchies — unreachable

**A8 was not a subname migration.** The `Emancipated` preset creates a real on-chain emancipated child
and I verified it exists — `sub-dev0225.dev0225.eth` is owned by `0xf39F…2266` in the V1 NameWrapper.
But `/migration` offered **only the parent**:

```
child on-chain owner (NameWrapper): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266  (== wallet)
names listed on /migration        : dev0225.eth
selectable rows                   : 1        CTA: UPGRADE 1 NAME
child listed?                     : false
```

Cause: [buildMockDomain](packages/dev-migration-tool/src/MigrationTestPanel.helpers.ts#L798) always
builds a 2LD (`${label}.eth`), and the panel's fetch interceptor only injects into
`getNamesForAddress`. The real hosted subgraph cannot see Anvil-only names, so no descendant ever
enters the eligible list. A8 is therefore "a locked 2LD that happens to have a locked child", which is
worth having but is **not** what the PR's descendant logic does.

So all of this is untested, and cannot be reached with current tooling:

- migrating a **subname / descendant** at all (the `childNames` group)
- **parent-first ordering** of locked hierarchies
- routing locked/detached descendants to their **recursively derived, factory-certified parent
  `WrapperRegistry`**
- **failing closed** on missing, conflicting, uncertified, or cyclic routes

This is a large share of the PR's stated implementation (`directMigrationRoutes.ts`,
`migrationInvariants.ts`) and it is covered only by unit tests, not by any UI path.

### Records replay — structurally unobservable

Record keys come from the `getProfilesForDomains` query
([v1SubgraphClient.ts:140](apps/manager/src/features/migration/service/v1SubgraphClient.ts#L140)).
The panel's interceptor handles **only** `getNamesForAddress` and `getV1DomainForMigration`
([MigrationTestPanel.tsx:122-124](packages/dev-migration-tool/src/MigrationTestPanel.tsx#L122-L124)),
so that query falls through to the hosted subgraph, which has never heard of these names and returns
nothing → `texts: []`, `coinTypes: []`.

The panel also never writes V1 records on-chain, and for unwrapped names the mock sets
`resolver: null`. So **"records migrate automatically" — the promise printed on the selection screen —
was never exercised.** Every migration I ran had zero records to replay, and
`verifyAtomicMigrationBatch`'s record post-condition passed vacuously.

To close it the panel needs to (a) set a V1 resolver, (b) write a couple of text/addr records
on-chain, and (c) intercept `getProfilesForDomains` to return those keys.

## M1 / M2 — manager restoration, previously unreachable

The v1 report flagged this branch as untestable: no dev-tool preset seeds a name whose V1 manager
differs from its registrant, so `requiresManagerRestoration` never became true and the *only*
remaining revocation path never fired in 13 runs.

I added a **`Managed`** preset to the dev panel — `BaseRegistrar.reclaim(tokenId, manager)` so the
V1 registry owner is Anvil account 1 while the registrant stays account 0, plus the matching
`owner.id` in the panel's subgraph mock. Both scenarios then run:

| # | Setup | Rows (observed, in order) | Predicted | Rendered | Nonce Δ | Result |
|---|-------|---------------------------|--:|--:|--:|--------|
| M1 | ETHRegistry→HCA not approved | Approve manager restoration · Upgrade 1 name · **Revoke temporary HCA access** | 3 | 3 | **3** | SUCCESS |
| M2 | ETHRegistry→HCA pre-granted | Upgrade 1 name | 1 | 1 | **1** | SUCCESS |

**This measures the PR-body error directly: manager restoration costs 2 confirmations, not 1.**

Post-conditions verified:
- After M1 the ETHRegistry approval is **`false`** again — the revocation really executes.
- After M2 the pre-existing approval is left **`true`**. The cleanup only revokes approvals the flow
  itself granted, which is defensible, but worth stating explicitly: a permission the user already
  had is not cleaned up.
- The migrated `Managed` name's profile shows `Owner 0xf39F…2266` (see R4), so restoring a manager
  does not cost the wallet its ownership.

## G1 — multi-batch gas partitioning

Not reached at the scale I first assumed, and the arithmetic is worth recording because it makes the
PR's "Each additional live gas batch adds one confirmation" row hard to reach in practice.

At 1 gwei on this fork, measured from the rendered fees:

| Selection | Fee | Implied gas |
|---|---|---|
| 1 unwrapped | 0.000275 ETH | ~275,000 |
| 28 unwrapped | 0.00554 ETH | ~5,540,000 |

That gives **~80,000 gas fixed overhead + ~195,000 gas per name**, so the planning cap
(`TARGET_GAS = 20,000,000`) is not reached until roughly **102 names** in a single selection
(`EXECUTION_TARGET_GAS = 15,000,000` at ~77).

**28 names produced exactly one batch** — N=1, one `Upgrade 28 names` row, no footer split note.
O1 matched.

### G1 is structurally unreachable through the dev panel — root cause found

Seeding **110** names did not help: the panel's own counter read `Migrate All (110)`, but the
migration page rendered **`Upgrade 29 names`** (fee 0.005735 ETH, barely above the 28-name fee).

The panel persists its active-name list as a **single URL-encoded cookie** with no size guard
([MigrationTestPanel.helpers.ts:1182-1188](packages/dev-migration-tool/src/MigrationTestPanel.helpers.ts#L1182-L1188)):

```js
const value = encodeURIComponent(JSON.stringify(names))
document.cookie = `${NAMES_COOKIE_NAME}=${value}; path=/; max-age=…; SameSite=Lax`
```

Browsers cap a cookie at 4096 bytes. Each entry costs ~140 bytes once URL-encoded, and the exact
capacity is:

| names | cookie value | fits? |
|---:|---:|---|
| 28 | 3,923 B | yes |
| **29** | **4,063 B** | **yes — the maximum** |
| 30 | 4,203 B | no |
| 110 | 15,403 B | no |

**29 is precisely what the page rendered.** So the panel silently drops everything past the 29th
name while its counter keeps reporting the in-memory total — it misreports its own state to the
tester.

Since multi-batch needs ~102 names and the panel can carry 29, **multi-batch partitioning and
multi-batch retry cannot be tested through this tooling at all.** Fix the cookie (chunk it, store
only labels, or use `localStorage` plus an explicit cross-origin sync) before these items can leave
the release gate.

## Edge cases

| # | Case | Result |
|---|------|--------|
| E1 | nothing seeded | **PASS** — "No eligible names found for this wallet", CTA `UPGRADE 0 NAMES` disabled, no fee line, no confirmations link |
| E2 | `Locked+All` (all 7 child fuses) | **REPRODUCED (pre-existing)** — 0 eligible. See below |
| E4 | `/migration?names=<not-owned>.eth` | **PASS** — excluded, no crash |
| E5 | deselect mid-flow | **PASS** — 2 names 0.00047 ETH → 1 name 0.000275 ETH → 0 names: CTA `UPGRADE 0 NAMES` disabled, fee line gone. Partial-selection warning ("Upgrade all names to receive NFT") appears correctly at 1 of 2 |

### E2 — `Locked+All` is silently ineligible

`Locked` migrates fine (A6). `Locked+All` — the same name with all seven child fuses burned —
returns 0 eligible, and the page says only:

> 0 out of 0 ELIGIBLE NAMES SELECTED … No eligible names found for this wallet

The user navigated to that specific name and gets a message that never mentions it or why it was
dropped. `SelectNamesStep.tsx` and `selectNames.helpers.ts` are **not in this PR's diff**, so this is
pre-existing — but this PR does drop `IneligibleReason` from the manager's re-export in
`classifyNames.ts`, which moves the codebase *away* from being able to surface the reason.

## Regression

| # | Case | Result |
|---|------|--------|
| R1 | `/register?name=…` | **PASS** — page renders, price computes, no "Failed to initialize standalone HCA account", no crash. This is the surface most at risk from the contracts-v2 #409 validator/implementation change |
| R2 | **Edit profile → Save** on a migrated name | **PASS** — Save enabled, submitted, and the new description renders on the profile ("About qa2-324590"), **0 console errors**. This is the `setupControlledResolver → ensureOwnedPermRes` path, so it validates the merge resolution above against the real app |
| R3 | migrated name reaches the indexer | **PASS** — verified by querying the indexer directly rather than reading the virtualized dashboard list. `dev6470.eth` and `dev6031.eth` (both migrated after the indexer was repaired) return `owner 0xf39fd6e5…b92266`; `dev9371.eth` (migrated during the broken-mount window) returns `[]`, exactly as the diagnosis below predicts. A text search of the rendered dashboard is **not** a valid check — with 78 owned names only the first few rows are in the DOM, which is what made my first attempt look like a failure |
| R4 | migrated name's profile owner | **PASS** — `dev9371.eth` (unwrapped), `dev9838.eth` (emancipated child) and `dev9955.eth` (managed) all show **`Owner 0xf39F…2266`**, the connected wallet. Confirms the PR's headline claim |
| C1 | continuation after fresh HCA deployment | **PASS** — covered by A1: a fresh-HCA run reached success with a nonce delta of exactly 3, which is only possible if the flow continued through deployment → approval → upgrade in one run instead of returning to name selection. This is what moving `MigrationUiProvider` outside `RequireConnectedWallet` ([migration.tsx](apps/manager/src/routes/migration.tsx)) achieves |

---

## Merge findings (from integrating with `origin/main`)

I merged rather than rebased. The branch already carries four `Merge branch 'main'` commits, and
rebasing 16 commits produced conflicts starting at the first one — resolving those repeatedly would
mean QA-ing my own conflict resolutions rather than the PR. Backup: `backup/migration-hca-prerebase`.

1. **Stale contract namespace.** The PR pins contracts-v2 **#388** (`standaloneHcaImplementation
   0xD213De41…`, validator `0x976D90c5…`); main has moved to **#409** (`0xAA761541…`,
   `0x5f249FCa…`) and renamed `defaultReverseRegistrarAdapter` → `defaultReverseRegistrarHcaAdapter`.
   I took main's. Verified by deriving the Anvil-account-0 HCA with the merged manifest and
   reproducing **`0x48B9c6898baFc8A3D3a495BF7c44CF3351486628`** — the value main derived
   independently on-chain in `d2e8642b6`.
2. **Auto-merge silently mis-resolved the rename** in `registration-calls.ts`, leaving a
   `defaultReverseRegistrarAdapter` reference against a manifest that no longer had the field.
   Applied consistently.
3. **`initialize-account.test.ts` pinned a #388-derived CREATE2 address.** Re-pinned to
   `0x29fBA8EAfc3a898B48a314182Ea5c93ce5734DBd` with the cross-check recorded in a comment.
4. **main's stricter EIP-55 guard** would have failed on four lowercase address literals this PR
   adds (`rootRegistry`, `publicResolverSet`, `wrapperRegistryImpl`, `publicResolverV2`) and on the
   bigint `verifiableFactoryDeployBlock`. Checksummed the literals; the guard now skips non-strings.

Post-merge verification: manager typecheck ✅, portal typecheck ✅, **manager 1499 tests pass**,
smart-account 88 ✅, transaction-manager 99 ✅.

## Infra incident I caused, and how to undo it

While setting up the merge I stashed and restored `e2e/infra/panoptes/contracts.json` (it was one of
your locally-modified files). Docker binds that file into the running indexer by **inode**:

```
/Users/sg/.../e2e/infra/panoptes/contracts.json -> /app/config/contracts.json (bind)
```

`git stash push` + `git stash pop` replaces the file, so the already-running container was left
pointing at a deleted inode. Inside the container the path simply did not exist:

```
md5sum: can't open '/app/config/contracts.json': No such file or directory
```

With no config the v2 indexer treats every contract as unknown — `processed 0, skipped 2 (unknown
contracts)` on every batch, and **zero** `Migration detected` lines in the whole log. That covered
the entire window in which all 13 migrations ran, so none of them reached the database.

`docker restart infra-panoptes-indexer-1 infra-panoptes-api-1` re-binds the file (md5 now matches
the host, and `skipped` dropped from 2 to **0**). But the indexer resumes from the **current head**
(`11464574`), so the earlier migrations are not backfilled.

To fully verify R3 you need a re-index from the deployment block `11383816` — which is the same
operation the v1 report flagged as dropping names that only existed under the retired deployment.
Cheaper alternative: migrate one fresh name now that the indexer is healthy and confirm it appears.

Lesson for the harness: never `git stash` a file that is bind-mounted into a running container —
copy it aside instead, or restart the container afterwards.

## Test data still missing (PR acceptance list vs tooling)

The panel now has 9 presets. What the PR asks QA to cover but tooling still cannot reach:

1. **Records replay — unobservable.** Record keys come from `getV1ProfileKeys`, a *separate* V1
   subgraph query the panel does not mock, and the panel never writes V1 text/addr records on-chain.
   For unwrapped names the mock even sets `resolver: null`. So "records" passes trivially with
   nothing to replay. Needs a preset that sets a V1 resolver plus a couple of records.
2. **Grace + renew.** Grace names are expired and correctly excluded at selection. Testing
   "renew then migrate" needs a renew action first; there is no renew control in the panel.
3. **Transaction replacement** — needs a wallet-level replacement hash; not reachable from the UI.
4. **Atomic rollback** — needs an induced mid-batch revert.

Recommend either adding tooling for these or removing them from the release gate, since as written
the gate cannot be satisfied by manual QA.

## Environment issues (not PR defects)

- **Node v26.4.0 breaks every `localStorage` unit test.** Node 26 ships an experimental
  `localStorage` global that shadows happy-dom's and is unavailable without `--localstorage-file`.
  44 tests fail, including `src/utils/xstate-store.test.ts`, which is **not** in this PR.
  Workaround: `NODE_OPTIONS="--localstorage-file=/tmp/ls.json" pnpm vitest run` → 1499 pass.
- **The Playwright suite cannot run against this setup.** `apps/manager/.env` has
  `VITE_USE_MOCK_WALLET=true` (required by the QA harness), which replaces the connect flow the
  specs drive, so `connectWithHeadlessWallet` times out. Mock wallet and the e2e connect flow are
  mutually exclusive — flip per purpose.
- `e2e/projects/manager/tests/registration-rhinestone.spec.ts` had **unresolved conflict markers**
  in the working tree, so the file would not even parse. Resolved by combining both sides (keep the
  "Set up later" click, keep the text-based banner locator).
- **A pre-existing React warning**, not from this PR: "Cannot update a component (`MigrationPage`)
  while rendering a different component (`SelectNamesStep`)", fired by deselecting a name.
  `useNameSelection` calls `onNamesChange` from inside the `setSelected` updater
  ([useNameSelection.ts:63-67](apps/manager/src/features/migration/hooks/useNameSelection.ts#L63-L67)),
  which React runs during render. `useNameSelection.ts` is not in the PR diff and `handleNamesChange`
  is byte-identical on main.
- Non-`en` locales are largely untranslated app-wide already (sv 33/789 strings; de/es/ru 109/647),
  so migration copy showing in English under those locales is pre-existing.
- The **explorer reports every name as "available"**, including registered ones — a portal/ensjs
  `getAvailable` problem, independent of this PR, which hides all names there.
- **RETRACTED — "the explorer ignores protocol version and hides V1 records" was my error, not a
  portal defect.** A record fixture showed `Records set 0` in the explorer, and I attributed it to
  `getRecords` resolving through the UniversalResolver. It was actually a fixture inconsistency of
  mine: the explorer reads a name's resolver from the **V2** side, the panel's reservation hardcoded
  `V1_PUBLIC_RESOLVER` (`0xE99638b4`), and I had pointed the record presets at `0x8FADE66B` to reach
  the `to-owned-permres` replay path — so the two disagreed and the explorer read an empty resolver.
  Real Sepolia names hide this because their V1 resolver usually *is* `0xE99638b4`; `stitch.eth`
  displays its records correctly. Fixed by threading the fixture's resolver into `reserveInV2`;
  a fresh `Records` name now shows `4 Records` and `Resolver 0x8FAD…B7dD`. **No portal bug here** —
  do not go looking for one.

## Reproducing

Harness in `e2e/`: `qa2-lib.mjs` (driver + O1/O2 oracles), `qa2-matrix.mjs` (A1–A8),
`qa2-managed.mjs M1|M2`, `qa2-edge.mjs`, `qa2-e5.mjs`, `qa2-multibatch.mjs`, `qa2-regression.mjs`,
`qa2-r2.mjs`. Always `node e2e/qa-reset.mjs` first — counts depend entirely on leftover fork state,
and resetting the HCA needs **both** `anvil_setCode(hca,'0x')` and `anvil_setNonce(hca,0)` (EIP-684
refuses CREATE2 at a non-zero-nonce address, and the flow then dies with "Failed to initialize
standalone HCA account").

Two selector traps: the "Verify your wallet" modal `aria-hidden`s the page (dismiss via
"Skip for now" → "Skip Anyway"), and the CTA renders `UPGRADE 1 NAME` but its text content is
`Upgrade 1 name`, so locators must be case-insensitive.
