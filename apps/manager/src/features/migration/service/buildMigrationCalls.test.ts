import { type Address, decodeFunctionData, zeroAddress } from 'viem'
import { assert, describe, expect, it } from 'vitest'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildAllTransferCalls,
  buildUnwrappedTransferCall,
  buildWrappedTransferCall,
  resolverFor,
} from './buildMigrationCalls'
import type { ClassifiedName } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const DEFAULT_RESOLVER: Address = '0x000000000000000000000000000000000000d001'
const PERM_RES: Address = '0x000000000000000000000000000000000000d002'
const V1_RESOLVER: Address = '0x000000000000000000000000000000000000d003'

type Overrides = {
  tokenType?: ClassifiedName['tokenType']
  resolverStrategy?: ClassifiedName['resolverStrategy']
  v1ResolverAddress?: string | null
  parentName?: string | null
  name?: string
  labelhash?: string
  id?: string
  fuses?: number
}

const makeClassified = (o: Overrides = {}): ClassifiedName => ({
  tokenType: o.tokenType ?? 'unwrapped',
  label: 'alice',
  parentName: o.parentName === undefined ? 'eth' : o.parentName,
  fuses: o.fuses ?? 0,
  tokenHolder: OWNER,
  v1ResolverAddress:
    o.v1ResolverAddress === undefined ? V1_RESOLVER : o.v1ResolverAddress,
  resolverStrategy: o.resolverStrategy ?? 'keep-v1',
  managerAddress: null,
  domain: {
    id: o.id ?? '0x01',
    labelhash: o.labelhash ?? '0x02',
    name: o.name ?? 'alice.eth',
  } as unknown as V1Domain,
})

describe('resolverFor', () => {
  it('returns v1 resolver when strategy is keep-v1', () => {
    const name = makeClassified({ resolverStrategy: 'keep-v1' })
    expect(resolverFor(name, DEFAULT_RESOLVER, PERM_RES)).toBe(V1_RESOLVER)
  })

  it('falls back to defaultResolver when keep-v1 has no v1 address', () => {
    const name = makeClassified({
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: null,
    })
    expect(resolverFor(name, DEFAULT_RESOLVER, PERM_RES)).toBe(DEFAULT_RESOLVER)
  })

  it('returns ownedPermRes when strategy is to-owned-permres', () => {
    const name = makeClassified({ resolverStrategy: 'to-owned-permres' })
    expect(resolverFor(name, DEFAULT_RESOLVER, PERM_RES)).toBe(PERM_RES)
  })

  it('falls back to defaultResolver when ownedPermRes is null', () => {
    const name = makeClassified({ resolverStrategy: 'to-owned-permres' })
    expect(resolverFor(name, DEFAULT_RESOLVER, null)).toBe(DEFAULT_RESOLVER)
  })

  it('throws when all fallbacks resolve to the zero address', () => {
    const name = makeClassified({
      resolverStrategy: 'to-owned-permres',
    })
    expect(() => resolverFor(name, zeroAddress, null)).toThrow(/zero address/i)
  })
})

describe('buildUnwrappedTransferCall', () => {
  it('targets BaseRegistrar and uses the UnlockedMigrationController as receiver', () => {
    const name = makeClassified({ labelhash: '0x2a' })
    const call = buildUnwrappedTransferCall({
      name,
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
  it('targets NameWrapper and forwards the given receiver', () => {
    const name = makeClassified({ tokenType: 'locked-2ld', id: '0x99' })
    const receiver: Address = V2_CONTRACTS.LockedMigrationController
    const call = buildWrappedTransferCall({
      name,
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      target: receiver,
    })

    expect(call.to).toBe(V1_CONTRACTS.NameWrapper)
    const { functionName, args } = decodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      data: call.data,
    })
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

  it('routes unwrapped names to BaseRegistrar → UnlockedMigrationController', () => {
    const [call] = buildAllTransferCalls({
      classified: [makeClassified({ tokenType: 'unwrapped' })],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map(),
    })
    expect(call?.to).toBe(V1_CONTRACTS.BaseRegistrar)
  })

  it('routes unlocked names to NameWrapper → UnlockedMigrationController', () => {
    const [call] = buildAllTransferCalls({
      classified: [makeClassified({ tokenType: 'unlocked' })],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map(),
    })
    assert(call)
    expect(call.to).toBe(V1_CONTRACTS.NameWrapper)
    const { args } = decodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      data: call.data,
    })
    expect((args as [unknown, Address])[1].toLowerCase()).toBe(
      V2_CONTRACTS.UnlockedMigrationController.toLowerCase(),
    )
  })

  it('routes locked-2ld names to NameWrapper → LockedMigrationController', () => {
    const [call] = buildAllTransferCalls({
      classified: [makeClassified({ tokenType: 'locked-2ld' })],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map(),
    })
    assert(call)
    const { args } = decodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      data: call.data,
    })
    expect((args as [unknown, Address])[1].toLowerCase()).toBe(
      V2_CONTRACTS.LockedMigrationController.toLowerCase(),
    )
  })

  it('routes locked-child to the parent WrapperRegistry', () => {
    const [call] = buildAllTransferCalls({
      classified: [
        makeClassified({
          tokenType: 'locked-child',
          parentName: 'raffy.eth',
          name: 'sub.raffy.eth',
        }),
      ],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map([['raffy.eth', parentRegistry]]),
    })
    assert(call)
    const { args } = decodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      data: call.data,
    })
    expect((args as [unknown, Address])[1].toLowerCase()).toBe(
      parentRegistry.toLowerCase(),
    )
  })

  it('routes detached-child to the parent WrapperRegistry', () => {
    const [call] = buildAllTransferCalls({
      classified: [
        makeClassified({
          tokenType: 'detached-child',
          parentName: 'raffy.eth',
          name: 'sub.raffy.eth',
        }),
      ],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map([['raffy.eth', parentRegistry]]),
    })
    assert(call)
    const { args } = decodeFunctionData({
      abi: NAME_WRAPPER_ABI,
      data: call.data,
    })
    expect((args as [unknown, Address])[1].toLowerCase()).toBe(
      parentRegistry.toLowerCase(),
    )
  })

  it('throws when the parent registry is missing for a child', () => {
    expect(() =>
      buildAllTransferCalls({
        classified: [
          makeClassified({
            tokenType: 'locked-child',
            parentName: 'raffy.eth',
            name: 'sub.raffy.eth',
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
    const calls = buildAllTransferCalls({
      classified: [
        makeClassified({ tokenType: 'unwrapped', id: '0x10' }),
        makeClassified({ tokenType: 'unlocked', id: '0x11' }),
        makeClassified({ tokenType: 'locked-2ld', id: '0x12' }),
      ],
      migrationOwner: OWNER,
      defaultResolver: DEFAULT_RESOLVER,
      ownedPermRes: null,
      parentRegistries: new Map(),
    })
    expect(calls).toHaveLength(3)
    expect(calls[0]?.to).toBe(V1_CONTRACTS.BaseRegistrar)
    expect(calls[1]?.to).toBe(V1_CONTRACTS.NameWrapper)
    expect(calls[2]?.to).toBe(V1_CONTRACTS.NameWrapper)
  })
})
