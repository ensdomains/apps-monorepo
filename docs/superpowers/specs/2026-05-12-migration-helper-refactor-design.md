# Migration Helper Refactor — Design Spec

**Date:** 2026-05-12
**Branch:** `tenderly-migration-support-v3`
**Scope:** `apps/manager/src/features/migration/`, plus a project-wide Sepolia RPC swap.

## 1. Goal

Refactor the v1→v2 migration flow in the manager app to use the new `MigrationHelper` contract deployed on Sepolia at `0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA` (source: `ensdomains/contracts-v2`, branch `feat/migration-helper`, `contracts/src/migration/MigrationHelper.sol`).

The helper exposes a single `migrate(unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups)` entry point that performs every v1 token transfer in one external call, internally resolving the v2 parent registry for locked children via `LibRegistry.findExactRegistry`. This collapses the current per-name `safeTransferFrom` strategy, removes client-side parent-registry walking, and removes the two-phase deferred-children workflow.

Secondary goal: switch the project-wide default Sepolia RPC to the Tenderly virtual fork at `https://virtual.sepolia.us-east.rpc.tenderly.co/5861d235-a772-47a3-8772-4f6a3f2ea4b5` so the new flow can be exercised end-to-end against forked state.

## 2. Non-goals

- Smart account / ERC-4337 / Rhinestone migration paths. The migration feature is **EOA-only** by direction. All SCA branches, HCA equivalence handling, and the ZeroDev/Rhinestone request builders are removed from the migration code.
- Changes to portal, explorer, or worker code.
- Multi-owner grouping inside `Data[][]`. The classifier guarantees every name shares a single owner (`migrationOwner`), so each inner group is always a single-element list of all names of that bucket.
- Aggregating auxiliary calls (`preMigrate`, `grantRoles`, profile replay) through a multicall. They stay as today's per-call sequential EOA transactions.
- Smart-session / paymaster-sponsored UX. EOA pays gas, signs each tx.

## 3. Background

### 3.1 Current flow (today)

For each `ClassifiedName` (`unwrapped` | `unlocked` | `locked-2ld` | `locked-child` | `detached-child`), `buildMigrationPlan` produces a `NameBundle` containing a sequence of `ZeroDevCall`s:

1. `preMigrate(label, expiry, v1Registry, v1Resolver)` on `PreMigrationController` (2LDs only, non-reserved).
2. `safeTransferFrom(holder, v2Controller, tokenId, encodedMigrationData)` directly on `BaseRegistrar` or `NameWrapper`.
3. `grantRoles(resource, ROLE_SET_RESOLVER, managerAddress)` on `ETHRegistry` (when a manager role exists).
4. profile-replay multicall on the freshly deployed `OwnedPermRes` (when migrating to one).

Bundles are then packed into batches by raw-bytes budget (`MAX_BATCH_RAW_BYTES = 50_000`) because ZeroDev/Rhinestone UserOps had calldata limits. Locked children whose parent is in the same plan are *deferred*: phase 1 migrates the parent, the client polls the new v2 registry via `walkDeepRegistry` (`getSubregistry` reads), then phase 2 migrates the children.

Before any of that, `ensureApprovals` writes `setApprovalForAll(scaAddress, true)` on the v1 contracts so the SCA can move user tokens.

### 3.2 What `MigrationHelper` does

```solidity
function migrate(
    LibMigration.Data[] calldata unwrapped,            // ERC-721 .eth 2LDs
    LibMigration.Data[][] calldata unlockedGroups,     // wrapped unlocked 2LDs, grouped by owner
    LibMigration.Data[][] calldata lockedGroups,       // wrapped locked 2LDs, grouped by owner
    LockedChildren[] calldata lockedChildrenGroups     // wrapped locked 3LD+, grouped by parent
) external

struct Data { string label; address owner; IRegistry subregistry; address resolver; }
struct LockedChildren { bytes parentName; Data[][] groups; }
```

