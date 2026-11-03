import { getResolver } from '@ensdomains/ensjs/public'
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
vi.mock('@ensdomains/ensjs/public', () => ({ getResolver: vi.fn() }))

// The chain carries the UniversalResolver the resolver-pointer read needs.
const client: PublicClient = { ...({} as PublicClient), chain: envConfig.chain }
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
      isResolverInvalid: false,
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
      isResolverInvalid: false,
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

  // Only `multicall` (the ERC-165 probe) is read off the client.
  const clientAnswering = (isResolver: boolean) =>
    ({
      chain: envConfig.chain,
      multicall: vi.fn(async () => [
        { status: 'failure', error: new Error('reverted') },
        { status: 'success', result: false },
        { status: 'success', result: false },
        { status: 'success', result: false },
        { status: 'success', result: isResolver },
      ]),
    }) as unknown as PublicClient

  // A resolver the wallet cannot write is either someone else's working
  // resolver or not a resolver at all, such as an EOA; only the second is invalid.
  it.each([
    { label: 'a foreign resolver', isResolver: true },
    { label: 'an address that is not a resolver', isResolver: false },
  ])('flags $label as being replaced', async ({ isResolver }) => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: RESOLVER, canWrite: false }),
    )

    await expect(
      getPrimaryNamePreparation(clientAnswering(isResolver), name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      hasResolver: true,
      hasOffchainResolver: false,
      isResolverInvalid: !isResolver,
    })
  })

  it('stops on a failed resolver-validity read instead of guessing', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: RESOLVER, canWrite: false }),
    )
    const rpcDown = new Error('rpc down')
    const failingClient = {
      multicall: vi.fn(async () => {
        throw rpcDown
      }),
    } as unknown as PublicClient

    await expect(
      getPrimaryNamePreparation(failingClient, name, owner),
    ).rejects.toBe(rpcDown)
  })

  // The UniversalResolver reports no resolver when the pointer is not a
  // contract (an ENSv1 name pointing at an EOA), so the raw pointer decides.
  it.each([
    { label: 'an EOA pointer', pointer: owner, isResolverInvalid: true },
    { label: 'no pointer', pointer: null, isResolverInvalid: false },
  ])(
    'reads the resolver pointer behind no reachable resolver: $label',
    async ({ pointer, isResolverInvalid }) => {
      vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
      vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
      vi.mocked(getResolverWriteState).mockResolvedValue(
        ok({ resolverAddress: undefined, canWrite: false }),
      )
      vi.mocked(getResolver).mockResolvedValue(pointer)

      await expect(
        getPrimaryNamePreparation(clientAnswering(false), name, owner),
      ).resolves.toEqual({
        kind: 'setup-resolver',
        existingEthAddress: null,
        hasResolver: false,
        hasOffchainResolver: false,
        isResolverInvalid,
      })
    },
  )

  it('stops on a failed resolver-pointer read instead of guessing', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: undefined, canWrite: false }),
    )
    const rpcDown = new Error('rpc down')
    vi.mocked(getResolver).mockRejectedValue(rpcDown)

    await expect(
      getPrimaryNamePreparation(clientAnswering(true), name, owner),
    ).rejects.toBe(rpcDown)
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
