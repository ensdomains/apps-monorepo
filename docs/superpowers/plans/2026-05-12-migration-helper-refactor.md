# MigrationHelper Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the ENS v1→v2 migration in `apps/manager` to drive every transfer through the new `MigrationHelper` contract (`0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA`), drop the smart-account / deferred-children / parent-registry-walker machinery, and route the project default Sepolia RPC through the Tenderly virtual fork.

**Architecture:** Each migration becomes (a) at most two `setApprovalForAll(MigrationHelper, true)` v1 approvals from the EOA, (b) optional `ensureOwnedPermRes`, (c) per-2LD `preMigrate` calls, (d) **one** `MigrationHelper.migrate(...)` transaction covering every name (including locked 3LD+ subnames whose parents ride along in the same call), (e) per-name `grantRoles`, (f) per-name profile-replay. EOA-only. SCA/Rhinestone/ZeroDev/HCA branches are deleted from the migration code path.

**Tech Stack:** TypeScript, viem, wagmi, XState, vitest. Source spec: `docs/superpowers/specs/2026-05-12-migration-helper-refactor-design.md`.

---

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `packages/indexer/chain.ts` | modify | Swap `DEFAULT_SEPOLIA_RPC_URL` to the Tenderly virtual fork. |
| `apps/manager/src/features/migration/contracts/addresses.ts` | modify | Add `MigrationHelper` to `V2_CONTRACTS`. |
| `apps/manager/src/features/migration/contracts/abis.ts` | modify | Add `MIGRATION_HELPER_ABI` (function + helper errors) and `LIB_MIGRATION_ERRORS_ABI` (wrapped controller errors). |
| `apps/manager/src/features/migration/utils/dnsEncodeName.ts` | create | DNS-encode a full name to `Hex` for `LockedChildren.parentName`. |
| `apps/manager/src/features/migration/utils/dnsEncodeName.test.ts` | create | Tests for DNS encoding. |
| `apps/manager/src/features/migration/service/buildMigrateCall.ts` | create | Build the single `MigrationHelper.migrate(...)` call from `ClassifiedName[]`. |
| `apps/manager/src/features/migration/service/buildMigrateCall.test.ts` | create | Bucket layout, owner field, resolver routing, child grouping + DNS encoding. |
| `apps/manager/src/features/migration/service/encodeMigration.ts` | modify | Keep `MigrationData` + `createMigrationData`; delete `encodeMigrationData`. |
| `apps/manager/src/features/migration/service/buildMigrationCalls.ts` | delete | Replaced by `buildMigrateCall.ts`. |
| `apps/manager/src/features/migration/service/buildMigrationCalls.test.ts` | delete | Replaced by `buildMigrateCall.test.ts`. |
| `apps/manager/src/features/migration/service/checkSCAApprovals.ts` | rename → `checkHelperApprovals.ts` | Read `isApprovedForAll(eoa, MigrationHelper)` per V1 contract. |
| `apps/manager/src/features/migration/service/buildStepDescriptors.ts` | modify | New descriptor union (per-tx). |
| `apps/manager/src/features/migration/components/GameStep.helpers.ts` | modify | `StepDescription` + `describeNextStep` adapt to new descriptors. |
| `apps/manager/src/features/migration/components/GameStep.helpers.test.ts` | modify | Test cases align with new descriptor union. |
| `apps/manager/src/features/migration/components/GameStep.tsx` | modify | `descriptionText` match adapts to new `StepDescription`. |
| `apps/manager/src/features/migration/service/decodeMigrationError.ts` | modify | Extend `MigrationError` with helper + wrapped controller variants; decode revert data. |
| `apps/manager/src/features/migration/service/decodeMigrationError.test.ts` | modify | Add tests for each new variant. |
| `apps/manager/src/features/migration/service/preflightChecks.ts` | modify | Delete parent-registry walker; keep eligibility checks. |
| `apps/manager/src/features/migration/service/migrationPlan.helpers.ts` | modify | Delete deferred-children + byte-packing helpers; keep `formatNamesPreview`. |
| `apps/manager/src/features/migration/service/buildMigrationPlan.ts` | modify | New `MigrationPlan` shape with four call lists; no batches/deferred fields. |
| `apps/manager/src/features/migration/service/migrationService.ts` | modify | Flat sequential `executeMigration`; new `submitCall` helper; helper-as-approval-target. |
| `apps/manager/src/features/migration/state/migrationUi.machine.ts` | modify | Adapt to new plan shape; one tx ↔ one completion event. |
| `apps/manager/src/features/migration/state/migrationUi.machine.test.ts` | modify | Update fixtures + events to the new plan shape. |

---

## Task 1: Add `MigrationHelper` to address map

**Files:**
- Modify: `apps/manager/src/features/migration/contracts/addresses.ts`

- [ ] **Step 1: Add the constant**

Edit `addresses.ts`. In the `V2_CONTRACTS` `as const` object, add a new property between `LockedMigrationController` and `ENSV2Resolver`:

```ts
MigrationHelper: '0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA',
```

Final shape of `V2_CONTRACTS` after this edit:

```ts
export const V2_CONTRACTS = {
  ETHRegistry: ensjsSepolia.ensRegistry.address,
  VerifiableFactory: ensjsSepolia.ensVerifiableFactory.address,
  PermissionedResolverImpl: ensjsSepolia.ensPermissionedResolverImpl.address,
  UnlockedMigrationController: '0x76ae358d9ad91651b78463ae609dadc9e7ce4402',
  LockedMigrationController: '0x22cd7e6a89f5bf4510ef22b3dd4ef190d22f95c3',
  MigrationHelper: '0x09B9E95D8633EDA8d9E530f258c634A2953Cd3FA',
  ENSV2Resolver: '0x18cb116a1c88531a4bb2996e4fef136a31e11a80',
  PreMigrationController: '0xee63749b063c08dedee9478504177c27bf9193d7',
} as const
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: PASS (additive change).

- [ ] **Step 3: Commit**

```bash
git add apps/manager/src/features/migration/contracts/addresses.ts
git commit -m "feat: add MigrationHelper address to V2_CONTRACTS"
```

---

## Task 2: Add MigrationHelper ABI fragments

**Files:**
- Modify: `apps/manager/src/features/migration/contracts/abis.ts`

- [ ] **Step 1: Append helper ABIs**

Add the following to the bottom of `abis.ts`:

```ts
// MigrationHelper — single entrypoint plus typed errors raised directly by the helper.
export const MIGRATION_HELPER_ABI = parseAbi([
  'struct Data { string label; address owner; address subregistry; address resolver; }',
  'struct LockedChildren { bytes parentName; Data[][] groups; }',
  'function migrate(Data[] unwrapped, Data[][] unlockedGroups, Data[][] lockedGroups, LockedChildren[] lockedChildrenGroups)',
  'error WrappedOwnerMismatch(uint256 tokenId)',
  'error ParentNotMigrated(bytes name)',
  'error NotApprovedOperator(address nft, address owner)',
]) as const

// LibMigration errors — these come back wrapped inside Error(string) due to
// NameWrapper's transfer-error squelching. decodeMigrationError unwraps and
// matches against this ABI.
export const LIB_MIGRATION_ERRORS_ABI = parseAbi([
  'error NameRequiresMigration()',
  'error NameNotLocked(uint256 tokenId)',
  'error NameIsLocked(uint256 tokenId)',
  'error NameDataMismatch(uint256 tokenId)',
  'error FrozenTokenApproval(uint256 tokenId)',
  'error InvalidData()',
]) as const
```

`parseAbi` is already imported at the top of the file.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/manager/src/features/migration/contracts/abis.ts
git commit -m "feat: add MigrationHelper and LibMigration error ABIs"
```

---

## Task 3: Add `dnsEncodeName` utility to migration feature

**Files:**
- Create: `apps/manager/src/features/migration/utils/dnsEncodeName.ts`
- Create: `apps/manager/src/features/migration/utils/dnsEncodeName.test.ts`

- [ ] **Step 1: Create the utility**

```ts
// apps/manager/src/features/migration/utils/dnsEncodeName.ts
import { bytesToHex, type Hex } from 'viem'
import { packetToBytes } from 'viem/ens'

export const dnsEncodeName = (name: string): Hex =>
  bytesToHex(packetToBytes(name))
```

- [ ] **Step 2: Create failing tests**

