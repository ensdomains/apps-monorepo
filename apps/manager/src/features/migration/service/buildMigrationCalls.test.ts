import { type Address, decodeFunctionData, zeroAddress } from 'viem'
import { assert, describe, expect, it } from 'vitest'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified, OWNER } from './_fixtures'
import {
  buildAllTransferCalls,
  buildUnwrappedTransferCall,
  buildWrappedTransferCall,
  resolverFor,
} from './buildMigrationCalls'

const DEFAULT_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'
const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d003'

const classified = (o: Parameters<typeof makeClassified>[0] = {}) =>
  makeClassified({
    v1ResolverAddress: V1_RESOLVER,
    resolverStrategy: 'keep-v1',
    ...o,
  })

const decodeNameWrapperCall = (data: `0x${string}`) =>
  decodeFunctionData({ abi: NAME_WRAPPER_ABI, data })

describe('resolverFor', () => {
  it.each([
    [
      'keep-v1 with v1 address',
      { resolverStrategy: 'keep-v1' as const },
      V1_RESOLVER,
    ],
    [
      'keep-v1 without v1 address → defaultResolver',
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

describe('buildUnwrappedTransferCall', () => {
  it('targets BaseRegistrar with safeTransferFrom to UnlockedMigrationController', () => {
    const call = buildUnwrappedTransferCall({
      name: classified({ labelhash: '0x2a' }),
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
    })
    expect(call.to).toBe(V1_CONTRACTS.BaseRegistrar)
    expect(call.value).toBe(0n)

    const { functionName, args } = decodeFunctionData({
      abi: BASE_REGISTRAR_ABI,
      data: call.data,
    })
    expect(functionName).toBe('safeTransferFrom')
    const [from, to, tokenId] = args as [Address, Address, bigint, unknown]
    expect(from.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(to.toLowerCase()).toBe(
      V2_CONTRACTS.UnlockedMigrationController.toLowerCase(),
    )
    expect(tokenId).toBe(BigInt('0x2a'))
  })
})

describe('buildWrappedTransferCall', () => {
  it('targets NameWrapper with safeTransferFrom(value=1) to receiver', () => {
    const receiver = V2_CONTRACTS.LockedMigrationController
    const call = buildWrappedTransferCall({
      name: classified({ tokenType: 'locked-2ld', id: '0x99' }),
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      target: receiver,
    })
    expect(call.to).toBe(V1_CONTRACTS.NameWrapper)

    const { functionName, args } = decodeNameWrapperCall(call.data)
    expect(functionName).toBe('safeTransferFrom')
    const [from, to, tokenId, value] = args as [
      Address,
      Address,
      bigint,
      bigint,
      unknown,
    ]
    expect(from.toLowerCase()).toBe(OWNER.toLowerCase())
    expect(to.toLowerCase()).toBe(receiver.toLowerCase())
    expect(tokenId).toBe(BigInt('0x99'))
    expect(value).toBe(1n)
  })
})

describe('buildAllTransferCalls dispatcher', () => {
  const parentRegistry: Address = '0x0000000000000000000000000000000000000a01'
  const build = (names: Parameters<typeof makeClassified>[0][]) =>
    buildAllTransferCalls({
      classified: names.map(classified),
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map([['raffy.eth', parentRegistry]]),
    })

  it.each([
    [
      'unwrapped → BaseRegistrar',
      { tokenType: 'unwrapped' as const },
      V1_CONTRACTS.BaseRegistrar,
      undefined,
    ],
    [
      'unlocked → NameWrapper → UnlockedMigrationController',
      { tokenType: 'unlocked' as const },
      V1_CONTRACTS.NameWrapper,
      V2_CONTRACTS.UnlockedMigrationController,
    ],
    [
      'locked-2ld → NameWrapper → LockedMigrationController',
      { tokenType: 'locked-2ld' as const },
      V1_CONTRACTS.NameWrapper,
      V2_CONTRACTS.LockedMigrationController,
    ],
    [
      'locked-child → NameWrapper → parent registry',
      {
        tokenType: 'locked-child' as const,
        parentName: 'raffy.eth',
        name: 'sub.raffy.eth',
      },
      V1_CONTRACTS.NameWrapper,
      parentRegistry,
    ],
    [
      'detached-child → NameWrapper → parent registry',
      {
        tokenType: 'detached-child' as const,
        parentName: 'raffy.eth',
        name: 'sub.raffy.eth',
      },
      V1_CONTRACTS.NameWrapper,
      parentRegistry,
    ],
  ])('routes %s', (_, overrides, expectedTo, expectedReceiver) => {
    const [call] = build([overrides])
    assert(call)
    expect(call.to).toBe(expectedTo)
    if (expectedReceiver) {
      const { args } = decodeNameWrapperCall(call.data)
      expect((args as [unknown, Address])[1].toLowerCase()).toBe(
        expectedReceiver.toLowerCase(),
      )
    }
  })

  it('throws when the parent registry is missing for a child', () => {
    expect(() =>
      buildAllTransferCalls({
        classified: [
          classified({
            tokenType: 'locked-child',
            parentName: 'missing.eth',
            name: 'sub.missing.eth',
          }),
        ],
        migrationOwner: OWNER,
        defaultResolver: DEFAULT_RESOLVER,
        ownedPermRes: null,
        parentRegistries: new Map(),
      }),
    ).toThrow(/Parent registry not found/i)
  })

  it('preserves order and emits one call per classified name', () => {
    const calls = build([
      { tokenType: 'unwrapped', id: '0x10' },
      { tokenType: 'unlocked', id: '0x11' },
      { tokenType: 'locked-2ld', id: '0x12' },
    ])
    expect(calls.map((c) => c.to)).toEqual([
      V1_CONTRACTS.BaseRegistrar,
      V1_CONTRACTS.NameWrapper,
      V1_CONTRACTS.NameWrapper,
    ])
  })
})
