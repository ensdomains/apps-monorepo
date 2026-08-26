import {
  type Address,
  type Hex,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import {
  type ClassifiedName,
  type CopyClassifiedName,
  type DirectClassifiedName,
  FUSES,
} from './classifyNames'
import {
  assertCopyMigrationReadiness,
  assertCopyMigrationTopology,
  assertCopySourcesFresh,
} from './copyMigrationReadiness'
import { computeUserRegistryAddress } from './userRegistryMigration'

const WALLET: Address = '0x0000000000000000000000000000000000000010'
const OTHER: Address = '0x0000000000000000000000000000000000000011'
const HCA: Address = '0x0000000000000000000000000000000000000012'
const CONFLICT: Address = '0x0000000000000000000000000000000000000013'
const KNOWN_RESOLVER: Address = '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5'
const OTHER_KNOWN_RESOLVER: Address =
  '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD'
const CUSTOM_RESOLVER: Address = '0x0000000000000000000000000000000000000014'
const MAX_UINT64 = (1n << 64n) - 1n
const WRAPPED_EXPIRY = 4_102_444_800n
const CONTRACT_CODE: Hex = '0x6000'

type ReadRequest = {
  readonly address: Address
  readonly functionName: string
  readonly args?: readonly unknown[]
}

type RegistryRoute = {
  readonly registry: Address
  readonly parentRegistry: Address
  readonly label: string
}

type RegistryState = {
  readonly status: number
  readonly expiry: bigint
  readonly latestOwner: Address
  readonly tokenId: bigint
  readonly resource: bigint
}

const sameAddress = (left: Address, right: Address): boolean =>
  left.toLowerCase() === right.toLowerCase()

const contractCodeAt =
  (addresses: readonly Address[]) =>
  (address: Address): Hex | undefined =>
    addresses.some((candidate) => sameAddress(candidate, address))
      ? CONTRACT_CODE
      : undefined

const retryRead = (params: {
  readonly routes: readonly RegistryRoute[]
  readonly implementation?: Address
  readonly rootOwner?: Address
  readonly targetRegistry?: Address
  readonly targetState?: RegistryState
}) => {
  const routeForRegistry = (address: Address) =>
    params.routes.find((route) => sameAddress(route.registry, address))
  const routeForParentLabel = (address: Address, label: unknown) =>
    params.routes.find(
      (route) =>
        sameAddress(route.parentRegistry, address) && route.label === label,
    )

  return ({ functionName, address, args }: ReadRequest): unknown => {
    switch (functionName) {
      case 'ownerOf':
        return params.rootOwner ?? WALLET
      case 'owner':
        return WALLET
      case 'resolver':
        return zeroAddress
      case 'verifyContract':
        return params.implementation ?? V2_CONTRACTS.UserRegistryImpl
      case 'hasRootRoles':
        return true
      case 'getParent': {
        const route = routeForRegistry(address)
        if (route) return [route.parentRegistry, route.label] as const
        break
      }
      case 'getSubregistry': {
        const route = routeForParentLabel(address, args?.[0])
        if (route) return route.registry
        break
      }
      case 'getState':
        if (
          params.targetRegistry &&
          sameAddress(address, params.targetRegistry) &&
          params.targetState
        ) {
          return params.targetState
        }
        break
    }
    throw new Error(`Unexpected read: ${functionName}`)
  }
}

const makeClient = (params: {
  readonly getCode?: (
    address: Address,
  ) => Hex | undefined | Promise<Hex | undefined>
  readonly read: (request: ReadRequest) => unknown
}): PublicClient =>
  ({
    getCode: vi.fn(async ({ address }: { address: Address }) =>
      params.getCode?.(address),
    ),
    readContract: vi.fn(async (request: ReadRequest) => params.read(request)),
  }) as unknown as PublicClient

const migratingRoot = (
  tokenType: 'unwrapped' | 'unlocked' | 'locked-2ld' = 'unwrapped',
): DirectClassifiedName =>
  makeClassified({
    action: 'migrate',
    tokenType,
    id: '0x01',
    name: 'example.eth',
    label: 'example',
    parentName: 'eth',
    tokenHolder: WALLET,
  })

const registryCopy = (
  params: {
    readonly id?: string
    readonly name?: string
    readonly label?: string
    readonly parentName?: string
    readonly resolver?: Address | null
  } = {},
): CopyClassifiedName =>
  makeClassified({
    action: 'copy',
    tokenType: 'registry-child',
    copySource: 'registry',
    sourceExpiry: MAX_UINT64,
    id: params.id ?? '0x02',
    name: params.name ?? 'foo.example.eth',
    label: params.label ?? 'foo',
    parentName: params.parentName ?? 'example.eth',
    tokenHolder: WALLET,
    v1ResolverAddress: params.resolver ?? null,
  })

const wrappedCopy = (resolver: Address | null = null): CopyClassifiedName =>
  makeClassified({
    action: 'copy',
    tokenType: 'unlocked-child',
    copySource: 'name-wrapper',
    sourceExpiry: WRAPPED_EXPIRY,
    id: '0x03',
    name: 'wrapped.example.eth',
    label: 'wrapped',
    parentName: 'example.eth',
    tokenHolder: WALLET,
    v1ResolverAddress: resolver,
  })

const sourceOnlyClient = (
  params: {
    readonly wrappedOwner?: Address
    readonly registryOwner?: Address
    readonly fuses?: bigint
    readonly expiry?: bigint
    readonly resolver?: Address
  } = {},
): PublicClient =>
  makeClient({
    read: ({ functionName }) => {
      if (functionName === 'getData') {
        return [
          params.wrappedOwner ?? WALLET,
          params.fuses ?? 0n,
          params.expiry ?? WRAPPED_EXPIRY,
        ] as const
      }
      if (functionName === 'owner') return params.registryOwner ?? WALLET
      if (functionName === 'resolver') return params.resolver ?? zeroAddress
      throw new Error(`Unexpected read: ${functionName}`)
    },
  })

const expectReason = async (
  result: Promise<void>,
  reason: string,
): Promise<void> => {
  await expect(result).rejects.toMatchObject({ reason })
}

describe('assertCopyMigrationTopology', () => {
  it('fails closed when an ancestor is missing', () => {
    const child = registryCopy({
      name: 'bar.foo.example.eth',
      label: 'bar',
      parentName: 'foo.example.eth',
    })

    expect(() => assertCopyMigrationTopology([migratingRoot(), child])).toThrow(
      expect.objectContaining({ reason: 'invalid-route' }),
    )
  })

  it('rejects a copy tree rooted in a locked 2LD', () => {
    expect(() =>
      assertCopyMigrationTopology([
        migratingRoot('locked-2ld'),
        registryCopy(),
      ]),
    ).toThrow(expect.objectContaining({ reason: 'invalid-route' }))
  })
})

describe('assertCopySourcesFresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts the exact live wrapped owner, expiry, and known resolver', async () => {
    const copy = wrappedCopy(KNOWN_RESOLVER)
    const client = sourceOnlyClient({ resolver: KNOWN_RESOLVER })

    await expect(
      assertCopySourcesFresh({
        publicClient: client,
        wallet: WALLET,
        copies: [copy],
      }),
    ).resolves.toBeUndefined()

    expect(client.readContract).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        address: V1_CONTRACTS.NameWrapper,
        functionName: 'getData',
      }),
    )
  })

  it.each([
    ['wrapped', wrappedCopy(), { wrappedOwner: OTHER }],
    ['registry-only', registryCopy(), { registryOwner: OTHER }],
  ] as const)('rejects a changed %s owner', async (_kind, copy, overrides) => {
    await expectReason(
      assertCopySourcesFresh({
        publicClient: sourceOnlyClient(overrides),
        wallet: WALLET,
        copies: [copy],
      }),
      'source-owner-changed',
    )
  })

  it('rejects a registry-only source without the exact uint64 max expiry', async () => {
    const copy = {
      ...registryCopy(),
      sourceExpiry: MAX_UINT64 - 1n,
    } satisfies CopyClassifiedName

    await expectReason(
      assertCopySourcesFresh({
        publicClient: sourceOnlyClient(),
        wallet: WALLET,
        copies: [copy],
      }),
      'source-expiry-changed',
    )
  })

  it('rejects a wrapped expiry that differs from the frozen value', async () => {
    await expectReason(
      assertCopySourcesFresh({
        publicClient: sourceOnlyClient({ expiry: WRAPPED_EXPIRY + 1n }),
        wallet: WALLET,
        copies: [wrappedCopy()],
      }),
      'source-expiry-changed',
    )
  })

  it('rejects a different supported resolver from the frozen value', async () => {
    await expectReason(
      assertCopySourcesFresh({
        publicClient: sourceOnlyClient({ resolver: OTHER_KNOWN_RESOLVER }),
        wallet: WALLET,
        copies: [wrappedCopy(KNOWN_RESOLVER)],
      }),
      'source-resolver-changed',
    )
  })

  it('rejects a newly configured custom resolver', async () => {
    await expectReason(
      assertCopySourcesFresh({
        publicClient: sourceOnlyClient({ resolver: CUSTOM_RESOLVER }),
        wallet: WALLET,
        copies: [registryCopy()],
      }),
      'unsupported-resolver',
    )
  })
})