```ts
// apps/manager/src/features/migration/utils/dnsEncodeName.test.ts
import { describe, expect, it } from 'vitest'
import { dnsEncodeName } from './dnsEncodeName'

describe('dnsEncodeName', () => {
  it('encodes a 2LD as DNS-format hex (length-prefixed labels + null terminator)', () => {
    // "vitalik.eth" → 0x07 'vitalik' 0x03 'eth' 0x00
    expect(dnsEncodeName('vitalik.eth')).toBe(
      '0x0776697461696c6b03657468000'.replace(/(.*)0$/, '$1'), // placeholder; computed below
    )
  })

  it('encodes empty string as 0x00', () => {
    expect(dnsEncodeName('')).toBe('0x00')
  })

  it('encodes a 3LD with each label length-prefixed', () => {
    // "sub.vault.eth" → 0x03 'sub' 0x05 'vault' 0x03 'eth' 0x00
    expect(dnsEncodeName('sub.vault.eth')).toMatch(/^0x03737562/)
  })

  it('round-trips: hex starts with 0x and is even length', () => {
    const hex = dnsEncodeName('foo.bar.eth')
    expect(hex.startsWith('0x')).toBe(true)
    expect(hex.length % 2).toBe(0)
  })
})
```

- [ ] **Step 3: Replace the placeholder assertion with the real expected value**

Run a one-liner to get the right hex from viem and copy it into the test (do this once during plan execution; the placeholder in Step 2 won't pass):

```bash
node -e "import('viem').then(({bytesToHex}) => import('viem/ens').then(({packetToBytes}) => console.log(bytesToHex(packetToBytes('vitalik.eth')))))"
```

Copy the printed hex into the first test's assertion. Final expected value should be `'0x0776697461696c6b03657468' + '00'` — confirm with the script. Remove the `.replace(...)` workaround.

- [ ] **Step 4: Run tests**

Run: `cd apps/manager && pnpm vitest run src/features/migration/utils/dnsEncodeName.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/manager/src/features/migration/utils/dnsEncodeName.ts apps/manager/src/features/migration/utils/dnsEncodeName.test.ts
git commit -m "feat: add dnsEncodeName util for MigrationHelper parent encoding"
```

---

## Task 4: TDD `buildMigrateCall` — bucket layout

**Files:**
- Create: `apps/manager/src/features/migration/service/buildMigrateCall.ts`
- Create: `apps/manager/src/features/migration/service/buildMigrateCall.test.ts`

- [ ] **Step 1: Write the failing test file** (skeleton — assertions filled in by step)

```ts
// apps/manager/src/features/migration/service/buildMigrateCall.test.ts
import { decodeFunctionData, type Address, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, OWNER } from './_fixtures'
import { buildMigrateCall } from './buildMigrateCall'

const DEFAULT_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'

const decodeMigrate = (data: `0x${string}`) =>
  decodeFunctionData({ abi: MIGRATION_HELPER_ABI, data })

describe('buildMigrateCall', () => {
  it('targets MigrationHelper and zero value', () => {
    const call = buildMigrateCall({
      classified: [],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
    })
    expect(call.to).toBe(V2_CONTRACTS.MigrationHelper)
    expect(call.value).toBe(0n)
    const decoded = decodeMigrate(call.data)
    expect(decoded.functionName).toBe('migrate')
    expect(decoded.args).toEqual([[], [], [], []])
  })

  it('places unwrapped names into the first argument', () => {
    const name = makeClassified({ tokenType: 'unwrapped', label: 'alice' })
    const call = buildMigrateCall({
      classified: [name],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: PERM_RES,
    })
    const [unwrapped, unlockedGroups, lockedGroups, lockedChildren] =
      decodeMigrate(call.data).args as readonly [unknown[], unknown[], unknown[], unknown[]]
    expect(unwrapped).toHaveLength(1)
    expect(unlockedGroups).toEqual([])
    expect(lockedGroups).toEqual([])
    expect(lockedChildren).toEqual([])
    expect((unwrapped[0] as { label: string }).label).toBe('alice')
    expect((unwrapped[0] as { owner: Address }).owner).toBe(OWNER)
    expect((unwrapped[0] as { subregistry: Address }).subregistry).toBe(zeroAddress)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service/buildMigrateCall.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement minimal `buildMigrateCall`**

```ts
// apps/manager/src/features/migration/service/buildMigrateCall.ts
import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { type Address, encodeFunctionData, type Hex, zeroAddress } from 'viem'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { dnsEncodeName } from '../utils/dnsEncodeName'
import type { ClassifiedName } from './classifyNames'
import { resolverFor } from './buildMigrationCalls'
import { createMigrationData, type MigrationData } from './encodeMigration'

type BuildMigrateCallParams = {
  readonly classified: readonly ClassifiedName[]
  readonly migrationOwner: Address
  readonly defaultResolver: Address
  readonly ownedPermRes: Address | null
}

const toData = (
  name: ClassifiedName,
  migrationOwner: Address,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): MigrationData =>
  createMigrationData({
    label: name.label,
    owner: migrationOwner,
    resolver: resolverFor(name, defaultResolver, ownedPermRes),
    subregistry: zeroAddress,
  })

type LockedChildren = {
  readonly parentName: Hex
  readonly groups: readonly (readonly MigrationData[])[]
}

export const buildMigrateCall = ({
  classified,
  migrationOwner,
  defaultResolver,
  ownedPermRes,
}: BuildMigrateCallParams): ZeroDevCall => {
  const unwrapped: MigrationData[] = []
  const unlocked: MigrationData[] = []
  const locked2ld: MigrationData[] = []
  const childrenByParent = new Map<string, MigrationData[]>()

  for (const name of classified) {
    const data = toData(name, migrationOwner, defaultResolver, ownedPermRes)
    switch (name.tokenType) {
      case 'unwrapped':
        unwrapped.push(data)
        break
      case 'unlocked':
        unlocked.push(data)
        break
      case 'locked-2ld':
        locked2ld.push(data)
        break
      case 'locked-child':
      case 'detached-child': {
        const parent = name.parentName
        if (!parent) {
          throw new Error(`Locked child "${name.domain.name}" has no parent name`)
        }
        const list = childrenByParent.get(parent) ?? []
        list.push(data)
        childrenByParent.set(parent, list)
        break
      }
    }
  }

  const lockedChildrenGroups: LockedChildren[] = [...childrenByParent.entries()].map(
    ([parentName, children]) => ({
      parentName: dnsEncodeName(parentName),
      groups: [children],
    }),
  )

  return {
    to: V2_CONTRACTS.MigrationHelper,
    data: encodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      functionName: 'migrate',
      args: [
        unwrapped,
        unlocked.length > 0 ? [unlocked] : [],
        locked2ld.length > 0 ? [locked2ld] : [],
        lockedChildrenGroups,
      ],
    }),
    value: 0n,
  }
}
```

Note: this file imports `resolverFor` from the legacy `buildMigrationCalls.ts`. That file gets deleted in Task 12; before then, this import is the bridge. In Task 12, `resolverFor` moves into `encodeMigration.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service/buildMigrateCall.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the remaining tests**

Append to `buildMigrateCall.test.ts`:

```ts
describe('buildMigrateCall — wrapped buckets', () => {
  it('packs all unlocked names into a single inner group', () => {
    const names = [
      makeClassified({ tokenType: 'unlocked', label: 'a', id: '0xa' }),
      makeClassified({ tokenType: 'unlocked', label: 'b', id: '0xb' }),
    ]
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: names,
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const [, unlockedGroups] = decoded.args as readonly [unknown[], readonly unknown[][], unknown[], unknown[]]
    expect(unlockedGroups).toHaveLength(1)
    expect(unlockedGroups[0]).toHaveLength(2)
  })

  it('packs all locked-2LDs into a single inner group', () => {
    const names = [
      makeClassified({ tokenType: 'locked-2ld', label: 'a' }),
      makeClassified({ tokenType: 'locked-2ld', label: 'b' }),
    ]
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: names,
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const [, , lockedGroups] = decoded.args as readonly [unknown[], unknown[], readonly unknown[][], unknown[]]
    expect(lockedGroups).toHaveLength(1)
    expect(lockedGroups[0]).toHaveLength(2)
  })

  it('omits empty groups (no inner []s for empty buckets)', () => {
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: [makeClassified({ tokenType: 'unwrapped' })],
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const [, unlockedGroups, lockedGroups] = decoded.args as readonly [unknown[], unknown[], unknown[], unknown[]]
    expect(unlockedGroups).toEqual([])
    expect(lockedGroups).toEqual([])
  })
})

describe('buildMigrateCall — locked children', () => {
  it('groups children under each unique parentName', () => {
    const names = [
      makeClassified({
        tokenType: 'locked-child',
        label: 'a',
        parentName: 'vault.eth',
        name: 'a.vault.eth',
      }),
      makeClassified({
        tokenType: 'locked-child',
        label: 'b',
        parentName: 'vault.eth',
        name: 'b.vault.eth',
      }),
      makeClassified({
        tokenType: 'locked-child',
        label: 'c',
        parentName: 'other.eth',
        name: 'c.other.eth',
      }),
    ]
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: names,
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const lockedChildrenGroups = (decoded.args as readonly [unknown, unknown, unknown, readonly { parentName: `0x${string}`; groups: readonly (readonly unknown[])[] }[]])[3]
    expect(lockedChildrenGroups).toHaveLength(2)
    const vault = lockedChildrenGroups.find((g) =>
      g.parentName.startsWith('0x0576617', // length-5 'vault'
      ),
    )
    expect(vault?.groups[0]).toHaveLength(2)
    const other = lockedChildrenGroups.find((g) =>
      g.parentName.startsWith('0x056f7468' // 'other'
      ),
    )
    expect(other?.groups[0]).toHaveLength(1)
  })

  it('treats detached-child like locked-child for bucketing', () => {
    const names = [
      makeClassified({
        tokenType: 'detached-child',
        label: 'd',
        parentName: 'parent.eth',
        name: 'd.parent.eth',
      }),
    ]
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: names,
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const lockedChildrenGroups = (decoded.args as readonly unknown[])[3] as readonly unknown[]
    expect(lockedChildrenGroups).toHaveLength(1)
  })

  it('throws when a locked-child has no parentName', () => {
    const names = [
      makeClassified({
        tokenType: 'locked-child',
        label: 'x',
        parentName: null,
      }),
    ]
    expect(() =>
      buildMigrateCall({
        classified: names,
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }),
    ).toThrow(/has no parent name/)
  })
})

describe('buildMigrateCall — resolver routing', () => {
  it('honors keep-v1 strategy', () => {
    const v1Resolver: Address = '0x000000000000000000000000000000000000d003'
    const name = makeClassified({
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: v1Resolver,
    })
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: [name],
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: null,
      }).data,
    )
    const unwrapped = (decoded.args as readonly { 0: readonly { resolver: Address }[] }[0])[0]
    expect((decoded.args as readonly readonly { resolver: Address }[][])[0][0].resolver).toBe(v1Resolver)
  })

  it('honors to-owned-permres strategy', () => {
    const name = makeClassified({ resolverStrategy: 'to-owned-permres' })
    const decoded = decodeMigrate(
      buildMigrateCall({
        classified: [name],
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: PERM_RES,
      }).data,
    )
    const args = decoded.args as readonly readonly { resolver: Address }[][]
    expect(args[0][0].resolver).toBe(PERM_RES)
  })
})
```

- [ ] **Step 6: Run all `buildMigrateCall` tests**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service/buildMigrateCall.test.ts`
Expected: PASS for every test. If any test fails because of typed-tuple destructuring quirks with viem's decoded args (the cast spelunking is awkward), simplify the destructure but keep the assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/manager/src/features/migration/service/buildMigrateCall.ts apps/manager/src/features/migration/service/buildMigrateCall.test.ts
git commit -m "feat: add buildMigrateCall for MigrationHelper.migrate"
```

---

## Task 5: Point default Sepolia RPC at Tenderly virtual fork

**Files:**
- Modify: `packages/indexer/chain.ts:8-9`

- [ ] **Step 1: Swap the default URL**

In `packages/indexer/chain.ts`, replace the `DEFAULT_SEPOLIA_RPC_URL` value:

```ts
const DEFAULT_SEPOLIA_RPC_URL =
  'https://virtual.sepolia.us-east.rpc.tenderly.co/5861d235-a772-47a3-8772-4f6a3f2ea4b5'
```

`VITE_SEPOLIA_RPC_URL` env override still wins via `resolveRpcUrl()`.

- [ ] **Step 2: Run typecheck from the repo root**

Run: `cd apps/manager && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/indexer/chain.ts
git commit -m "chore: default Sepolia RPC to Tenderly virtual fork"
```

---

## Task 6: Rename `checkSCAApprovals` → `checkHelperApprovals` and switch target

**Files:**
- Rename: `apps/manager/src/features/migration/service/checkSCAApprovals.ts` → `apps/manager/src/features/migration/service/checkHelperApprovals.ts`
- Modify: re-export sites — none beyond `migrationService.ts` (verify with grep).

- [ ] **Step 1: Confirm import sites**

Run: `cd apps/manager && grep -rn 'checkSCAApprovals\|approvalNeedsFor' src --include='*.ts' --include='*.tsx'`
Expected output should reference only `migrationService.ts` plus the original file. If anything else imports it, include those files in Step 3 below.

- [ ] **Step 2: Replace file contents**

Move the file and overwrite with new content:

```bash
git mv apps/manager/src/features/migration/service/checkSCAApprovals.ts apps/manager/src/features/migration/service/checkHelperApprovals.ts
```

Replace contents of `checkHelperApprovals.ts` with:

```ts
import { readContract, type Config as WagmiConfig } from '@wagmi/core'
import { type Address, erc721Abi } from 'viem'
import { NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS } from '../contracts/addresses'
import type { GroupedNames } from './classifyNames'

type ApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly hasWrapped: boolean
}

export const approvalNeedsFor = (groups: GroupedNames): ApprovalNeeds => ({
  hasUnwrapped: groups.unwrapped.length > 0,
  hasWrapped:
    groups.unlocked.length > 0 ||
    groups.locked2ld.length > 0 ||
    groups.childNames.size > 0,
})

type HelperApprovalStatus = {
  readonly baseRegistrarApproved: boolean
  readonly nameWrapperApproved: boolean
}

export const checkHelperApprovals = async (params: {
  eoa: Address
  helperAddress: Address
  needs: ApprovalNeeds
  wagmiConfig: WagmiConfig
}): Promise<HelperApprovalStatus> => {
  const { eoa, helperAddress, needs, wagmiConfig } = params

  const [baseRegistrarApproved, nameWrapperApproved] = await Promise.all([
    needs.hasUnwrapped
      ? (readContract(wagmiConfig, {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: erc721Abi,
          functionName: 'isApprovedForAll',
          args: [eoa, helperAddress],
        }) as Promise<boolean>)
      : Promise.resolve(true),
    needs.hasWrapped
      ? (readContract(wagmiConfig, {
          address: V1_CONTRACTS.NameWrapper,
          abi: NAME_WRAPPER_ABI,
          functionName: 'isApprovedForAll',
          args: [eoa, helperAddress],
        }) as Promise<boolean>)
      : Promise.resolve(true),
  ])

  return { baseRegistrarApproved, nameWrapperApproved }
}
```

- [ ] **Step 3: Update `migrationService.ts` import (consumer)**

In `apps/manager/src/features/migration/service/migrationService.ts`, change:

```ts
import { approvalNeedsFor, checkSCAApprovals } from './checkSCAApprovals'
```

to:

```ts
import { approvalNeedsFor, checkHelperApprovals } from './checkHelperApprovals'
```

In `ensureApprovals`, replace the call:

```ts
const approvals = await checkHelperApprovals({
  eoa: ctx.migrationOwner,
  helperAddress: V2_CONTRACTS.MigrationHelper,
  needs,
  wagmiConfig: ctx.wagmiConfig,
})
```

And the two `writeContract` `args` lines, replace `ctx.accountAddress` with `V2_CONTRACTS.MigrationHelper`:

```ts
args: [V2_CONTRACTS.MigrationHelper, true],
```

(in both `setApprovalForAll` calls in `ensureApprovals`).

Also update the user-facing strings inside `ensureApprovals` to reflect the new target:

```ts
ctx.tracker.emit(
  'Approving the migration helper on BaseRegistrar',
  PENDING_TX_HASH,
)
// …
ctx.tracker.emit(
  'Approving the migration helper on NameWrapper',
  PENDING_TX_HASH,
)
// …
ctx.tracker.emit('Migration helper approved')
```

And the revert error strings analogously (`MigrationHelper setApprovalForAll reverted …`).

