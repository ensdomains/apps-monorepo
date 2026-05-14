import { type Address, decodeFunctionData, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, OWNER } from './_fixtures'
import { buildMigrateCall } from './buildMigrateCall'
import type { MigrationData } from './encodeMigration'

const DEFAULT_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'
const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d003'

type DecodedMigrateArgs = {
  unwrapped: readonly MigrationData[]
  unlockedGroups: readonly (readonly MigrationData[])[]
  lockedGroups: readonly (readonly MigrationData[])[]
  lockedChildrenGroups: readonly {
    parentName: `0x${string}`
    groups: readonly (readonly MigrationData[])[]
  }[]
}

const decode = (data: `0x${string}`): DecodedMigrateArgs => {
  const { functionName, args } = decodeFunctionData({
    abi: MIGRATION_HELPER_ABI,
    data,
  })
  expect(functionName).toBe('migrate')
  const [unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups] =
    args as [
      readonly MigrationData[],
      readonly (readonly MigrationData[])[],
      readonly (readonly MigrationData[])[],
      readonly {
        parentName: `0x${string}`
        groups: readonly (readonly MigrationData[])[]
      }[],
    ]
  return { unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups }
}

const buildCall = (
  overrides: Parameters<typeof makeClassified>[0][],
  opts: {
    migrationOwner?: Address
    defaultResolver?: Address
    ownedPermRes?: Address | null
  } = {},
) =>
  buildMigrateCall({
    classified: overrides.map((o) => makeClassified(o)),
    migrationOwner: opts.migrationOwner ?? OWNER,
    defaultResolver: opts.defaultResolver ?? DEFAULT_RESOLVER,
    ownedPermRes: opts.ownedPermRes ?? PERM_RES,
  })

// ─── 1. Empty input ──────────────────────────────────────────────────────────

describe('empty input', () => {
  it('targets MigrationHelper at zero value with migrate function', () => {
    const call = buildCall([])
    expect(call.to.toLowerCase()).toBe(
      V2_CONTRACTS.MigrationHelper.toLowerCase(),
    )
    expect(call.value).toBe(0n)
  })

  it('produces [[], [], [], []] args', () => {
    const { unwrapped, unlockedGroups, lockedGroups, lockedChildrenGroups } =
      decode(buildCall([]).data)
    expect(unwrapped).toHaveLength(0)
    expect(unlockedGroups).toHaveLength(0)
    expect(lockedGroups).toHaveLength(0)
    expect(lockedChildrenGroups).toHaveLength(0)
  })
})

// ─── 2. Single unwrapped name ─────────────────────────────────────────────────

