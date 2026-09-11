import { ROLES_ALL, verifyStandaloneHca } from '@ens-apps/smart-account'
import {
  type Address,
  keccak256,
  type PublicClient,
  zeroAddress as ZERO_ADDRESS,
} from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { V2_CONTRACTS } from '../contracts/addresses'
import { makeClassified } from './_fixtures'
import { FUSES } from './classifyNames'
import { computeExpectedWrapperRegistry } from './directMigrationRoutes'
import {
  assertLockedPublicResolverSetMembership,
  assertMigrationHelperRuntimeCode,
  assertNoLiveSubregistryOverwrite,
  assertRequiredMigrationContractCode,
  checkMigrationHcaReadiness,
  checkMigrationResolverReadiness,
  getMigrationResolverAddress,
  MigrationContractInvariantError,
  REQUIRED_MIGRATION_CONTRACTS,
} from './migrationInvariants'

vi.mock('@ens-apps/smart-account', async (importActual) => ({
  ...(await importActual<typeof import('@ens-apps/smart-account')>()),
  verifyStandaloneHca: vi.fn(),
}))

const verifyStandaloneHcaMock = vi.mocked(verifyStandaloneHca)
const HCA: Address = '0x0000000000000000000000000000000000000001'
const WALLET: Address = '0x0000000000000000000000000000000000000002'
const RESOLVER: Address = '0x0000000000000000000000000000000000000003'
const OTHER_IMPLEMENTATION: Address =
  '0x0000000000000000000000000000000000000004'
const KNOWN_PUBLIC_RESOLVER: Address =
  '0x640294a2b2d87e7f522db3e3e3e876764bce170d'
const CUSTOM_RESOLVER: Address = '0x0000000000000000000000000000000000000005'

const makePublicClient = () =>
  ({
    getCode: vi.fn(),
    readContract: vi.fn(),
  }) as unknown as PublicClient

beforeEach(() => {
  verifyStandaloneHcaMock.mockReset()
})

describe('assertRequiredMigrationContractCode', () => {
  it('accepts the pinned namespace when every required address has code', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')

    await expect(
      assertRequiredMigrationContractCode({ publicClient }),
    ).resolves.toBeUndefined()
  })

  it('requires MigrationHelper bytecode for the HCA helper route', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')

    await expect(
      assertRequiredMigrationContractCode({ publicClient }),
    ).resolves.toBeUndefined()
    expect(
      REQUIRED_MIGRATION_CONTRACTS.map(([contractName]) => contractName),
    ).toContain('MigrationHelper')
  })

  it.each([
    ['PublicResolverSet', V2_CONTRACTS.PublicResolverSet],
    ['UserRegistryImpl', V2_CONTRACTS.UserRegistryImpl],
    ['WrapperRegistryImpl', V2_CONTRACTS.WrapperRegistryImpl],
  ] as const)('identifies %s when the configured contract is missing code', async (contractName, missingAddress) => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockImplementation(async ({ address }) =>
      address === missingAddress ? undefined : '0x01',
    )

    await expect(
      assertRequiredMigrationContractCode({ publicClient }),
    ).rejects.toMatchObject({
      invariant: 'missing-code',
      contractName,
      address: missingAddress,
    })
  })
})