The helper, in `migrate()`:
- Reads `sender = _msgSenderWithHcaEquivalence()` (for EOA mode this is the EOA).
- For `unwrapped`: looks up the v1 owner, checks the helper itself was approved as operator (or `sender == owner`), and `safeTransferFrom`s to `UNLOCKED_CONTROLLER` with `abi.encode(Data)` as the payload.
- For `unlockedGroups` / `lockedGroups`: identical pattern via `NameWrapper.safeBatchTransferFrom` (or single `safeTransferFrom` for a group of one).
- For `lockedChildrenGroups`: resolves the v2 parent registry via `LibRegistry.findExactRegistry(ROOT_REGISTRY, parentName, 0)`. If unresolved → `ParentNotMigrated(bytes)`. Otherwise transfers each child group directly to its parent registry.

Bucket order is fixed: `unwrapped → unlocked → locked → lockedChildren`. Same-tx parent+child is supported because the locked controller deploys the child registry synchronously on `onERC1155Received`.

### 3.3 Why the helper changes things for this codebase

- **Transfers collapse**: one `migrate()` call replaces N per-name `safeTransferFrom` calls.
- **No parent-registry walker**: the helper resolves the v2 child registry on-chain by walking `LibRegistry.findExactRegistry`.
- **No deferred children**: parent and child can ride in the same call.
- **No batch-by-payload-bytes**: the migration's calldata is one bounded call; the `MAX_BATCH_RAW_BYTES` packing logic is obsolete.
- **Approval target changes**: the helper itself must be approved as operator on `BaseRegistrar` / `NameWrapper`, instead of the SCA.

## 4. Final user-facing transaction sequence (EOA mode)

In order, for a typical migration:

1. `setApprovalForAll(MigrationHelper, true)` on `BaseRegistrar` — only if any unwrapped 2LDs.
2. `setApprovalForAll(MigrationHelper, true)` on `NameWrapper` — only if any wrapped names (unlocked, locked, or any child).
3. `ensureOwnedPermRes` (deploys an `OwnedPermissionedResolver` via the existing factory) — only if any name has `resolverStrategy === 'to-owned-permres'` and one isn't already deployed.
4. `preMigrate(label, expiry, v1Registry, v1Resolver)` on `PreMigrationController` — one tx per non-reserved 2LD.
5. `MigrationHelper.migrate(unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups)` — single tx for all transfers.
6. `grantRoles(resource, ROLE_SET_RESOLVER, managerAddress)` on `ETHRegistry` — one tx per name with a manager.
7. profile-replay multicall on the owned `PermissionedResolver` — one tx per `to-owned-permres` name with persisted v1 records.

Each tx is a normal EOA write through the existing `transactionManager.startTransaction({ type: 'custom', request: { type: 'eoa', ... } })` path. Progress is tracked one descriptor per tx.

## 5. Code changes

### 5.1 RPC swap (project-wide)

**`packages/indexer/chain.ts`**

```ts
const DEFAULT_SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/5861d235-a772-47a3-8772-4f6a3f2ea4b5'
```

The `VITE_SEPOLIA_RPC_URL` env override still wins. All apps that import from `@ens-apps/indexer/chain` now default to the Tenderly virtual fork.

### 5.2 Migration feature changes

**`apps/manager/src/features/migration/contracts/addresses.ts`** — add:

```ts
MigrationHelper: '0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA',
```

**`apps/manager/src/features/migration/contracts/abis.ts`** — add `MIGRATION_HELPER_ABI`:

- `function migrate((string,address,address,address)[], (string,address,address,address)[][], (string,address,address,address)[][], (bytes,(string,address,address,address)[][])[])`
- `error WrappedOwnerMismatch(uint256)` (`0xd04374c0`)
- `error ParentNotMigrated(bytes)` (`0x83d435f1`)
- `error NotApprovedOperator(address,address)` (`0x1cf8fdfe`)

Also keep a separate ABI fragment for the `LibMigration` errors so `decodeMigrationError` can identify them when they bubble up from the v2 controllers wrapped inside `Error(string)`:

- `NameRequiresMigration` (`0x408fa1b8`)
- `NameNotLocked(uint256)` (`0x1bfe8f0a`)
- `NameIsLocked(uint256)` (`0xe7c290e2`)
- `NameDataMismatch(uint256)` (`0xedec3569`)
- `FrozenTokenApproval(uint256)` (`0xa4f07713`)
- `InvalidData` (`0x5cb045db`)

