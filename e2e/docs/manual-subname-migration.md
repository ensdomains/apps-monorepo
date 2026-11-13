# Manual subname migration testing

How to drive the V1 → V2 subname migration by hand, using the dev migration
panel (`packages/dev-migration-tool`).

## What subname migration actually is

Subnames do **not** migrate the way 2LDs do. The subname-migration PR added a
second action alongside `migrate`:

| `action` | `tokenType` | what happens |
|---|---|---|
| `migrate` | `unwrapped` `unlocked` `locked-2ld` `locked-child` `detached-child` | the V1 token is **transferred** to a V2 receiver |
| `copy` | `unlocked-child` `registry-child` | there is no transferable token, so the name is **re-created** in V2 |

A copy is registered inside a **deterministic per-parent `UserRegistry`**:

```
VerifiableFactory.deployProxy(UserRegistryImpl, salt, initialize(hca, ROLES_ALL))
salt = keccak256(abi.encode(keccak256("ENSManagerMigrationUserRegistry:v1"), namehash(parent)))
```

Three consequences worth internalising before you start, because each one looks
like a bug the first time you hit it:

1. **A copy is never offered without its parent.** `hasCompleteCopyRoute` walks
   up from the child and keeps it only if it reaches a name that is migrating
   directly *and* is an `unwrapped` or `unlocked` `.eth` 2LD. Otherwise the name
   is demoted to ineligible `missing-parent`.
2. **A child of a LOCKED 2LD is not a copy at all.** It stays on the older
   `locked-child` / `detached-child` WrapperRegistry token route.
3. **The app renders no ineligible list.** `useEligibleV1Names` returns only the
   classified names, so "this name is ineligible" is observable *only* as
   absence. Always seed a control preset alongside a negative one, or you cannot
   tell a correct rejection from a broken subgraph mock.

## Setup

```bash
# 1. Local stack: Anvil Sepolia fork, bundler, paymaster, mockestrator
pnpm e2e:infra:up

# 2. Manager with the dev tools enabled
cd apps/manager && VITE_MIGRATION_TOOL=1 pnpm dev     # :3000
```

`VITE_MIGRATION_TOOL` is the only thing that makes the panel appear, and it is
set in no committed env file. Either export it as above or add it to
`apps/manager/.env.local` (gitignored):

```
VITE_MIGRATION_TOOL=1
VITE_MIGRATION_TOOL_RPC=/rpc
```

> **If you see no dev drawer at all**, this is why. The drawer renders only when
> at least one of `VITE_MIGRATION_TOOL`, `VITE_TIME_TRAVEL` or `VITE_DQA` is set
> (`packages/dev-tools/src/config.ts`). With none of them set there is no
> trigger, no tab strip, nothing — which reads as "the dev tools are broken"
> rather than "they are switched off".

Then:

1. Open `http://localhost:3000` and connect **Anvil account #0**
   (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`). Subgraph injection is
   address-scoped, so names created by the panel are invisible to any other
   address.
2. Open the DevDrawer (bottom-right, left of the TanStack devtools button) →
   **Migration** tab.
3. `/migration` is behind the PostHog `migration` flag, keyed on the connected
   address. There is no dev bypass; if you are redirected to `/dashboard`, that
   is why.

## The presets

The strip is grouped by which route each preset exercises. Hover any button for
the exact expected `action` / `tokenType` / `IneligibleReason`.

### copy — the subname routes

| Button | Shape | Expected |
|---|---|---|
| **Copy sub (registry)** | unwrapped 2LD + registry-only child | `copy`/`registry-child`, expiry `MAX_UINT64` |
| **Copy sub (wrapped)** | unlocked 2LD + child with no fuses | `copy`/`unlocked-child`, carries its wrapper expiry |
| **Copy nested** | unwrapped 2LD → registry 3LD → registry 4LD | a `UserRegistry` per copy parent, chained |

### ineligible — the copy route's rejections

Each of these should show **nothing**. Seed an `Unwrapped` preset alongside so
the list is non-empty and you are observing a filtered-out name.

| Button | Shape | Expected |
|---|---|---|
| **Copy orphan** | child whose 2LD is created but not offered | ineligible `missing-parent` |
| **Copy -locked** | LOCKED 2LD + no-fuse child | 2LD migrates as `locked-2ld`; child ineligible `missing-parent` |
| **Copy -res** | 2LD + `bad-` child on an unrecognised resolver, `good-` child with none | `bad-` ineligible `unsupported-resolver`; `good-` still offered |

## Walkthrough

For **Copy sub (registry)**:

1. Click the preset. It registers `devNNNN.eth` unwrapped, creates
   `sub-devNNNN.devNNNN.eth` directly in the legacy registry, and reserves the
   V2 slot.
2. Click **Migrate**. The selection tree should show `devNNNN.eth` as a
   **pressed, clickable** row with `sub-devNNNN.devNNNN.eth` nested beneath it
   as a **non-interactive** row — a subname follows its root and cannot be
   toggled alone.
3. The footer should read `Upgrade 2 names`.
4. Complete the flow, then verify on chain:

```bash
cast call $ETH_REGISTRY "getSubregistry(string)(address)" devNNNN         # non-zero
cast call $VERIFIABLE_FACTORY "verifyContract(address)(address)" $THAT    # == ensUserRegistryImpl
cast call $THAT "getState(uint256)" $(cast keccak sub-devNNNN)            # status 2, expiry 2^64-1
```

For **Copy sub (wrapped)** the same holds, except `getState().expiry` is the
child's NameWrapper `wrappedDomain.expiryDate` rather than the sentinel. That
one field is what distinguishes `registry-child` from `unlocked-child`.

## Re-running a preset

A copy lands in a registry whose address derives from `namehash(parentName)`, so
migrating the **same label** twice hits the same slot and
`copyMigrationReadiness` refuses it (`subregistry-conflict`, `v2-name-history`).
The app surfaces none of that — the Upgrade button simply sits disabled under
**"Gas estimate unavailable"**.

The panel reads that state and shows a `pristine` / `already migrated` chip next
to a selected copy preset. When it says *already migrated*, **seed the preset
again** — every press mints a fresh `devNNNN` label, which derives a different
salt and therefore a clean slot. There is no in-place reset: the `.eth`
registry's subregistry pointer and the child's state entry are exactly what the
readiness check is protecting.

## When something does not appear

Work down this list before assuming an app bug:

1. **Is the drawer there at all?** See the `VITE_MIGRATION_TOOL` note above.
2. **Are you Anvil account #0?** Injection is address-scoped.
3. **Is the parent offered?** A copy without a migrating 2LD ancestor is
   correctly filtered out.
4. **Is the parent locked?** Then its children are not copies.
5. **Does the child have an unrecognised resolver?** Then it is correctly
   ineligible.
6. **Is it a re-run?** See above.

## Related

- `e2e/projects/manager/tests/migration-subname.spec.ts` — the automated version
  of this walkthrough. Run with `pnpm e2e:manager-migration`.
- `e2e/docs/manual-time-travel.md` — the same shape of doc for the time-travel
  panel, which shares the DevDrawer.
- `apps/manager/src/features/migration/service/copyMigrationReadiness.ts` — the
  full list of reasons a copy can be refused at execution time.