describe('assertCopyMigrationReadiness — V2 route safety', () => {
  const root = migratingRoot()
  const copy = registryCopy()
  const rootRegistry = computeUserRegistryAddress({
    hca: HCA,
    parentName: root.domain.name,
  })

  it('rejects an occupied deterministic proxy during an initial attempt', async () => {
    const client = makeClient({
      getCode: (address) =>
        sameAddress(address, rootRegistry) ? CONTRACT_CODE : undefined,
      read: ({ functionName }) => {
        if (functionName === 'ownerOf') return WALLET
        if (functionName === 'owner') return WALLET
        if (functionName === 'resolver') return zeroAddress
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [root, copy],
        registryContext: [root, copy],
      }),
      'unexpected-registry',
    )
  })

  it('rejects a conflicting parent subregistry pointer before deployment', async () => {
    const client = makeClient({
      getCode: (address) =>
        sameAddress(address, V2_CONTRACTS.ETHRegistry)
          ? CONTRACT_CODE
          : undefined,
      read: ({ functionName, address }) => {
        if (functionName === 'ownerOf') return WALLET
        if (functionName === 'owner') return WALLET
        if (functionName === 'resolver') return zeroAddress
        if (
          functionName === 'getSubregistry' &&
          sameAddress(address, V2_CONTRACTS.ETHRegistry)
        ) {
          return CONFLICT
        }
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [root, copy],
        registryContext: [root, copy],
      }),
      'subregistry-conflict',
    )
  })

  it('rejects a migrating 2LD whose live owner changed before approval', async () => {
    const client = makeClient({
      read: ({ functionName }) => {
        if (functionName === 'ownerOf') return OTHER
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [root, copy],
        registryContext: [root, copy],
      }),
      'source-owner-changed',
    )
  })

  it('allows a migrating 2LD to preserve its exact custom resolver', async () => {
    const customRoot = {
      ...root,
      v1ResolverAddress: CUSTOM_RESOLVER,
      resolverStrategy: 'keep-v1',
    } satisfies ClassifiedName
    const client = makeClient({
      read: ({ functionName, args }) => {
        if (functionName === 'ownerOf' || functionName === 'owner') {
          return WALLET
        }
        if (functionName === 'resolver') {
          return args?.[0] === namehash(customRoot.domain.name)
            ? CUSTOM_RESOLVER
            : zeroAddress
        }
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    await expect(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [customRoot, copy],
        registryContext: [customRoot, copy],
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects a migrating unlocked 2LD that became locked', async () => {
    const unlockedBase = migratingRoot('unlocked')
    const unlockedRoot = {
      ...unlockedBase,
      domain: {
        ...unlockedBase.domain,
        wrappedDomain: { expiryDate: WRAPPED_EXPIRY.toString(), fuses: 0 },
      },
    } satisfies ClassifiedName
    const client = makeClient({
      read: ({ functionName }) => {
        if (functionName === 'getData') {
          return [WALLET, FUSES.CANNOT_UNWRAP, WRAPPED_EXPIRY] as const
        }
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [unlockedRoot, copy],
        registryContext: [unlockedRoot, copy],
      }),
      'source-lock-changed',
    )
  })

  it('accepts certified arbitrary-depth parent registries during a retry', async () => {
    const parent = copy
    const child = registryCopy({
      id: '0x04',
      name: 'bar.foo.example.eth',
      label: 'bar',
      parentName: parent.domain.name,
    })
    const parentRegistry = computeUserRegistryAddress({
      hca: HCA,
      parentName: parent.domain.name,
    })
    const client = makeClient({
      getCode: contractCodeAt([
        V2_CONTRACTS.ETHRegistry,
        rootRegistry,
        parentRegistry,
      ]),
      read: retryRead({
        routes: [
          {
            registry: rootRegistry,
            parentRegistry: V2_CONTRACTS.ETHRegistry,
            label: root.label,
          },
          {
            registry: parentRegistry,
            parentRegistry: rootRegistry,
            label: parent.label,
          },
        ],
        targetRegistry: parentRegistry,
        targetState: {
          status: 0,
          expiry: 0n,
          latestOwner: zeroAddress,
          tokenId: 1n,
          resource: 2n,
        },
      }),
    })

    await expect(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [child],
        registryContext: [root, parent, child],
      }),
    ).resolves.toBeUndefined()
  })

  it('checks independent registry routes concurrently and reads each code address once', async () => {
    const parent = copy
    const child = registryCopy({
      id: '0x04',
      name: 'bar.foo.example.eth',
      label: 'bar',
      parentName: parent.domain.name,
    })
    const parentRegistry = computeUserRegistryAddress({
      hca: HCA,
      parentName: parent.domain.name,
    })
    let releaseRootRegistry: (() => void) | undefined
    const rootRegistryGate = new Promise<void>((resolve) => {
      releaseRootRegistry = resolve
    })
    const startedRegistryReads = new Set<string>()
    const client = makeClient({
      getCode: async (address) => {
        if (sameAddress(address, V2_CONTRACTS.ETHRegistry)) {
          return CONTRACT_CODE
        }
        startedRegistryReads.add(address.toLowerCase())
        if (sameAddress(address, rootRegistry)) await rootRegistryGate
        return undefined
      },
      read: ({ functionName }) => {
        if (functionName === 'ownerOf' || functionName === 'owner')
          return WALLET
        if (functionName === 'resolver') return zeroAddress
        if (functionName === 'getSubregistry') return zeroAddress
        throw new Error(`Unexpected read: ${functionName}`)
      },
    })

    const readiness = assertCopyMigrationReadiness({
      publicClient: client,
      hca: HCA,
      wallet: WALLET,
      remaining: [root, parent, child],
      registryContext: [root, parent, child],
    })

    try {
      await vi.waitFor(() => {
        expect(startedRegistryReads).toEqual(
          new Set([rootRegistry.toLowerCase(), parentRegistry.toLowerCase()]),
        )
      })
    } finally {
      releaseRootRegistry?.()
    }
    await expect(readiness).resolves.toBeUndefined()

    const getCode = vi.mocked(client.getCode)
    for (const address of [
      V2_CONTRACTS.ETHRegistry,
      rootRegistry,
      parentRegistry,
    ]) {
      expect(
        getCode.mock.calls.filter(([request]) =>
          sameAddress(request.address, address),
        ),
      ).toHaveLength(1)
    }
    expect(getCode).toHaveBeenCalledTimes(3)
  })

  it('accepts an exact completed root registry only when its durable attempt is recorded', async () => {
    const client = makeClient({
      getCode: contractCodeAt([V2_CONTRACTS.ETHRegistry, rootRegistry]),
      read: retryRead({
        routes: [
          {
            registry: rootRegistry,
            parentRegistry: V2_CONTRACTS.ETHRegistry,
            label: root.label,
          },
        ],
        rootOwner: OTHER,
        targetRegistry: rootRegistry,
        targetState: {
          status: 0,
          expiry: 0n,
          latestOwner: zeroAddress,
          tokenId: 1n,
          resource: 2n,
        },
      }),
    })

    await expect(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [root, copy],
        registryContext: [root, copy],
        recordedAttemptNames: new Set([root.domain.name]),
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects an uncertified existing parent proxy on retry', async () => {
    const client = makeClient({
      getCode: contractCodeAt([V2_CONTRACTS.ETHRegistry, rootRegistry]),
      read: retryRead({
        routes: [
          {
            registry: rootRegistry,
            parentRegistry: V2_CONTRACTS.ETHRegistry,
            label: root.label,
          },
        ],
        implementation: CONFLICT,
      }),
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [copy],
        registryContext: [root, copy],
      }),
      'uncertified-registry',
    )
  })

  it('rejects an available target with prior V2 history', async () => {
    const client = makeClient({
      getCode: contractCodeAt([V2_CONTRACTS.ETHRegistry, rootRegistry]),
      read: retryRead({
        routes: [
          {
            registry: rootRegistry,
            parentRegistry: V2_CONTRACTS.ETHRegistry,
            label: root.label,
          },
        ],
        targetRegistry: rootRegistry,
        targetState: {
          status: 0,
          expiry: 1n,
          latestOwner: zeroAddress,
          tokenId: 1n,
          resource: 2n,
        },
      }),
    })

    await expectReason(
      assertCopyMigrationReadiness({
        publicClient: client,
        hca: HCA,
        wallet: WALLET,
        remaining: [copy],
        registryContext: [root, copy],
      }),
      'v2-name-history',
    )
  })
})