**`apps/manager/src/features/migration/service/encodeMigration.ts`** — keep `MigrationData` type and `MIGRATION_DATA_COMPONENTS`. Drop `encodeMigrationData` (no longer used; the helper consumes the struct directly via ABI).

**`apps/manager/src/features/migration/service/buildMigrateCall.ts`** (new — replaces `buildMigrationCalls.ts`)

Single export: `buildMigrateCall(params): ZeroDevCall` returning the call to `MigrationHelper.migrate`. Internally:

1. Bucket `classified` by `tokenType`.
2. Map each name through `createMigrationData` with `owner = migrationOwner`, `subregistry = zeroAddress`, `resolver = resolverFor(name, defaultResolver, ownedPermRes)`.
3. Group locked children by `parentName`, DNS-encode each parent via `dnsEncodeName(parentName)`.
4. `encodeFunctionData({ abi: MIGRATION_HELPER_ABI, functionName: 'migrate', args: [...] })`.

`resolverFor` stays unchanged.

**Util: DNS encoding**

Copy `dnsEncodeName` from `apps/portal/src/utils/token/dnsEncodeName.ts` into the migration feature (or share via a packages-level util — keep it simple, copy is fine in-app). Used for `LockedChildren.parentName`.

**`apps/manager/src/features/migration/service/buildMigrationPlan.ts`** — simplify:

- `MigrationPlan` shape becomes:

```ts
type MigrationPlan = {
  migrationOwner: Address
  domains: readonly V1Domain[]
  classified: readonly ClassifiedName[]
  ineligible: readonly IneligibleName[]
  groups: GroupedNames
  preflight: MigrationPreflight
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
  notReservedSet: ReadonlySet<string>
  preMigrateCalls: readonly ZeroDevCall[]
  migrateCall: ZeroDevCall
  roleGrantCalls: readonly ZeroDevCall[]
  profileReplayCalls: readonly ZeroDevCall[]
  stepDescriptors: readonly MigrationStepDescriptor[]
}
```

- `buildMigrationPlan` no longer calls `validateSubnameParents` or `resolveParentRegistries`. It builds the four call lists directly:
  - `preMigrateCalls`: one per 2LD in `notReservedSet`.
  - `migrateCall`: one call via `buildMigrateCall(...)`.
  - `roleGrantCalls`: one per name with `managerAddress`.
  - `profileReplayCalls`: one per `to-owned-permres` name with non-empty `Profile`.
- Drop `MigrationPlanError`'s `Subnames` step path, `MAX_BATCH_RAW_BYTES`, `NameBundle`, `packNamesByPayload`, `resolveDeferredBatches`.
- `adjustPlanForRetry` rebuilds the four call lists from the remaining classified names (skipping already-migrated names) — same idea, simpler implementation.

**`apps/manager/src/features/migration/service/migrationService.ts`** — replace `executeMigration`:

```ts
// submitCall: thin wrapper around the existing transactionManager EOA path.
// Same body as today's eoa branch in submitBatchedUserOp, minus the loop —
// one call in, one tx hash out, with tracker.emit/next around it.
const submitCall = async (
  ctx: MigrationCtx,
  call: ZeroDevCall,
  description: string,
): Promise<Hex> => {
  const txId = transactionManager.startTransaction(
    { type: 'custom', request: buildEOARequest(ctx, call) },
    ctx.signer,
    { description, publicClient: ctx.publicClient },
  )
  ctx.tracker.emit(description, PENDING_TX_HASH)
  const result = await waitForTransaction(txId)
  return result.hash as Hex
}

const executeMigration = async (params: ...): Promise<MigrationResult> => {
  // 1. Approvals (helper as target)
  await ensureApprovals(ctx, groups)
  // 2. Resolver (unchanged)
  await ensureResolver(ctx, namesToOwnedPermRes, preflight)
  // 3. preMigrate per 2LD
  for (const call of plan.preMigrateCalls) await submitCall(ctx, call, 'Reserving v2 name')
  // 4. Single migrate() call
  const migrateHash = await submitCall(ctx, plan.migrateCall, 'Migrating names')
  // 5. grantRoles per manager
  for (const call of plan.roleGrantCalls) await submitCall(ctx, call, 'Granting manager role')
  // 6. profileReplay per name
  for (const call of plan.profileReplayCalls) await submitCall(ctx, call, 'Replaying profile records')
}
```