describe('assertMigrationHelperRuntimeCode', () => {
  it('accepts the pinned helper runtime hash', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')

    await expect(
      assertMigrationHelperRuntimeCode({
        publicClient,
        expectedRuntimeCodeHash: keccak256('0x01'),
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects helper bytecode from a different deployment', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')

    await expect(
      assertMigrationHelperRuntimeCode({ publicClient }),
    ).rejects.toMatchObject({
      invariant: 'bytecode-hash',
      contractName: 'MigrationHelper',
      address: V2_CONTRACTS.MigrationHelper,
      actual: keccak256('0x01'),
    })
  })
})

describe('assertLockedPublicResolverSetMembership', () => {
  it('checks each known resolver used by a locked CANNOT_SET_RESOLVER name once', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.readContract).mockResolvedValue(true)
    const locked = makeClassified({
      tokenType: 'locked-2ld',
      fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
    })

    await expect(
      assertLockedPublicResolverSetMembership({
        publicClient,
        names: [
          locked,
          { ...locked, domain: { ...locked.domain, id: '0x02' } },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(publicClient.readContract).toHaveBeenCalledOnce()
    expect(publicClient.readContract).toHaveBeenCalledWith({
      address: V2_CONTRACTS.PublicResolverSet,
      abi: expect.any(Array),
      functionName: 'includes',
      args: [KNOWN_PUBLIC_RESOLVER],
    })
  })

  it('ignores custom resolvers and names whose resolver can still be changed', async () => {
    const publicClient = makePublicClient()

    await expect(
      assertLockedPublicResolverSetMembership({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-child',
            fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
            resolverStrategy: 'keep-v1',
            v1ResolverAddress: CUSTOM_RESOLVER,
          }),
          makeClassified({
            tokenType: 'locked-2ld',
            fuses: FUSES.CANNOT_UNWRAP,
            resolverStrategy: 'to-owned-permres',
            v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
          }),
          makeClassified({
            tokenType: 'unlocked',
            fuses: FUSES.CANNOT_SET_RESOLVER,
            resolverStrategy: 'to-owned-permres',
            v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
          }),
        ],
      }),
    ).resolves.toBeUndefined()
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('fails closed when the pinned set excludes the resolver', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.readContract).mockResolvedValue(false)

    await expect(
      assertLockedPublicResolverSetMembership({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-2ld',
            fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
            resolverStrategy: 'keep-v1',
            v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
          }),
        ],
      }),
    ).rejects.toMatchObject({
      invariant: 'public-resolver-set-membership',
      contractName: 'PublicResolverSet',
      address: KNOWN_PUBLIC_RESOLVER,
      expected: 'included',
      actual: 'not-included',
    })
  })

  it('fails closed when membership cannot be read', async () => {
    const publicClient = makePublicClient()
    const cause = new Error('rpc unavailable')
    vi.mocked(publicClient.readContract).mockRejectedValue(cause)

    await expect(
      assertLockedPublicResolverSetMembership({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-child',
            fuses: FUSES.CANNOT_UNWRAP | FUSES.CANNOT_SET_RESOLVER,
            resolverStrategy: 'keep-v1',
            v1ResolverAddress: KNOWN_PUBLIC_RESOLVER,
          }),
        ],
      }),
    ).rejects.toMatchObject({
      invariant: 'public-resolver-set-membership',
      actual: 'unverified',
      cause,
    })
  })
})