- [ ] **Step 4: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Run any existing tests on this file**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service`
Expected: PASS (no test file existed for `checkSCAApprovals` to begin with — verify with `find . -name 'checkSCAApprovals.test.ts'`). The new `checkHelperApprovals` doesn't get a test in this task; it's covered indirectly via `migrationUi.machine.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A apps/manager/src/features/migration
git commit -m "refactor: switch approval target from SCA to MigrationHelper"
```

---

## Task 7: New `MigrationStepDescriptor` union (per-tx)

**Files:**
- Modify: `apps/manager/src/features/migration/service/buildStepDescriptors.ts`
- Modify: `apps/manager/src/features/migration/components/GameStep.helpers.ts`
- Modify: `apps/manager/src/features/migration/components/GameStep.helpers.test.ts`
- Modify: `apps/manager/src/features/migration/components/GameStep.tsx`

This task touches the descriptor type and every exhaustive match against it together. The codebase only stays green if all four files move in one commit.

- [ ] **Step 1: Rewrite `buildStepDescriptors.ts`**

Replace the entire file with:

```ts
import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'

export type MigrationStepDescriptor =
  | { type: 'approve-base-registrar' }
  | { type: 'approve-name-wrapper' }
  | { type: 'ensure-resolver' }
  | { type: 'pre-migrate'; label: string }
  | { type: 'migrate-all'; count: number }
  | { type: 'grant-role'; label: string }
  | { type: 'profile-replay'; label: string }

export const needsApproval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length > 0 ||
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0 ||
  groups.childNames.size > 0

type BuildStepDescriptorsParams = {
  readonly classified: readonly ClassifiedName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly notReservedSet: ReadonlySet<string>
  readonly hasBaseRegistrarApproval: boolean
  readonly hasNameWrapperApproval: boolean
}

export const buildStepDescriptors = (
  params: BuildStepDescriptorsParams,
): MigrationStepDescriptor[] => {
  const {
    classified,
    groups,
    preflight,
    notReservedSet,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
  } = params
  const descriptors: MigrationStepDescriptor[] = []

  if (!preflight.skipApprovalPhase) {
    if (groups.unwrapped.length > 0 && !hasBaseRegistrarApproval) {
      descriptors.push({ type: 'approve-base-registrar' })
    }
    const hasWrapped =
      groups.unlocked.length > 0 ||
      groups.locked2ld.length > 0 ||
      groups.childNames.size > 0
    if (hasWrapped && !hasNameWrapperApproval) {
      descriptors.push({ type: 'approve-name-wrapper' })
    }
  }

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  for (const name of classified) {
    if (
      (name.tokenType === 'unwrapped' ||
        name.tokenType === 'unlocked' ||
        name.tokenType === 'locked-2ld') &&
      notReservedSet.has(name.domain.name)
    ) {
      descriptors.push({ type: 'pre-migrate', label: name.label })
    }
  }

  if (classified.length > 0) {
    descriptors.push({ type: 'migrate-all', count: classified.length })
  }

  for (const name of classified) {
    if (name.managerAddress) {
      descriptors.push({ type: 'grant-role', label: name.label })
    }
  }
  for (const name of classified) {
    if (name.resolverStrategy === 'to-owned-permres') {
      descriptors.push({ type: 'profile-replay', label: name.label })
    }
  }

  return descriptors
}
```

The new `buildStepDescriptors` reads its dependencies from `params` (passed in from the plan-builder, which in Task 9 fetches `notReservedSet` and the two approval flags). The previous `MAX_NAMES_PER_BATCH` and batch-sizing logic are gone.

- [ ] **Step 2: Update `GameStep.helpers.ts`**

Replace `StepDescription` and `describeNextStep`:

```ts
export type StepDescription =
  | { readonly kind: 'done' }
  | { readonly kind: 'progress'; readonly text: string }
  | { readonly kind: 'preparing' }
  | { readonly kind: 'approve-base-registrar' }
  | { readonly kind: 'approve-name-wrapper' }
  | { readonly kind: 'ensure-resolver' }
  | { readonly kind: 'pre-migrate'; readonly label: string }
  | { readonly kind: 'migrate-all'; readonly count: number }
  | { readonly kind: 'grant-role'; readonly label: string }
  | { readonly kind: 'profile-replay'; readonly label: string }

export const describeNextStep = (params: {
  readonly done: boolean
  readonly progressDescription?: string
  readonly descriptor: MigrationStepDescriptor | undefined
}): StepDescription =>
  match(params)
    .with({ done: true }, () => ({ kind: 'done' as const }))
    .with(
      { progressDescription: P.string },
      ({ progressDescription }) =>
        ({ kind: 'progress' as const, text: progressDescription }) as const,
    )
    .with({ descriptor: P.nullish }, () => ({ kind: 'preparing' as const }))
    .with({ descriptor: { type: 'approve-base-registrar' } }, () => ({
      kind: 'approve-base-registrar' as const,
    }))
    .with({ descriptor: { type: 'approve-name-wrapper' } }, () => ({
      kind: 'approve-name-wrapper' as const,
    }))
    .with({ descriptor: { type: 'ensure-resolver' } }, () => ({
      kind: 'ensure-resolver' as const,
    }))
    .with({ descriptor: { type: 'pre-migrate' } }, ({ descriptor }) => ({
      kind: 'pre-migrate' as const,
      label: descriptor.label,
    }))
    .with({ descriptor: { type: 'migrate-all' } }, ({ descriptor }) => ({
      kind: 'migrate-all' as const,
      count: descriptor.count,
    }))
    .with({ descriptor: { type: 'grant-role' } }, ({ descriptor }) => ({
      kind: 'grant-role' as const,
      label: descriptor.label,
    }))
    .with({ descriptor: { type: 'profile-replay' } }, ({ descriptor }) => ({
      kind: 'profile-replay' as const,
      label: descriptor.label,
    }))
    .exhaustive()
```

- [ ] **Step 3: Update `GameStep.tsx` description match**

Replace the `descriptionText = match(stepDescription).with(...)...` block with cases matching the new union:

```tsx
const descriptionText = match(stepDescription)
  .with({ kind: 'done' }, () => t`Almost there...`)
  .with({ kind: 'progress' }, ({ text }) => text)
  .with({ kind: 'preparing' }, () => t`Preparing migration...`)
  .with(
    { kind: 'approve-base-registrar' },
    () => `${t`Approving the migration helper on BaseRegistrar`}...`,
  )
  .with(
    { kind: 'approve-name-wrapper' },
    () => `${t`Approving the migration helper on NameWrapper`}...`,
  )
  .with(
    { kind: 'ensure-resolver' },
    () => `${t`Setting up your v2 resolver`}...`,
  )
  .with(
    { kind: 'pre-migrate' },
    ({ label }) => `${t`Reserving ${label}.eth in v2`}...`,
  )
  .with(
    { kind: 'migrate-all' },
    ({ count }) => `${t`Upgrading ${count} name(s) to v2`}...`,
  )
  .with(
    { kind: 'grant-role' },
    ({ label }) => `${t`Granting manager role for ${label}.eth`}...`,
  )
  .with(
    { kind: 'profile-replay' },
    ({ label }) => `${t`Restoring profile records for ${label}.eth`}...`,
  )
  .exhaustive()
```

- [ ] **Step 4: Update `GameStep.helpers.test.ts`**

Open the existing test file and find every reference to the old descriptor kinds (`approve-sca`, `batch-single`, `batch-multi`, `migrate-batch`). Replace with cases for the new union. For each new variant write at least one `describeNextStep` test asserting it maps through to the right `kind` and payload.

If you need to look at the file first, run:

Run: `cd apps/manager && cat src/features/migration/components/GameStep.helpers.test.ts`

Then rewrite each `describeNextStep` case in-place to match the new descriptors. Keep the bridge-layout tests and ts-pattern-based ones unchanged.

- [ ] **Step 5: Run the affected unit tests**

Run: `cd apps/manager && pnpm vitest run src/features/migration/components/GameStep.helpers.test.ts src/features/migration/service/buildStepDescriptors`
Expected: PASS. (`buildStepDescriptors` may not have a test file — it will once Task 9 lands. For now just check the helpers test.)

- [ ] **Step 6: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: FAIL — `buildStepDescriptors` is called from `buildMigrationPlan.ts` with the old signature `(classified, groups, preflight, batchSizes)`. This is expected; it gets fixed in Task 9. Mark this task complete and proceed.

If the failure surface is limited to `buildMigrationPlan.ts` (lines around 300 and 413), continue. If it spreads elsewhere, stop and reconcile before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/manager/src/features/migration/service/buildStepDescriptors.ts apps/manager/src/features/migration/components/GameStep.helpers.ts apps/manager/src/features/migration/components/GameStep.helpers.test.ts apps/manager/src/features/migration/components/GameStep.tsx
git commit -m "refactor: per-tx migration step descriptors"
```