describe('single unwrapped name', () => {
  it('goes to first arg with correct owner and subregistry', () => {
    const call = buildCall([
      {
        tokenType: 'unwrapped',
        label: 'alice',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { unwrapped, unlockedGroups, lockedGroups } = decode(call.data)
    expect(unwrapped).toHaveLength(1)
    expect(unlockedGroups).toHaveLength(0)
    expect(lockedGroups).toHaveLength(0)

    const item = unwrapped[0]
    if (!item) throw new Error('expected first item in unwrapped')
    expect(item.label).toBe('alice')
    expect(item.owner.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(item.subregistry).toBe(zeroAddress)
  })
})

// ─── 3. Multiple unlocked names → single inner group ─────────────────────────

describe('multiple unlocked names', () => {
  it('packs all into unlockedGroups[0]', () => {
    const call = buildCall([
      {
        tokenType: 'unlocked',
        label: 'bob',
        resolverStrategy: 'to-owned-permres',
      },
      {
        tokenType: 'unlocked',
        label: 'carol',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { unwrapped, unlockedGroups } = decode(call.data)
    expect(unwrapped).toHaveLength(0)
    expect(unlockedGroups).toHaveLength(1)
    expect(unlockedGroups[0]).toHaveLength(2)
    expect(unlockedGroups[0]?.[0]?.label).toBe('bob')
    expect(unlockedGroups[0]?.[1]?.label).toBe('carol')
  })
})

// ─── 4. Multiple locked-2ld names → single inner group ───────────────────────

describe('multiple locked-2ld names', () => {
  it('packs all into lockedGroups[0]', () => {
    const call = buildCall([
      {
        tokenType: 'locked-2ld',
        label: 'dave',
        resolverStrategy: 'to-owned-permres',
      },
      {
        tokenType: 'locked-2ld',
        label: 'eve',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { lockedGroups, unlockedGroups } = decode(call.data)
    expect(unlockedGroups).toHaveLength(0)
    expect(lockedGroups).toHaveLength(1)
    expect(lockedGroups[0]).toHaveLength(2)
    expect(lockedGroups[0]?.[0]?.label).toBe('dave')
    expect(lockedGroups[0]?.[1]?.label).toBe('eve')
  })
})

// ─── 5. Empty buckets stay [] not [[]] ───────────────────────────────────────

describe('empty bucket shape', () => {
  it('emits [] (not [[]]) for an absent bucket', () => {
    // only unwrapped names → unlockedGroups and lockedGroups must be []
    const call = buildCall([
      {
        tokenType: 'unwrapped',
        label: 'frank',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { unlockedGroups, lockedGroups, lockedChildrenGroups } = decode(
      call.data,
    )
    expect(unlockedGroups).toHaveLength(0)
    expect(lockedGroups).toHaveLength(0)
    expect(lockedChildrenGroups).toHaveLength(0)
  })
})

// ─── 6. Locked children grouped by parentName ────────────────────────────────

describe('locked children grouped by parentName', () => {
  it('creates one LockedChildren entry per unique parent, DNS-encoded', () => {
    const call = buildCall([
      {
        tokenType: 'locked-child',
        label: 'sub1',
        name: 'sub1.vault.eth',
        parentName: 'vault.eth',
        resolverStrategy: 'to-owned-permres',
      },
      {
        tokenType: 'locked-child',
        label: 'sub2',
        name: 'sub2.vault.eth',
        parentName: 'vault.eth',
        resolverStrategy: 'to-owned-permres',
      },
      {
        tokenType: 'locked-child',
        label: 'sub3',
        name: 'sub3.other.eth',
        parentName: 'other.eth',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { lockedChildrenGroups } = decode(call.data)
    expect(lockedChildrenGroups).toHaveLength(2)

    // Find the vault.eth entry
    const vaultEntry = lockedChildrenGroups.find(
      (e) => e.parentName.startsWith('0x05'), // 'vault' has 5 chars → length prefix byte = 0x05
    )
    expect(vaultEntry).toBeDefined()
    expect(vaultEntry?.groups).toHaveLength(1)
    expect(vaultEntry?.groups[0]).toHaveLength(2)

    // Find the other.eth entry — 'other' is 5 chars too, but parentName differs from vault's
    const otherEntry = lockedChildrenGroups.find(
      (e) => e.parentName !== vaultEntry?.parentName,
    )
    expect(otherEntry).toBeDefined()
    expect(otherEntry?.groups).toHaveLength(1)
    expect(otherEntry?.groups[0]).toHaveLength(1)
    expect(otherEntry?.groups[0]?.[0]?.label).toBe('sub3')
  })

  it('DNS-encoded parentName starts with the right length-prefix byte for vault.eth', () => {
    const call = buildCall([
      {
        tokenType: 'locked-child',
        label: 'sub1',
        name: 'sub1.vault.eth',
        parentName: 'vault.eth',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { lockedChildrenGroups } = decode(call.data)
    expect(lockedChildrenGroups).toHaveLength(1)
    const entry = lockedChildrenGroups[0]
    if (!entry) throw new Error('expected first lockedChildrenGroup')
    // DNS encoding: \x05vault\x03eth\x00 → hex starts with 05
    expect(entry.parentName.slice(0, 4)).toBe('0x05')
  })
})

// ─── 7. detached-child bucketed like locked-child ────────────────────────────

describe('detached-child', () => {
  it('is bucketed like locked-child into lockedChildrenGroups', () => {
    const call = buildCall([
      {
        tokenType: 'detached-child',
        label: 'orphan',
        name: 'orphan.vault.eth',
        parentName: 'vault.eth',
        resolverStrategy: 'to-owned-permres',
      },
    ])
    const { lockedChildrenGroups } = decode(call.data)
    expect(lockedChildrenGroups).toHaveLength(1)
    expect(lockedChildrenGroups[0]?.groups[0]?.[0]?.label).toBe('orphan')
  })
})

// ─── 8. locked-child without parentName throws ───────────────────────────────

describe('locked-child without parentName', () => {
  it('throws when parentName is null', () => {
    expect(() =>
      buildCall([
        {
          tokenType: 'locked-child',
          label: 'broken',
          name: 'broken.eth',
          parentName: null,
          resolverStrategy: 'to-owned-permres',
        },
      ]),
    ).toThrow(/no parent name/i)
  })
})

// ─── 9. Resolver routing ─────────────────────────────────────────────────────

describe('resolver routing', () => {
  it('keep-v1 strategy → v1 resolver address', () => {
    const call = buildCall(
      [
        {
          tokenType: 'unwrapped',
          label: 'alice',
          resolverStrategy: 'keep-v1',
          v1ResolverAddress: V1_RESOLVER,
        },
      ],
      { ownedPermRes: PERM_RES },
    )
    const { unwrapped } = decode(call.data)
    expect(unwrapped[0]?.resolver.toLowerCase()).toBe(V1_RESOLVER.toLowerCase())
  })

  it('to-owned-permres strategy → ownedPermRes address', () => {
    const call = buildCall(
      [
        {
          tokenType: 'unwrapped',
          label: 'alice',
          resolverStrategy: 'to-owned-permres',
          v1ResolverAddress: null,
        },
      ],
      { ownedPermRes: PERM_RES },
    )
    const { unwrapped } = decode(call.data)
    expect(unwrapped[0]?.resolver.toLowerCase()).toBe(PERM_RES.toLowerCase())
  })

  it('keep-v1 strategy with v1ResolverAddress null → falls back to defaultResolver', () => {
    const call = buildCall(
      [
        {
          tokenType: 'unwrapped',
          label: 'alice',
          resolverStrategy: 'keep-v1',
          v1ResolverAddress: null,
        },
      ],
      { ownedPermRes: PERM_RES, defaultResolver: DEFAULT_RESOLVER },
    )
    const { unwrapped } = decode(call.data)
    expect(unwrapped[0]?.resolver.toLowerCase()).toBe(
      DEFAULT_RESOLVER.toLowerCase(),
    )
  })

  it('to-owned-permres strategy with ownedPermRes null → falls back to defaultResolver', () => {
    const call = buildMigrateCall({
      classified: [
        makeClassified({
          tokenType: 'unwrapped',
          label: 'alice',
          resolverStrategy: 'to-owned-permres',
          v1ResolverAddress: null,
        }),
      ],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
    })
    const { unwrapped } = decode(call.data)
    expect(unwrapped[0]?.resolver.toLowerCase()).toBe(
      DEFAULT_RESOLVER.toLowerCase(),
    )
  })

  it('throws when both fall through to zeroAddress: to-owned-permres, ownedPermRes null, defaultResolver zeroAddress', () => {
    expect(() =>
      buildMigrateCall({
        classified: [
          makeClassified({
            tokenType: 'unwrapped',
            label: 'alice',
            resolverStrategy: 'to-owned-permres',
            v1ResolverAddress: null,
          }),
        ],
        migrationOwner: OWNER,
        defaultResolver: zeroAddress,
        ownedPermRes: null,
      }),
    ).toThrow(/zero address/i)
  })
})
