import { type Address, decodeFunctionData, toHex, zeroAddress } from 'viem'
import { packetToBytes } from 'viem/ens'
import { describe, expect, it } from 'vitest'
import { MIGRATION_HELPER_ABI } from '../contracts/abis'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, OTHER, OWNER } from './_fixtures'
import {
  buildMigrationHelperCall,
  buildMigrationHelperPayload,
  resolverFor,
} from './buildMigrationCalls'

const DEFAULT_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'
const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d003'

const dnsPacketHex = (name: string) => toHex(packetToBytes(name))

const classified = (o: Parameters<typeof makeClassified>[0] = {}) =>
  makeClassified({
    v1ResolverAddress: V1_RESOLVER,
    resolverStrategy: 'keep-v1',
    ...o,
  })

describe('resolverFor', () => {
  it.each([
    [
      'keep-v1 with v1 address',
      { resolverStrategy: 'keep-v1' as const },
      V1_RESOLVER,
    ],
    [
      'keep-v1 without v1 address -> defaultResolver',
      { resolverStrategy: 'keep-v1' as const, v1ResolverAddress: null },
      DEFAULT_RESOLVER,
    ],
    [
      'to-owned-permres with permRes',
      { resolverStrategy: 'to-owned-permres' as const },
      PERM_RES,
    ],
  ])('returns %s', (_, overrides, expected) => {
    expect(resolverFor(classified(overrides), DEFAULT_RESOLVER, PERM_RES)).toBe(
      expected,
    )
  })

  it('falls back to defaultResolver when to-owned-permres has null permres', () => {
    expect(
      resolverFor(
        classified({ resolverStrategy: 'to-owned-permres' }),
        DEFAULT_RESOLVER,
        null,
      ),
    ).toBe(DEFAULT_RESOLVER)
  })

  it('throws when all fallbacks resolve to the zero address', () => {
    expect(() =>
      resolverFor(
        classified({ resolverStrategy: 'to-owned-permres' }),
        zeroAddress,
        null,
      ),
    ).toThrow(/zero address/i)
  })
})

describe('buildMigrationHelperPayload', () => {
  const build = (names: Parameters<typeof makeClassified>[0][]) =>
    buildMigrationHelperPayload({
      classified: names.map(classified),
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
    })

  it('builds the mixed 2LD + 3LD helper shape', () => {
    const payload = build([
      { tokenType: 'unwrapped', label: 'alice', name: 'alice.eth' },
      {
        tokenType: 'unlocked',
        label: 'bob',
        name: 'bob.eth',
        tokenHolder: OWNER,
      },
      {
        tokenType: 'locked-2ld',
        label: 'raffy',
        name: 'raffy.eth',
        tokenHolder: OWNER,
      },
      {
        tokenType: 'locked-child',
        label: 'sub',
        name: 'sub.raffy.eth',
        parentName: 'raffy.eth',
        tokenHolder: OWNER,
      },
      {
        tokenType: 'detached-child',
        label: 'detached',
        name: 'detached.raffy.eth',
        parentName: 'raffy.eth',
        tokenHolder: OWNER,
      },
    ])

    expect(payload.unwrapped.map((d) => d.label)).toEqual(['alice'])
    expect(payload.unlockedGroups.map((g) => g.map((d) => d.label))).toEqual([
      ['bob'],
    ])
    expect(payload.lockedGroups.map((g) => g.map((d) => d.label))).toEqual([
      ['raffy'],
    ])
    expect(payload.lockedChildrenGroups).toEqual([
      {
        parentName: dnsPacketHex('raffy.eth'),
        groups: [
          [
            expect.objectContaining({ label: 'sub' }),
            expect.objectContaining({ label: 'detached' }),
          ],
        ],
      },
    ])
  })

  it('groups wrapped names by tokenHolder because safeBatchTransferFrom has one from address', () => {
    const payload = build([
      { tokenType: 'unlocked', label: 'owned', tokenHolder: OWNER },
      { tokenType: 'unlocked', label: 'approved', tokenHolder: OTHER },
    ])

    expect(payload.unlockedGroups.map((g) => g.map((d) => d.label))).toEqual([
      ['owned'],
      ['approved'],
    ])
  })

  it('groups locked children by DNS-encoded parent name and then tokenHolder', () => {
    const payload = build([
      {
        tokenType: 'locked-child',
        label: 'a',
        name: 'a.raffy.eth',
        parentName: 'raffy.eth',
        tokenHolder: OWNER,
      },
      {
        tokenType: 'locked-child',
        label: 'b',
        name: 'b.raffy.eth',
        parentName: 'raffy.eth',
        tokenHolder: OTHER,
      },
    ])

    expect(payload.lockedChildrenGroups).toHaveLength(1)
    expect(payload.lockedChildrenGroups[0]?.parentName).toBe(
      dnsPacketHex('raffy.eth'),
    )
    expect(
      payload.lockedChildrenGroups[0]?.groups.map((g) => g.map((d) => d.label)),
    ).toEqual([['a'], ['b']])
  })

  it('orders child parent groups by name depth before lexical tie-breaks', () => {
    const payload = build([
      {
        tokenType: 'locked-child',
        label: 'deep',
        name: 'deep.sub.raffy.eth',
        parentName: 'sub.raffy.eth',
      },
      {
        tokenType: 'locked-child',
        label: 'shallow',
        name: 'shallow.raffy.eth',
        parentName: 'raffy.eth',
      },
    ])

    expect(payload.lockedChildrenGroups.map((g) => g.parentName)).toEqual([
      dnsPacketHex('raffy.eth'),
      dnsPacketHex('sub.raffy.eth'),
    ])
  })
})

describe('buildMigrationHelperCall', () => {
  it('targets MigrationHelper.migrate without per-token safeTransferFrom calls', () => {
    const payload = buildMigrationHelperPayload({
      classified: [
        classified({ tokenType: 'unwrapped', label: 'alice' }),
        classified({ tokenType: 'unlocked', label: 'bob' }),
      ],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
    })

    const call = buildMigrationHelperCall(payload)
    expect(call.to).toBe(V2_CONTRACTS.MigrationHelper)
    expect(call.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: MIGRATION_HELPER_ABI,
      data: call.data,
    })
    expect(functionName).toBe('migrate')
    if (!args) throw new Error('migrate args were not decoded')
    expect(args[0]).toHaveLength(1)
    expect(args[1]).toHaveLength(1)
    expect(call.data).not.toContain('b88d4fde')
    expect(call.data).not.toContain('f242432a')
  })
})