- `ensureApprovals` swaps `accountAddress` for `V2_CONTRACTS.MigrationHelper`.
- Delete `submitBatchedUserOp` (SCA-only batching logic + EOA loop), `buildSCARequest`, and `submitBatches` (which packed `NameBundle[][]` into UserOps). Replace with `submitCall` above.
- Keep `MigrationError`, `MigrationUserRejectedError`, `isUserRejection`, `wrapBatchError`, `buildEOARequest`, the tracker, and `OnBatchComplete` (renamed to `OnCallComplete` if helpful) — the call-completion callback now fires once per submitted tx instead of once per batch.

**`apps/manager/src/features/migration/service/checkHelperApprovals.ts`** (renamed from `checkSCAApprovals.ts`)

```ts
type ApprovalNeeds = { hasUnwrapped: boolean; hasWrapped: boolean }

type HelperApprovalStatus = {
  baseRegistrarApproved: boolean
  nameWrapperApproved: boolean
}

const checkHelperApprovals = async (params: {
  eoa: Address
  helperAddress: Address
  needs: ApprovalNeeds
  wagmiConfig: WagmiConfig
}): Promise<HelperApprovalStatus>
```

Same shape as the old `checkSCAApprovals`, but `scaAddress` → `helperAddress`. Update all imports.

**`apps/manager/src/features/migration/service/preflightChecks.ts`**

Delete: `walkDeepRegistry`, `resolveParentRegistriesOnce`, `resolveParentRegistries`, `PARENT_REGISTRY_RETRIES`, `PARENT_REGISTRY_RETRY_DELAYS_MS`, `getParentLabels`. Keep the rest.

**`apps/manager/src/features/migration/service/migrationPlan.helpers.ts`**

Delete: `DEFERRED_PARENT_PLACEHOLDER`, `groupDeferredChildrenByParent`, `buildDeferredPlaceholderRegistries`, `ChildPartition`, `partitionChildrenByInPlan`, `findNestedDeferredParents`, `findUnresolvedParents`, `computePhase1Names`, `collectDeferredParentNames`, `packPlanBatches`, `calcBundleBytes`. Keep `formatNamesPreview` (still used elsewhere).

**`apps/manager/src/features/migration/service/decodeMigrationError.ts`**

Extend `MigrationError`:

```ts
| { type: 'parent-not-migrated'; parentName: string }
| { type: 'not-approved-operator'; nft: Address; owner: Address }
| { type: 'wrapped-owner-mismatch'; tokenId: bigint }
| { type: 'name-not-locked'; tokenId: bigint }
| { type: 'name-is-locked'; tokenId: bigint }
| { type: 'name-data-mismatch'; tokenId: bigint }
| { type: 'frozen-token-approval'; tokenId: bigint }
| { type: 'invalid-data' }
| { type: 'name-requires-migration' }
```

`decodeMigrationError` walks the cause chain for revert data, then:

1. Tries `viem.decodeErrorResult` against the helper ABI errors. If a known selector matches, return the typed variant.
2. If the revert is `Error(string)`, parse the payload as a `WrappedErrorLib` package (selector + abi-encoded args). Try decoding against the `LibMigration` error ABI.
3. Fall through to `generic`.

**`apps/manager/src/features/migration/service/buildStepDescriptors.ts`**

```ts
type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'ensure-resolver' }
  | { type: 'pre-migrate'; label: string }
  | { type: 'migrate-all'; count: number }
  | { type: 'grant-role'; label: string }
  | { type: 'profile-replay'; label: string }
```

`buildStepDescriptors` reads from the plan + preflight to emit one descriptor per planned tx. UI's progress banner maps these to display strings.

**`apps/manager/src/features/migration/state/migrationUi.machine.ts`**