---

## Task 8: Extend `decodeMigrationError` with helper + wrapped variants

**Files:**
- Modify: `apps/manager/src/features/migration/service/decodeMigrationError.ts`
- Modify: `apps/manager/src/features/migration/service/decodeMigrationError.test.ts`

- [ ] **Step 1: Write failing tests for the new variants**

Append to `decodeMigrationError.test.ts`:

```ts
import { concat, encodeAbiParameters, encodeErrorResult, type Hex } from 'viem'
import { LIB_MIGRATION_ERRORS_ABI, MIGRATION_HELPER_ABI } from '../contracts/abis'

const revertWith = (data: Hex) =>
  Object.assign(new Error('reverted'), {
    name: 'ContractFunctionRevertedError',
    data,
  })

describe('decodeMigrationError — helper-typed reverts', () => {
  it('maps WrappedOwnerMismatch', () => {
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'WrappedOwnerMismatch',
      args: [42n],
    })
    expect(decodeMigrationError(revertWith(data))).toEqual({
      type: 'wrapped-owner-mismatch',
      tokenId: 42n,
    })
  })

  it('maps ParentNotMigrated', () => {
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'ParentNotMigrated',
      args: ['0x0376617503657468' + '00' as Hex],
    })
    const result = decodeMigrationError(revertWith(data))
    expect(result).toMatchObject({ type: 'parent-not-migrated' })
  })

  it('maps NotApprovedOperator', () => {
    const data = encodeErrorResult({
      abi: MIGRATION_HELPER_ABI,
      errorName: 'NotApprovedOperator',
      args: [
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
      ],
    })
    expect(decodeMigrationError(revertWith(data))).toEqual({
      type: 'not-approved-operator',
      nft: '0x1111111111111111111111111111111111111111',
      owner: '0x2222222222222222222222222222222222222222',
    })
  })
})

describe('decodeMigrationError — wrapped LibMigration errors', () => {
  const wrap = (inner: Hex): Hex => {
    // Error(string) with the inner selector + abi-encoded args as the string.
    // WrappedErrorLib serializes the inner revert bytes as a hex-encoded ASCII
    // string. The decoder unwraps this back to inner bytes before matching.
    const stringPayload = inner
    return encodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }] as const,
      errorName: 'Error',
      args: [stringPayload],
    })
  }

  it('unwraps NameNotLocked from Error(string)', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'NameNotLocked',
      args: [7n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'name-not-locked',
      tokenId: 7n,
    })
  })

  it('unwraps FrozenTokenApproval', () => {
    const inner = encodeErrorResult({
      abi: LIB_MIGRATION_ERRORS_ABI,
      errorName: 'FrozenTokenApproval',
      args: [9n],
    })
    expect(decodeMigrationError(revertWith(wrap(inner)))).toEqual({
      type: 'frozen-token-approval',
      tokenId: 9n,
    })
  })

  it('falls through to generic when wrapped data is unrecognized', () => {
    const garbage = '0xdeadbeef' as Hex
    const result = decodeMigrationError(revertWith(wrap(garbage)))
    expect(result.type).toBe('generic')
  })
})
```

Run the test file to confirm the new tests fail:

Run: `cd apps/manager && pnpm vitest run src/features/migration/service/decodeMigrationError.test.ts`
Expected: FAIL on the new tests; existing tests still pass.

- [ ] **Step 2: Extend the type union and decoder**

In `decodeMigrationError.ts`, extend `MigrationError`:

```ts
export type MigrationError =
  | { type: 'generic'; message: string }
  | { type: 'resolver-deploy-failed'; message: string }
  | {
      type: 'profile-fetch-failed'
      phase: 'subgraph' | 'onchain'
      message: string
    }
  | { type: 'user-rejected' }
  | { type: 'preflight-timeout'; message: string; timeoutMs?: number }
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

Add a helper `findRevertData` that walks the cause chain and returns the first `data` field shaped like `0x...`:

```ts
import { type Address, type Hex, decodeErrorResult, hexToString } from 'viem'
import { LIB_MIGRATION_ERRORS_ABI, MIGRATION_HELPER_ABI } from '../contracts/abis'

const findRevertData = (err: unknown): Hex | null => {
  for (const e of walkCauseChain(err)) {
    const data = (e as { data?: unknown }).data
    if (typeof data === 'string' && data.startsWith('0x')) return data as Hex
  }
  return null
}

const tryDecodeHelperError = (data: Hex): MigrationError | null => {
  try {
    const decoded = decodeErrorResult({ abi: MIGRATION_HELPER_ABI, data })
    switch (decoded.errorName) {
      case 'WrappedOwnerMismatch':
        return { type: 'wrapped-owner-mismatch', tokenId: decoded.args[0] as bigint }
      case 'ParentNotMigrated': {
        const encoded = decoded.args[0] as Hex
        return { type: 'parent-not-migrated', parentName: decodeDnsName(encoded) }
      }
      case 'NotApprovedOperator':
        return {
          type: 'not-approved-operator',
          nft: decoded.args[0] as Address,
          owner: decoded.args[1] as Address,
        }
    }
  } catch {
    // not a helper-typed error
  }
  return null
}

const tryUnwrapControllerError = (data: Hex): MigrationError | null => {
  try {
    const wrapper = decodeErrorResult({
      abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }] as const,
      data,
    })
    // The wrapped payload is hex-encoded bytes carried as a string. Try both
    // interpretations: a hex-prefixed string, or a UTF-8 ASCII hex string.
    const raw = wrapper.args[0] as string
    const inner = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex
    const decoded = decodeErrorResult({ abi: LIB_MIGRATION_ERRORS_ABI, data: inner })
    switch (decoded.errorName) {
      case 'NameNotLocked':
        return { type: 'name-not-locked', tokenId: decoded.args[0] as bigint }
      case 'NameIsLocked':
        return { type: 'name-is-locked', tokenId: decoded.args[0] as bigint }
      case 'NameDataMismatch':
        return { type: 'name-data-mismatch', tokenId: decoded.args[0] as bigint }
      case 'FrozenTokenApproval':
        return { type: 'frozen-token-approval', tokenId: decoded.args[0] as bigint }
      case 'InvalidData':
        return { type: 'invalid-data' }
      case 'NameRequiresMigration':
        return { type: 'name-requires-migration' }
    }
  } catch {
    // not a wrapped controller error
  }
  return null
}