describe('assertNoLiveSubregistryOverwrite', () => {
  const LIVE_REGISTRY: Address = '0x00000000000000000000000000000000000000aa'

  const makeRegistryClient = (params: {
    readonly subregistry?: Address
    readonly hasCode?: boolean
  }) => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue(
      params.hasCode === false ? '0x' : '0x01',
    )
    vi.mocked(publicClient.readContract).mockResolvedValue(
      params.subregistry ?? ZERO_ADDRESS,
    )
    return publicClient
  }

  it('allows a 2LD whose destination entry has no subregistry yet', async () => {
    const publicClient = makeRegistryClient({})

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [makeClassified({ tokenType: 'unwrapped', label: 'alice' })],
      }),
    ).resolves.toBeUndefined()

    expect(publicClient.readContract).toHaveBeenCalledWith({
      address: V2_CONTRACTS.ETHRegistry,
      abi: expect.any(Array),
      functionName: 'getSubregistry',
      args: ['alice'],
    })
  })

  it('fails closed when the entry already points at a live child registry', async () => {
    const publicClient = makeRegistryClient({ subregistry: LIVE_REGISTRY })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [makeClassified({ tokenType: 'unlocked', label: 'alice' })],
      }),
    ).rejects.toMatchObject({
      invariant: 'live-subregistry-overwrite',
      contractName: 'DestinationRegistry',
      ensName: 'alice.eth',
      expected: ZERO_ADDRESS,
      actual: LIVE_REGISTRY,
    })
  })

  it('allows a locked name already pointing at its deterministic wrapper', async () => {
    const publicClient = makeRegistryClient({
      subregistry: computeExpectedWrapperRegistry({ name: 'alice.eth' }),
    })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-2ld',
            label: 'alice',
            fuses: FUSES.CANNOT_UNWRAP,
          }),
        ],
      }),
    ).resolves.toBeUndefined()
  })

  it('still refuses a locked name whose entry points somewhere else', async () => {
    const publicClient = makeRegistryClient({ subregistry: LIVE_REGISTRY })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-2ld',
            label: 'alice',
            fuses: FUSES.CANNOT_UNWRAP,
          }),
        ],
      }),
    ).rejects.toMatchObject({
      invariant: 'live-subregistry-overwrite',
      expected: computeExpectedWrapperRegistry({ name: 'alice.eth' }),
      actual: LIVE_REGISTRY,
    })
  })

  it('reads a child entry from the parent WrapperRegistry', async () => {
    const publicClient = makeRegistryClient({})

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'detached-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
          }),
        ],
      }),
    ).resolves.toBeUndefined()

    expect(publicClient.readContract).toHaveBeenCalledWith({
      address: computeExpectedWrapperRegistry({ name: 'alice.eth' }),
      abi: expect.any(Array),
      functionName: 'getSubregistry',
      args: ['sub'],
    })
  })

  it('skips children whose parent wrapper is created by the same migration', async () => {
    const publicClient = makeRegistryClient({ subregistry: LIVE_REGISTRY })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'locked-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
            fuses: FUSES.CANNOT_UNWRAP,
          }),
        ],
      }),
    ).rejects.toMatchObject({ invariant: 'live-subregistry-overwrite' })

    const parent = makeClassified({
      tokenType: 'locked-2ld',
      label: 'alice',
      fuses: FUSES.CANNOT_UNWRAP,
    })
    const childClient = makeRegistryClient({ subregistry: LIVE_REGISTRY })
    vi.mocked(childClient.readContract).mockImplementation(({ args }) =>
      Promise.resolve(args?.[0] === 'alice' ? ZERO_ADDRESS : LIVE_REGISTRY),
    )

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient: childClient,
        names: [
          parent,
          makeClassified({
            tokenType: 'locked-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
            fuses: FUSES.CANNOT_UNWRAP,
          }),
        ],
      }),
    ).resolves.toBeUndefined()
  })

  it('never reads a copied name from ETHRegistry by its own label', async () => {
    // `sub.eth` is an unrelated 2LD. Reading its pointer for `sub.alice.eth`
    // would refuse — or pass — the copy on someone else's registry.
    const publicClient = makeRegistryClient({ subregistry: LIVE_REGISTRY })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'registry-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
          }),
        ],
      }),
    ).resolves.toBeUndefined()
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('leaves the UserRegistry route to copy readiness and checks the rest', async () => {
    const publicClient = makeRegistryClient({})

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          // Parent of a copy: its entry receives a UserRegistry, not address(0).
          makeClassified({ tokenType: 'unwrapped', label: 'alice' }),
          makeClassified({
            tokenType: 'unlocked-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
          }),
          makeClassified({
            tokenType: 'unwrapped',
            label: 'bob',
            name: 'bob.eth',
          }),
        ],
      }),
    ).resolves.toBeUndefined()

    expect(publicClient.readContract).toHaveBeenCalledOnce()
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: V2_CONTRACTS.ETHRegistry,
        args: ['bob'],
      }),
    )
  })

  it('skips a destination registry that is not deployed', async () => {
    const publicClient = makeRegistryClient({ hasCode: false })

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [
          makeClassified({
            tokenType: 'detached-child',
            label: 'sub',
            name: 'sub.alice.eth',
            parentName: 'alice.eth',
          }),
        ],
      }),
    ).resolves.toBeUndefined()
    expect(publicClient.readContract).not.toHaveBeenCalled()
  })

  it('fails closed when the pointer cannot be read', async () => {
    const publicClient = makeRegistryClient({})
    const cause = new Error('rpc unavailable')
    vi.mocked(publicClient.readContract).mockRejectedValue(cause)

    await expect(
      assertNoLiveSubregistryOverwrite({
        publicClient,
        names: [makeClassified({ tokenType: 'unwrapped', label: 'alice' })],
      }),
    ).rejects.toMatchObject({
      invariant: 'live-subregistry-overwrite',
      actual: 'unverified',
      cause,
    })
  })
})