- `appendBatchComplete` becomes `appendCallComplete` (one event per submitted tx — approval, pre-migrate, migrate, grant-role, profile-replay), but the existing `migration.batchComplete` event name + handler logic can stay. The change is purely internal: each tx emits one event; the consumer marks the relevant names as migrated when the `migrate()` tx confirms.
- `resetForRetry` calls the new `adjustPlanForRetry` on the simplified plan shape.

### 5.3 Files to delete

- `apps/manager/src/features/migration/service/buildMigrationCalls.ts` → replaced by `buildMigrateCall.ts`.
- `apps/manager/src/features/migration/service/buildMigrationCalls.test.ts` → replaced by `buildMigrateCall.test.ts`.

### 5.4 Unchanged

- `classifyNames.ts`, `groupClassifiedNames`, `FUSES`, `is2LD`.
- `buildPreMigrateCalls.ts`, `buildRoleGrantCalls.ts`, `buildProfileReplayCalls.ts`.
- `ensureOwnedPermRes.ts`, `fetchV1Profiles.ts`, `getRegisteredV2Names.ts`, `getMigratedNamesCount.ts`.
- `useEligibleV1Names`, `useMigrationEligibility`, `useMigrationPreflight`, `useV1Names`, `useMigratedNamesCount`, `useOpenModalOnFirstVisit`, `useNameSelection`, `useElementWidth`.
- All UI components (`MigrationModal`, `SelectNamesStep`, `GameStep`, `UpgradeBanner`, `MigrationProgressBanner`, `SuccessModal`, etc.). Internal types update where they reference batches.

## 6. Detailed type-level shapes

### 6.1 `buildMigrateCall.ts`

```ts
type BuildMigrateCallParams = {
  classified: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
}

export const buildMigrateCall = ({
  classified,
  migrationOwner,
  defaultResolver,
  ownedPermRes,
}: BuildMigrateCallParams): ZeroDevCall => {
  const buckets = bucketByTokenType(classified)
  const unwrapped = buckets.unwrapped.map((n) => toData(n, migrationOwner, defaultResolver, ownedPermRes))
  const unlockedGroups =
    buckets.unlocked.length > 0 ? [buckets.unlocked.map((n) => toData(...))] : []
  const lockedGroups =
    buckets.locked2ld.length > 0 ? [buckets.locked2ld.map((n) => toData(...))] : []
  const lockedChildrenGroups = groupChildrenByParent(buckets.children).map(
    ([parentName, children]) => ({
      parentName: dnsEncodeName(parentName),
      groups: [children.map((n) => toData(...))],
    })
  )

  return {
    to: V2_CONTRACTS.MigrationHelper,
    data: encodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      functionName: 'migrate',
      args: [unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups],
    }),
    value: 0n,
  }
}
```

`toData` is `createMigrationData({ label, owner, resolver })` with `subregistry: zeroAddress`. Locked-child bucket includes both `tokenType === 'locked-child'` and `'detached-child'`.

### 6.2 New `MigrationPlan` shape (full)

```ts
type MigrationPlan = {
  migrationOwner: Address
  domains: readonly V1Domain[]
  classified: readonly ClassifiedName[]
  ineligible: readonly IneligibleName[]
  groups: GroupedNames
  preflight: MigrationPreflight
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
  notReservedSet: ReadonlySet<string>
  preMigrateCalls: readonly ZeroDevCall[]
  migrateCall: ZeroDevCall
  roleGrantCalls: readonly ZeroDevCall[]
  profileReplayCalls: readonly ZeroDevCall[]
  stepDescriptors: readonly MigrationStepDescriptor[]
}
```

## 7. Approval semantics

`MigrationHelper` requires the v1 owner to have called `setApprovalForAll(MigrationHelper, true)` on the relevant v1 NFT contract. The helper's internal `_requireOperatorApproval` skips when `owner == sender`, but the v1 `safeTransferFrom` call **also** checks that `msg.sender` (the helper) is approved by `owner` — so even in EOA mode, the user must explicitly approve the helper.

Two reads in preflight:
- `BaseRegistrar.isApprovedForAll(eoa, MigrationHelper)` — needed if any unwrapped name.
- `NameWrapper.isApprovedForAll(eoa, MigrationHelper)` — needed if any wrapped name (unlocked, locked, or any child).

Each missing approval is its own EOA tx.

