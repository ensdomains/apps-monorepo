import { err, ok } from 'neverthrow'
import {
  ContractFunctionRevertedError,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { getEnsResolver } from 'viem/actions'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { envConfig } from '@/config'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import {
  classifyV1Reachability,
  getPrimaryNamePreparation,
  isUnreachableV1Name,
} from './primaryNamePreparation'
import {
  getResolverWriteState,
  readV1RegistryResolver,
} from './resolverWriteAccess'

vi.mock('./primaryNameForwardAddress', () => ({
  getPrimaryNameForwardAddress: vi.fn(),
  hasPrimaryNameForwardAddress: vi.fn(),
}))
vi.mock('./resolverWriteAccess', () => ({
  getResolverWriteState: vi.fn(),
  readV1RegistryResolver: vi.fn(),
}))
vi.mock('viem/actions', () => ({ getEnsResolver: vi.fn() }))
vi.mock('./resolverRecordCalls', () => ({
  isOffchainResolver: vi.fn(async () => false),
}))

const client = {} as PublicClient
const owner = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const
const name = 'pookie.eth'
const RESOLVER = '0x1234567890123456789012345678901234567890' as const
const PARENT_RESOLVER = '0x2222222222222222222222222222222222222222' as const

describe('getPrimaryNamePreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not write records when the live forward address already matches', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(owner)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(true)

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({ kind: 'ready' })
    expect(getResolverWriteState).not.toHaveBeenCalled()
  })

  it('sets up a resolver when the name has no forward address or writable resolver', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: undefined, canWrite: false }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      hasResolver: false,
      hasOffchainResolver: false,
    })
    expect(getResolverWriteState).toHaveBeenCalledWith(name, owner)
  })

  it('updates the ETH address on the resolver the probe accepted', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: RESOLVER, canWrite: true }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'update-eth-address',
      existingEthAddress: null,
      resolverAddress: RESOLVER,
    })
  })

  it('provides the live different wallet address for the confirmation warning', async () => {
    const otherAddress = '0x1234567890123456789012345678901234567890'
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(otherAddress)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: RESOLVER, canWrite: true }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'update-eth-address',
      existingEthAddress: otherAddress,
      resolverAddress: RESOLVER,
    })
  })

  it('treats an unset zero-address record as missing in the warning', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(zeroAddress)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: undefined, canWrite: false }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      hasResolver: false,
      hasOffchainResolver: false,
    })
  })

  it('stops on a failed resolver probe instead of assuming setup is safe', async () => {
    const probeError = new Error('RPC unavailable')
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      err(probeError) as Awaited<ReturnType<typeof getResolverWriteState>>,
    )

    await expect(getPrimaryNamePreparation(client, name, owner)).rejects.toBe(
      probeError,
    )
  })

  it('flags a foreign resolver as being replaced', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: RESOLVER, canWrite: false }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      hasResolver: true,
      hasOffchainResolver: false,
    })
  })
})

describe('classifyV1Reachability', () => {
  it.each([
    {
      case: 'no registry resolver',
      v1Resolver: undefined,
      reached: zeroAddress,
      want: 'reachable',
    },
    {
      case: 'no resolver reached',
      v1Resolver: RESOLVER,
      reached: zeroAddress,
      want: 'unreachable',
    },
    {
      case: 'the registry resolver reached',
      v1Resolver: RESOLVER,
      reached: RESOLVER,
      want: 'reachable',
    },
    {
      case: 'another resolver reached',
      v1Resolver: RESOLVER,
      reached: PARENT_RESOLVER,
      want: 'check-mirror',
    },
  ] as const)('$case is $want', ({ v1Resolver, reached, want }) => {
    expect(classifyV1Reachability({ v1Resolver, reached })).toBe(want)
  })
})

describe('isUnreachableV1Name', () => {
  // Only `readContract` is read off the client; the other reads are mocked.
  const clientReading = (read: () => Promise<unknown>) =>
    ({ readContract: vi.fn(read) }) as unknown as PublicClient
  const reverted = new ContractFunctionRevertedError({
    abi: [],
    functionName: 'REGISTRY_V1',
  })

  it.each([
    { reached: zeroAddress, registry: RESOLVER, isUnreachable: true },
    { reached: RESOLVER, registry: RESOLVER, isUnreachable: false },
    { reached: zeroAddress, registry: undefined, isUnreachable: false },
  ])(
    'is $isUnreachable when resolution reaches $reached and the ENSv1 registry holds $registry',
    async ({ reached, registry, isUnreachable }) => {
      vi.mocked(getEnsResolver).mockResolvedValue(reached)
      vi.mocked(readV1RegistryResolver).mockResolvedValue(registry)

      await expect(isUnreachableV1Name(client, name)).resolves.toBe(
        isUnreachable,
      )
    },
  )

  it.each([
    {
      case: 'the ENSv1 mirror',
      read: async () => envConfig.chain.contracts.ensLegacyRegistry.address,
      isUnreachable: false,
    },
    {
      case: 'a re-registered parent resolver',
      read: async () => {
        throw reverted
      },
      isUnreachable: true,
    },
  ])(
    'is $isUnreachable when resolution reaches $case',
    async ({ read, isUnreachable }) => {
      vi.mocked(getEnsResolver).mockResolvedValue(PARENT_RESOLVER)
      vi.mocked(readV1RegistryResolver).mockResolvedValue(RESOLVER)

      await expect(
        isUnreachableV1Name(clientReading(read), name),
      ).resolves.toBe(isUnreachable)
    },
  )

  it('fails rather than greying out a name when the resolver read fails', async () => {
    vi.mocked(getEnsResolver).mockResolvedValue(PARENT_RESOLVER)
    vi.mocked(readV1RegistryResolver).mockResolvedValue(RESOLVER)

    await expect(
      isUnreachableV1Name(
        clientReading(async () => {
          throw new Error('rpc down')
        }),
        name,
      ),
    ).rejects.toThrow('rpc down')
  })
})