// DNS-encoded bytes → human-readable name. Reads each length-prefixed label
// and joins with '.'.
const decodeDnsName = (encoded: Hex): string => {
  const bytes = encoded.slice(2)
  const labels: string[] = []
  let i = 0
  while (i < bytes.length) {
    const len = parseInt(bytes.slice(i, i + 2), 16)
    if (len === 0) break
    i += 2
    const labelHex = bytes.slice(i, i + len * 2)
    labels.push(hexToString(`0x${labelHex}` as Hex))
    i += len * 2
  }
  return labels.join('.')
}
```

Then update `decodeMigrationError` to consult these helpers BEFORE the generic fallback:

```ts
export const decodeMigrationError = (err: unknown): MigrationError => {
  if (isUserRejection(err)) return { type: 'user-rejected' }

  const timeout = findTimeoutError(err)
  if (timeout) {
    return {
      type: 'preflight-timeout',
      message: extractErrorMessage(timeout),
      timeoutMs: timeout.timeoutMs,
    }
  }

  if (err instanceof OwnedResolverDeployError) {
    return { type: 'resolver-deploy-failed', message: extractErrorMessage(err) }
  }
  if (err instanceof ProfileFetchError) {
    return {
      type: 'profile-fetch-failed',
      phase: err.phase,
      message: extractErrorMessage(err),
    }
  }

  const revertData = findRevertData(err)
  if (revertData) {
    const helperMatch = tryDecodeHelperError(revertData)
    if (helperMatch) return helperMatch
    const wrappedMatch = tryUnwrapControllerError(revertData)
    if (wrappedMatch) return wrappedMatch
  }

  return { type: 'generic', message: extractErrorMessage(err) }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service/decodeMigrationError.test.ts`
Expected: PASS for all tests including new ones. If the wrapped-error test fails because the wrapping format differs from the assumption above, instrument the test (`console.log(wrap(inner))`) and adjust `tryUnwrapControllerError` to match what the contract actually emits — the rule is: decode `Error(string)`, then interpret the string as hex bytes and re-decode against `LIB_MIGRATION_ERRORS_ABI`.

- [ ] **Step 4: Commit**

```bash
git add apps/manager/src/features/migration/service/decodeMigrationError.ts apps/manager/src/features/migration/service/decodeMigrationError.test.ts
git commit -m "feat: decode MigrationHelper and wrapped controller errors"
```

---

## Task 9: New `MigrationPlan` shape and plan-builder

**Files:**
- Modify: `apps/manager/src/features/migration/service/buildMigrationPlan.ts`
- Modify: `apps/manager/src/features/migration/service/migrationPlan.helpers.ts`
- Modify: `apps/manager/src/features/migration/service/preflightChecks.ts`

This task collapses the plan-builder. After this task, code that still imports the deleted helpers (parent-walker, deferred logic) won't compile until Task 10 lands.

- [ ] **Step 1: Strip deferred + byte-packing helpers**

Replace `apps/manager/src/features/migration/service/migrationPlan.helpers.ts` with:

```ts
export const formatNamesPreview = (
  names: readonly string[],
  limit = 3,
): string => {
  const preview = names.slice(0, limit).join(', ')
  const suffix = names.length > limit ? ` (+${names.length - limit} more)` : ''
  return `${preview}${suffix}`
}
```

- [ ] **Step 2: Strip parent-registry walker**

In `apps/manager/src/features/migration/service/preflightChecks.ts`, delete the following symbols and their tests if any exist:

- `getParentLabels`
- `PARENT_REGISTRY_RETRIES`
- `PARENT_REGISTRY_RETRY_DELAYS_MS`
- `walkDeepRegistry`
- `resolveParentRegistriesOnce`
- `resolveParentRegistries`

Also delete the `WRAPPER_REGISTRY_ABI` import if it becomes unused. Run `grep -n WRAPPER_REGISTRY_ABI src/features/migration/service/preflightChecks.ts` after editing to confirm.

Keep: `filterNotReserved`, `EligibilityResult`, `checkOwnership`, `checkV2Status`, `checkFrozenApproval`, `frozenApprovalCandidates`, `runEligibilityChecks`.

- [ ] **Step 3: Rewrite `buildMigrationPlan.ts`**

Replace the whole file with:

```ts
import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'

import { V2_CONTRACTS } from '../contracts/addresses'
import { buildMigrateCall } from './buildMigrateCall'
import { buildPreMigrateCall } from './buildPreMigrateCalls'
import { buildProfileReplayCall } from './buildProfileReplayCalls'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import {
  buildStepDescriptors,
  type MigrationStepDescriptor,
} from './buildStepDescriptors'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
  is2LD,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { predictOwnedPermResAddress } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { filterNotReserved } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

export class MigrationPlanError extends TaggedError('MigrationPlanError')<{
  cause: unknown
  step?: string
}> {}

export type MigrationPlan = {
  readonly migrationOwner: Address
  readonly domains: readonly V1Domain[]
  readonly classified: readonly ClassifiedName[]
  readonly ineligible: readonly IneligibleName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly ownedPermRes: Address | null
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly notReservedSet: ReadonlySet<string>
  readonly preMigrateCalls: readonly ZeroDevCall[]
  readonly migrateCall: ZeroDevCall
  readonly roleGrantCalls: readonly ZeroDevCall[]
  readonly profileReplayCalls: readonly ZeroDevCall[]
  readonly stepDescriptors: readonly MigrationStepDescriptor[]
}

const fetchProfilesForNames = async (params: {
  namesToOwnedPermRes: readonly ClassifiedName[]
  preflight: MigrationPreflight
  publicClient: PublicClient
}): Promise<Map<Hex, Profile>> => {
  const { namesToOwnedPermRes, preflight, publicClient } = params
  if (namesToOwnedPermRes.length === 0 || preflight.skipFetchProfilesPhase) {
    return new Map()
  }
  return fetchV1Profiles({
    names: namesToOwnedPermRes
      .filter((n) => n.v1ResolverAddress)
      .map((n) => ({
        nodeHex: namehash(n.domain.name) as Hex,
        v1ResolverAddress: n.v1ResolverAddress as Address,
      })),
    publicClient,
  })
}

const computeNotReservedSet = async (
  publicClient: PublicClient,
  classified: readonly ClassifiedName[],
): Promise<Set<string>> => {
  const twoLDs = classified.filter(is2LD)
  if (twoLDs.length === 0) return new Set()
  const notReserved = await filterNotReserved(publicClient, twoLDs)
  return new Set(notReserved.map((n) => n.domain.name))
}

const buildAuxCalls = (params: {
  classified: readonly ClassifiedName[]
  notReservedSet: ReadonlySet<string>
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
}): {
  preMigrateCalls: ZeroDevCall[]
  roleGrantCalls: ZeroDevCall[]
  profileReplayCalls: ZeroDevCall[]
} => {
  const { classified, notReservedSet, ownedPermRes, profiles } = params
  const preMigrateCalls: ZeroDevCall[] = []
  const roleGrantCalls: ZeroDevCall[] = []
  const profileReplayCalls: ZeroDevCall[] = []

  for (const name of classified) {
    if (is2LD(name) && notReservedSet.has(name.domain.name)) {
      preMigrateCalls.push(buildPreMigrateCall(name))
    }
    if (name.managerAddress) {
      roleGrantCalls.push(buildRoleGrantCall(name))
    }
    if (ownedPermRes && name.resolverStrategy === 'to-owned-permres') {
      const node = namehash(name.domain.name) as Hex
      const profile = profiles.get(profileMapKey(node))
      if (
        profile &&
        (profile.texts.length > 0 || profile.addresses.length > 0)
      ) {
        const replayCall = buildProfileReplayCall({
          resolver: ownedPermRes,
          profiles: new Map<Hex, Profile>([[node, profile]]),
        })
        if (replayCall) profileReplayCalls.push(replayCall)
      }
    }
  }

  return { preMigrateCalls, roleGrantCalls, profileReplayCalls }
}

export const buildMigrationPlan = async (params: {
  domains: readonly V1Domain[]
  migrationOwner: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  preflight: MigrationPreflight
  hasBaseRegistrarApproval: boolean
  hasNameWrapperApproval: boolean
}): Promise<MigrationPlan> => {
  const {
    domains,
    migrationOwner,
    publicClient,
    preflight,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
  } = params

  const { classified, ineligible } = classifyNames([...domains], migrationOwner)
  const groups = groupClassifiedNames(classified)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  let ownedPermRes: Address | null = null
  if (namesToOwnedPermRes.length > 0) {
    ownedPermRes =
      preflight.preExistingOwnedPermRes ??
      (await predictOwnedPermResAddress({
        eoa: migrationOwner,
        publicClient,
      }))
  }

  const [profiles, notReservedSet] = await Promise.all([
    fetchProfilesForNames({ namesToOwnedPermRes, preflight, publicClient }),
    computeNotReservedSet(publicClient, classified),
  ])

  const migrateCall = buildMigrateCall({
    classified,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes,
  })

  const { preMigrateCalls, roleGrantCalls, profileReplayCalls } = buildAuxCalls(
    {
      classified,
      notReservedSet,
      ownedPermRes,
      profiles,
    },
  )

  const stepDescriptors = buildStepDescriptors({
    classified,
    groups,
    preflight,
    notReservedSet,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
  })

  return {
    migrationOwner,
    domains,
    classified,
    ineligible,
    groups,
    preflight,
    ownedPermRes,
    profiles,
    notReservedSet,
    preMigrateCalls,
    migrateCall,
    roleGrantCalls,
    profileReplayCalls,
    stepDescriptors,
  }
}

export const adjustPlanForRetry = (
  plan: MigrationPlan,
  migratedNames: readonly string[],
): MigrationPlan => {
  if (migratedNames.length === 0) return plan
  const migratedSet = new Set(migratedNames)
  const remainingClassified = plan.classified.filter(
    (c) => !migratedSet.has(c.domain.name),
  )
  const remainingDomains = plan.domains.filter((d) => !migratedSet.has(d.name))

  if (remainingClassified.length === 0) {
    return {
      ...plan,
      classified: [],
      domains: remainingDomains,
      preMigrateCalls: [],
      roleGrantCalls: [],
      profileReplayCalls: [],
      stepDescriptors: [],
      // migrateCall stays — it's a tombstone after retry succeeds.
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const migrateCall = buildMigrateCall({
    classified: remainingClassified,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: plan.ownedPermRes,
  })
  const { preMigrateCalls, roleGrantCalls, profileReplayCalls } = buildAuxCalls(
    {
      classified: remainingClassified,
      notReservedSet: plan.notReservedSet,
      ownedPermRes: plan.ownedPermRes,
      profiles: plan.profiles,
    },
  )
  const stepDescriptors = buildStepDescriptors({
    classified: remainingClassified,
    groups,
    preflight: plan.preflight,
    notReservedSet: plan.notReservedSet,
    // After a partial-fail retry, the user has already approved — pretend
    // approvals are present so the descriptor list omits them.
    hasBaseRegistrarApproval: true,
    hasNameWrapperApproval: true,
  })

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    preMigrateCalls,
    migrateCall,
    roleGrantCalls,
    profileReplayCalls,
    stepDescriptors,
  }
}
```

- [ ] **Step 4: Update upstream callers that pass plan-builder params**

Find every site that calls `buildMigrationPlan`:

Run: `cd apps/manager && grep -rn 'buildMigrationPlan(' src --include='*.ts' --include='*.tsx'`

For each caller, supply the new required params `hasBaseRegistrarApproval` and `hasNameWrapperApproval`. These come from the result of `checkHelperApprovals` against the EOA + helper address. Where the caller doesn't have approval data yet (e.g. in a hook before the user clicks "Migrate"), pass `false`/`false` — the descriptor list will simply include the approval steps and they'll skip themselves at execution time if already approved.

Likely call sites: `useMigrationPreflight.ts`, `executeMigration` in `migrationService.ts`, plus any tests.

- [ ] **Step 5: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: FAIL — `migrationService.ts` still references `plan.batches`, `plan.deferredBatches`, etc. Fixed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add apps/manager/src/features/migration/service/buildMigrationPlan.ts apps/manager/src/features/migration/service/migrationPlan.helpers.ts apps/manager/src/features/migration/service/preflightChecks.ts apps/manager/src/features/migration/hooks/useMigrationPreflight.ts
git commit -m "refactor: collapse migration plan into single migrateCall + aux calls"
```

(Adjust the `git add` paths to include any other files updated in Step 4.)

---

## Task 10: Rewrite `migrationService.executeMigration`

**Files:**
- Modify: `apps/manager/src/features/migration/service/migrationService.ts`

- [ ] **Step 1: Replace `executeMigration` and supporting helpers**

Open `migrationService.ts`. Keep `MigrationError`, `MigrationUserRejectedError`, `isUserRejection`, `wrapBatchError`, `Tracker`, `createTracker`, `buildEOARequest`, the imports for `transactionManager` / `waitForTransaction`, and the `MigrationProgress` / `MigrationResult` types.

Delete: `submitBatchedUserOp`, `buildSCARequest`, `submitBatches`, `OnBatchComplete`, the `resolveDeferredBatches` import.

Replace with this `submitCall` helper and a rewritten `executeMigration`:

```ts
const submitCall = async (
  ctx: MigrationCtx,
  call: ZeroDevCall,
  description: string,
): Promise<Hex> => {
  const txId = transactionManager.startTransaction(
    { type: 'custom', request: buildEOARequest(ctx, call) },
    ctx.signer,
    {
      description,
      publicClient: ctx.publicClient,
    },
  )
  ctx.tracker.emit(description, PENDING_TX_HASH)
  const result = await waitForTransaction(txId)
  return result.hash as Hex
}

export type OnCallComplete = (names: readonly string[], txHash: Hex) => void

export const executeMigration = async (params: {
  plan: MigrationPlan
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  onProgress: (progress: MigrationProgress) => void
  onBatchComplete?: OnCallComplete
}): Promise<MigrationResult> => {
  const {
    plan,
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    onProgress,
    onBatchComplete,
  } = params
  const { classified, ineligible, groups, preflight, stepDescriptors } = plan

  if (classified.length === 0) {
    return { completed: 0, txHashes: [], ineligible: [...ineligible] }
  }

  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    tracker: createTracker(onProgress, stepDescriptors.length),
  }

  const txHashes: Hex[] = []

  // 1. Approvals
  if (!preflight.skipApprovalPhase) {
    const approvalHashes = await ensureApprovals(ctx, groups)
    txHashes.push(...approvalHashes)
  }

  // 2. Owned PermissionedResolver (existing flow)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  await ensureResolver(ctx, namesToOwnedPermRes, preflight)

  // 3. preMigrate per 2LD
  for (const call of plan.preMigrateCalls) {
    try {
      const hash = await submitCall(ctx, call, 'Reserving v2 name')
      txHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Name reserved', hash)
    } catch (error) {
      throw wrapBatchError(error, 'Reserving v2 name')
    }
  }

  // 4. Single migrate() call
  const allNames = classified.map((c) => c.domain.name)
  try {
    const migrateHash = await submitCall(
      ctx,
      plan.migrateCall,
      `Upgrading ${classified.length} name(s)`,
    )
    txHashes.push(migrateHash)
    onBatchComplete?.(allNames, migrateHash)
    ctx.tracker.next()
    ctx.tracker.emit('Names upgraded', migrateHash)
  } catch (error) {
    throw wrapBatchError(error, 'Migrate')
  }

  // 5. grantRoles per manager
  for (const call of plan.roleGrantCalls) {
    try {
      const hash = await submitCall(ctx, call, 'Granting manager role')
      txHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Role granted', hash)
    } catch (error) {
      throw wrapBatchError(error, 'Granting manager role')
    }
  }

  // 6. Profile replay
  for (const call of plan.profileReplayCalls) {
    try {
      const hash = await submitCall(ctx, call, 'Restoring profile records')
      txHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit('Profile restored', hash)
    } catch (error) {
      throw wrapBatchError(error, 'Restoring profile records')
    }
  }

  return {
    completed: classified.length,
    txHashes,
    ineligible: [...ineligible],
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/manager && pnpm typecheck`
Expected: PASS now (the state-machine still listens to `migration.batchComplete`, which `onBatchComplete` triggers; semantics are preserved because we still call `onBatchComplete` once with every migrated name's display name + the migrate() tx hash).

- [ ] **Step 3: Run service tests**

Run: `cd apps/manager && pnpm vitest run src/features/migration/service`
Expected: PASS. Tests that referenced the old `submitBatches` / `resolveDeferredBatches` paths should already have been deleted along with their producers, or they need their imports adjusted in this step. Adjust as needed and re-run.

- [ ] **Step 4: Commit**

```bash
git add apps/manager/src/features/migration/service/migrationService.ts
git commit -m "refactor: flatten executeMigration around single migrate() call"
```

---

## Task 11: Adapt `migrationUi.machine.ts` and its tests

**Files:**
- Modify: `apps/manager/src/features/migration/state/migrationUi.machine.ts`
- Modify: `apps/manager/src/features/migration/state/migrationUi.machine.test.ts`

- [ ] **Step 1: Update event/action wiring**

In `migrationUi.machine.ts`, no event renames are strictly required — `migration.batchComplete` keeps firing once per submitted tx (currently the `migrate()` call), and the existing reducers still apply. Touch points:

- Imports: drop `MigrationProgress` import if unused after the diff settles.
- The actor `runMigration` keeps `onBatchComplete` semantics — `executeMigration` fires it once after the migrate() tx confirms.
- `appendBatchComplete`: continues to merge `event.names` into `migratedNames` and `event.txHash` into `txHashes` — no changes needed.
- `isOnlyFailures` guard: still valid — fires when `event.result.txHashes.length === 0`. After the refactor, that's exactly the case where every step before migrate() succeeded but the migrate() call itself reverted.

If `MAX_NAMES_PER_BATCH` was re-exported from `buildStepDescriptors.ts` via `migrationService.ts`, drop that re-export (the constant was removed in Task 7).

- [ ] **Step 2: Update `migrationUi.machine.test.ts` fixtures**

Open the test file. Find the `MigrationPlan` literal fixtures (search: `as MigrationPlan` or `: MigrationPlan`). Replace them with the new shape:

```ts
const plan = {
  migrationOwner: OWNER,
  domains: [],
  classified: [],
  ineligible: [],
  groups: EMPTY_GROUPS,
  preflight: PREFLIGHT,
  ownedPermRes: null,
  profiles: new Map(),
  notReservedSet: new Set<string>(),
  preMigrateCalls: [],
  migrateCall: { to: '0x0', data: '0x', value: 0n } as ZeroDevCall,
  roleGrantCalls: [],
  profileReplayCalls: [],
  stepDescriptors: [],
} satisfies MigrationPlan
```

Add `import type { ZeroDevCall } from '@ens-apps/transaction-manager'` if not already imported.

Any test that constructs descriptors must use the new union (`{ type: 'migrate-all', count: 1 }` etc.) — search the file for `'migrate-batch'` and `'approve-sca'` and replace.

- [ ] **Step 3: Run state-machine tests**

Run: `cd apps/manager && pnpm vitest run src/features/migration/state/migrationUi.machine.test.ts`
Expected: PASS. If any test asserts a specific descriptor sequence based on old batches, rewrite the assertion against the new per-tx descriptor list.

- [ ] **Step 4: Commit**

```bash
git add apps/manager/src/features/migration/state/migrationUi.machine.ts apps/manager/src/features/migration/state/migrationUi.machine.test.ts
git commit -m "refactor: adapt migration state machine to single migrate() plan"
```

---

## Task 12: Delete dead code and re-home `resolverFor`

**Files:**
- Delete: `apps/manager/src/features/migration/service/buildMigrationCalls.ts`
- Delete: `apps/manager/src/features/migration/service/buildMigrationCalls.test.ts`
- Modify: `apps/manager/src/features/migration/service/encodeMigration.ts`
- Modify: `apps/manager/src/features/migration/service/buildMigrateCall.ts`

- [ ] **Step 1: Move `resolverFor` into `encodeMigration.ts`**

Open `encodeMigration.ts` and add at the bottom:

```ts
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import type { ClassifiedName } from './classifyNames'

// (the existing MigrationData type + createMigrationData stay above)

export const resolverFor = (
  name: ClassifiedName,
  defaultResolver: Address,
  ownedPermRes: Address | null,
): Address => {
  const resolver: Address = (() => {
    switch (name.resolverStrategy) {
      case 'keep-v1':
        return (name.v1ResolverAddress ?? defaultResolver) as Address
      case 'to-owned-permres':
        return ownedPermRes ?? defaultResolver
    }
  })()
  if (resolver === zeroAddress) {
    throw new Error(
      `Resolver for "${name.domain.name}" resolved to the zero address (strategy=${name.resolverStrategy})`,
    )
  }
  return resolver
}
```

Drop `encodeMigrationData` (it's unused after Task 9). Keep `MigrationData` and `createMigrationData`.

- [ ] **Step 2: Repoint `buildMigrateCall.ts` to the new `resolverFor`**

In `buildMigrateCall.ts`, change:

```ts
import { resolverFor } from './buildMigrationCalls'
import { createMigrationData, type MigrationData } from './encodeMigration'
```

to:

```ts
import { createMigrationData, type MigrationData, resolverFor } from './encodeMigration'
```

- [ ] **Step 3: Delete `buildMigrationCalls.ts` and its tests**

```bash
git rm apps/manager/src/features/migration/service/buildMigrationCalls.ts
git rm apps/manager/src/features/migration/service/buildMigrationCalls.test.ts
```

- [ ] **Step 4: Sweep for stale imports**

Run: `cd apps/manager && grep -rn 'buildMigrationCalls\|buildAllTransferCalls\|buildUnwrappedTransferCall\|buildWrappedTransferCall\|encodeMigrationData' src --include='*.ts' --include='*.tsx'`
Expected: zero hits.

Run: `cd apps/manager && grep -rn 'walkDeepRegistry\|resolveParentRegistries\|DEFERRED_PARENT_PLACEHOLDER\|MAX_BATCH_RAW_BYTES\|packNamesByPayload' src --include='*.ts' --include='*.tsx'`
Expected: zero hits.

If any hits remain, fix them inline.

- [ ] **Step 5: Run full app tests + typecheck + lint**

Run: `cd apps/manager && pnpm typecheck && pnpm vitest run && pnpm lint`
Expected: PASS everywhere.

If anything fails, fix and re-run until clean.

- [ ] **Step 6: Commit**

```bash
git add -A apps/manager/src/features/migration
git commit -m "chore: remove legacy migration call builders and helpers"
```

---

## Task 13: Verification — full app build + manual Tenderly walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run full build**

Run: `cd apps/manager && pnpm build`
Expected: PASS.

If the build fails on a lingering reference, fix it. Common suspect: a `migrationService.ts` re-export or test fixture missed in Tasks 9–11.

- [ ] **Step 2: Confirm the Tenderly RPC is wired**

Run: `cd apps/manager && pnpm vitest run src/lib/wagmi || true; pnpm dev` (Ctrl-C the dev server after it starts.)

Watch the terminal for the resolved RPC URL — open the manager app in a browser, open DevTools → Network, and confirm an outbound request to `virtual.sepolia.us-east.rpc.tenderly.co`. If you see the old DRPC URL instead, your `.env.local` overrides the default. Either delete the override or set `VITE_SEPOLIA_RPC_URL` to the Tenderly URL explicitly.

- [ ] **Step 3: Tenderly walkthrough (manual)**

Set `VITE_FF_USE_EOA=true` in `apps/manager/.env.local`. Restart `pnpm dev`. Connect a Tenderly-funded EOA. Walk through the spec §11.2 scenarios:

1. Single unwrapped name → expect 1 BaseRegistrar approval tx + 1 `migrate()` tx.
2. Single locked 2LD → expect 1 NameWrapper approval tx + 1 `migrate()` tx.
3. Mixed (1 unwrapped + 1 locked 2LD + 1 unlocked) → expect 2 approval txs + 1 `migrate()` tx.
4. **Parent + locked child in one migration** → expect 1 NameWrapper approval + 1 `migrate()` covering both. **This validates the §10 assumption from the spec.** If it reverts with `ParentNotMigrated`, the assumption was wrong: fall back to splitting `classified` into two passes (`migrate(parents)` then `migrate(children)`) in `executeMigration`.
5. Name with manager → migrate + grantRoles.
6. Name with to-owned-permres + V1 profile → ensureResolver + migrate + profile-replay.
7. Already-migrated name → preflight excludes it.
8. Force a `migrate()` revert by revoking the helper's approval mid-flow → UI surfaces the correct typed error (`not-approved-operator`).

- [ ] **Step 4: If §3 case 4 fails, implement the fallback**

(Skip if case 4 passes.)

In `executeMigration`, replace the single `migrateCall` submission with a two-pass split:

```ts
// Build a "parents-only" call and a "children-only" call from plan.classified.
// Submit them sequentially. Wait for receipt between (waitForTransaction already does this).
```

The plan-builder change required is minimal — split classified into `parentClassified` and `childClassified` based on `tokenType`, call `buildMigrateCall` twice, push two `migrateCall` fields onto the plan (`migrateCalls: readonly ZeroDevCall[]`), and loop them in step 4 of `executeMigration`. Re-run case 4 to confirm.

- [ ] **Step 5: Commit the fallback if added**

```bash
git add apps/manager/src/features/migration
git commit -m "fix: split migrate() into two passes when parents and children share a call"
```

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin tenderly-migration-support-v3
gh pr create --title "feat: refactor migration to use MigrationHelper" --body "See docs/superpowers/specs/2026-05-12-migration-helper-refactor-design.md for the full design."
```

---

## Self-review notes (for the executing agent)

- The new `MigrationStepDescriptor` union is consumed in **four** places (`buildStepDescriptors.ts`, `GameStep.helpers.ts`, `GameStep.helpers.test.ts`, `GameStep.tsx`). Task 7 keeps them in a single commit. If you discover other consumers via grep, add them to the same commit.
- `adjustPlanForRetry` (Task 9) assumes `notReservedSet` is stable across the retry — it is, because the reservation status of a name in v2 doesn't flip back to "available" once you've called `preMigrate`. Don't refetch it.
- `onBatchComplete` keeps its name even after the rename in Task 10 because the state-machine event is `migration.batchComplete` and `executeMigration` consumers rely on that contract. Renaming would cascade into the machine fixtures; not worth the churn.
- Test fixtures in `_fixtures/index.ts` already cover all `ClassifiedName` shapes — no need to extend the fixtures file.
- The wrapped-error decode in Task 8 makes a structural assumption about how `WrappedErrorLib` serializes the inner revert (hex string carrying the original selector + args). If the integration test in Task 13 surfaces a wrapped error that doesn't decode, capture the raw `Error(string)` payload in the browser console and adjust `tryUnwrapControllerError` accordingly — the rule is "decode `Error(string)`, treat the inner string as hex bytes, decode against `LIB_MIGRATION_ERRORS_ABI`".
