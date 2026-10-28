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

describe('isUnreachableV1Name', () => {
  const PARENT_RESOLVER = '0x2222222222222222222222222222222222222222' as const
  const reverted = new ContractFunctionRevertedError({
    abi: [],
    functionName: 'REGISTRY_V1',
  })

  // `mirrors` is what the reached resolver answers to `REGISTRY_V1()`.
  it.each([
    {
      case: 'no resolver is reached',
      reached: zeroAddress,
      isUnreachable: true,
    },
    {
      case: 'the registry resolver is reached',
      reached: RESOLVER,
      isUnreachable: false,
    },
    {
      case: 'the ENSv1 mirror resolver is reached',
      reached: PARENT_RESOLVER,
      mirrors: envConfig.chain.contracts.ensLegacyRegistry.address,
      isUnreachable: false,
    },
    {
      case: 'a re-registered parent resolver is reached',
      reached: PARENT_RESOLVER,
      mirrors: reverted,
      isUnreachable: true,
    },
    {
      case: 'the ENSv1 registry holds no resolver',
      reached: zeroAddress,
      registry: null,
      isUnreachable: false,
    },
  ])(
    'is $isUnreachable when $case',
    async ({ reached, mirrors, registry = RESOLVER, isUnreachable }) => {
      vi.mocked(getEnsResolver).mockResolvedValue(reached)
      vi.mocked(readV1RegistryResolver).mockResolvedValue(registry ?? undefined)
      const readContract = vi.fn(async () => {
        if (mirrors instanceof Error) throw mirrors
        return mirrors
      })

      await expect(
        isUnreachableV1Name({ readContract } as unknown as PublicClient, name),
      ).resolves.toBe(isUnreachable)
    },
  )

  it('fails rather than greying out a name when the resolver read fails', async () => {
    vi.mocked(getEnsResolver).mockResolvedValue(PARENT_RESOLVER)
    vi.mocked(readV1RegistryResolver).mockResolvedValue(RESOLVER)
    const readContract = vi.fn(async () => {
      throw new Error('rpc down')
    })

    await expect(
      isUnreachableV1Name({ readContract } as unknown as PublicClient, name),
    ).rejects.toThrow('rpc down')
  })
})