## 8. Error handling

### 8.1 Direct helper errors (typed reverts)

| Selector | Solidity error | UI mapping |
|---|---|---|
| `0xd04374c0` | `WrappedOwnerMismatch(uint256 tokenId)` | "Multiple owners detected in one batch — please retry." (Should not happen given single-owner invariant; treat as bug.) |
| `0x83d435f1` | `ParentNotMigrated(bytes name)` | "Parent name *X* must be migrated first." |
| `0x1cf8fdfe` | `NotApprovedOperator(address nft, address owner)` | "Approval missing — please retry the approval step." (Indicates preflight skipped or approval reverted.) |

### 8.2 Controller errors (wrapped in `Error(string)`)

NameWrapper squelches typed errors inside transfer hooks and rethrows as `Error(string)` with a `WrappedErrorLib`-encoded payload (selector + abi-encoded args). `decodeMigrationError` unwraps these and maps to the variants in §5.2.

### 8.3 Cause-chain handling

`decodeMigrationError` still walks the cause chain looking for `data` (viem's revert errors expose `data` on `ContractFunctionRevertedError`). It first tries the typed helper ABI; if no match, attempts the `Error(string)` unwrap path; if still no match, falls back to `generic`.

## 9. Migration-time invariants

- All names in a migration share the same `tokenHolder` (the `migrationOwner` EOA). The classifier guarantees this.
- Each inner `Data[]` group within `unlockedGroups`, `lockedGroups`, and `LockedChildren.groups` is therefore a single group containing every name of that bucket.
- For locked children, parents that exist in v2 will be resolved by the helper. Parents in the same `migrate()` call will be created by `LOCKED_CONTROLLER.onERC1155Received` before the children bucket runs.

## 10. Open assumption to verify on Tenderly

The deferred-children pattern is being removed on the assumption that `LockedMigrationController.onERC1155Received` deploys the v2 child registry synchronously during the parent transfer, so `LibRegistry.findExactRegistry(...)` resolves it within the same `migrate()` call. **The first Tenderly integration test for parent+child in one call validates this assumption.** If the assumption is wrong, fall back to a two-call sequence: `migrate(parent only)` → `migrate(children only)`, with no intermediate client-side polling needed because the parent tx is already mined by then. The plan-builder shape supports this fallback trivially (split `classified` into two passes).

## 11. Testing

### 11.1 Unit (vitest)

- `buildMigrateCall.test.ts` — bucket layout, owner field, resolver routing, locked-children grouping + DNS encoding, mixed inputs, empty inputs.
- `checkHelperApprovals.test.ts` — branch on `hasUnwrapped` / `hasWrapped`, mock `readContract`.
- `decodeMigrationError.test.ts` — each helper selector → variant; each wrapped `LibMigration` error → variant; `user-rejected` and `preflight-timeout` still classify correctly.
- `buildMigrationPlan.test.ts` — new shape snapshot; `adjustPlanForRetry` removes already-migrated names from each call list.
- `migrationUi.machine.test.ts` — adapt event names if the rename happens; otherwise drive through the same states.
- `buildStepDescriptors.test.ts` — descriptor list matches the planned tx sequence for representative inputs.

### 11.2 Manual integration on Tenderly virtual Sepolia

With `VITE_FF_USE_EOA=true` and the Tenderly fork RPC active:

1. Unwrapped only → approval + migrate.
2. Locked 2LD only → approval + migrate.
3. Mixed buckets → two approvals + one migrate.
4. **Parent + child in one migration** (validates §10).
5. Name with manager → migrate + grantRoles.
6. Name with to-owned-permres + profile → ensureResolver + migrate + profile-replay.
7. Already-migrated name → preflight excludes it.
8. Forced revert (revoke approval mid-flow) → UI surfaces correct error variant.

## 12. Rollout

- This is a refactor of an in-development feature; no flag, no rollback plan.
- The `tenderly-migration-support-v3` branch carries the change; PR title `feat: refactor migration to use MigrationHelper` (conforming to project conventions in `CLAUDE.md`).
- The RPC swap in `packages/indexer/chain.ts` affects all apps. Verify portal and explorer still load against the Tenderly fork before merge.