describe('checkMigrationHcaReadiness', () => {
  it('allows a counterfactual HCA but marks deployment as required', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue(undefined)
    vi.mocked(publicClient.readContract).mockResolvedValueOnce(true)

    await expect(
      checkMigrationHcaReadiness({
        publicClient,
        hca: HCA,
        expectedOwner: WALLET,
      }),
    ).resolves.toEqual({ status: 'deployment-required', hca: HCA })
    expect(verifyStandaloneHcaMock).not.toHaveBeenCalled()
  })

  it('blocks direct deployment when the configured implementation is not approved', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue(undefined)
    vi.mocked(publicClient.readContract).mockResolvedValueOnce(false)

    await expect(
      checkMigrationHcaReadiness({
        publicClient,
        hca: HCA,
        expectedOwner: WALLET,
      }),
    ).rejects.toMatchObject({
      invariant: 'hca-implementation-approved',
      contractName: 'StandaloneHCAImplementation',
    })
  })

  it('reuses the shared factory/owner/accountId/implementation verifier', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')
    verifyStandaloneHcaMock.mockResolvedValueOnce(
      V2_CONTRACTS.StandaloneHCAImplementation,
    )

    await expect(
      checkMigrationHcaReadiness({
        publicClient,
        hca: HCA,
        expectedOwner: WALLET,
      }),
    ).resolves.toEqual({
      status: 'verified',
      hca: HCA,
      implementation: V2_CONTRACTS.StandaloneHCAImplementation,
    })
    expect(verifyStandaloneHcaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicClient,
        hca: HCA,
        expectedOwner: WALLET,
      }),
    )
  })
})

describe('checkMigrationResolverReadiness', () => {
  it('verifies the implementation and reports HCA/wallet grants separately', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')
    vi.mocked(publicClient.readContract)
      .mockResolvedValueOnce(V2_CONTRACTS.PermissionedResolverImpl)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(
      checkMigrationResolverReadiness({
        publicClient,
        resolver: RESOLVER,
        hca: HCA,
        wallet: WALLET,
      }),
    ).resolves.toEqual({
      status: 'verified',
      resolver: RESOLVER,
      implementation: V2_CONTRACTS.PermissionedResolverImpl,
      hcaHasRootRoles: true,
      walletHasWildcardRoles: false,
    })

    const roleReads = vi
      .mocked(publicClient.readContract)
      .mock.calls.slice(1)
      .map(([request]) => request)
    expect(roleReads).toMatchObject([
      { functionName: 'hasRootRoles', args: [ROLES_ALL, HCA] },
      { functionName: 'hasRootRoles', args: [ROLES_ALL, WALLET] },
    ])
  })

  it('rejects a resolver proxy with the wrong implementation', async () => {
    const publicClient = makePublicClient()
    vi.mocked(publicClient.getCode).mockResolvedValue('0x01')
    vi.mocked(publicClient.readContract).mockResolvedValueOnce(
      OTHER_IMPLEMENTATION,
    )

    await expect(
      checkMigrationResolverReadiness({
        publicClient,
        resolver: RESOLVER,
        hca: HCA,
        wallet: WALLET,
      }),
    ).rejects.toBeInstanceOf(MigrationContractInvariantError)
  })

  it('derives the resolver from the shared HCA manifest', () => {
    expect(getMigrationResolverAddress(HCA)).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})
