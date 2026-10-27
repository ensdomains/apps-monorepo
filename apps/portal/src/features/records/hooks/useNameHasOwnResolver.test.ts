import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const V1_REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e' as Address
/** The registry holding the leaf label of `ens.eth`. */
const ETH_REGISTRY = '0x1111111111111111111111111111111111111111' as Address
const ROOT_REGISTRY = '0x2222222222222222222222222222222222222222' as Address
const OWN_RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address

const { readContract, getRegistries } = vi.hoisted(() => ({
  readContract: vi.fn(),
  getRegistries: vi.fn(),
}))

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok({
      chain: {
        id: 11155111,
        contracts: { ensLegacyRegistry: { address: V1_REGISTRY } },
      },
    }),
}))
vi.mock('@ensdomains/ensjs/public/v2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ensdomains/ensjs/public/v2')>()),
  getNameRegistries: getRegistries,
}))
vi.mock('viem/actions', () => ({ readContract }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => readContract,
}))

const { getNameHasOwnResolver } = await import('./useNameHasOwnResolver')

/** The registries `findRegistries` reports leaf-first, and the label's slot. */
const stubV2Reads = ({
  registries = [zeroAddress, ETH_REGISTRY, ROOT_REGISTRY],
  resolver = OWN_RESOLVER,
}: {
  registries?: readonly Address[]
  resolver?: Address
} = {}) => {
  getRegistries.mockResolvedValue(registries)
  readContract.mockResolvedValue(resolver)
}

describe('getNameHasOwnResolver', () => {
  beforeEach(() => {
    readContract.mockReset()
    getRegistries.mockReset()
  })

  describe('ENSv2 — the registry slot', () => {
    it('is true when the registry holding the label names a resolver', async () => {
      stubV2Reads()

      const result = await getNameHasOwnResolver({
        name: 'ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(true)
    })

    it("asks the name's own registry slot, not the resolver it resolves through", async () => {
      stubV2Reads()

      await getNameHasOwnResolver({
        name: 'ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ETH_REGISTRY,
          functionName: 'getResolver',
          args: ['ens'],
        }),
      )
    })

    it('is false when the resolver is inherited from an ancestor', async () => {
      // A subname with no resolver of its own still resolves through its
      // parent's, which takes no writes.
      stubV2Reads({ resolver: zeroAddress })

      const result = await getNameHasOwnResolver({
        name: 'sub.ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(false)
    })

    it('is false when no registry holds the name', async () => {
      stubV2Reads({ registries: [zeroAddress, zeroAddress, ROOT_REGISTRY] })

      const result = await getNameHasOwnResolver({
        name: 'nope.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(false)
      expect(readContract).not.toHaveBeenCalled()
    })
  })

  describe('ENSv1 — the legacy registry slot', () => {
    it('asks the legacy registry, not the UniversalResolver', async () => {
      // The v2 walk has no slot for a v1 name: for an imported DNS 2LD it
      // stops at the TLD's composite mirror, which would read as "inherited"
      // however the name is actually configured (WEB-125).
      readContract.mockResolvedValue(OWN_RESOLVER)

      await getNameHasOwnResolver({
        name: 'jobintime.xyz',
        protocolVersion: 'ENSv1',
      })

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: V1_REGISTRY,
          functionName: 'resolver',
        }),
      )
    })

    it('is true for an imported DNS name whose registry slot names a resolver', async () => {
      readContract.mockResolvedValue(OWN_RESOLVER)

      const result = await getNameHasOwnResolver({
        name: 'jobintime.xyz',
        protocolVersion: 'ENSv1',
      })

      expect(result._unsafeUnwrap()).toBe(true)
    })

    it('is false for a DNS name imported without a resolver', async () => {
      // Plain `proveAndClaim` sets an owner and no resolver; reads still work
      // through the TLD's offchain resolver, but nothing accepts a write.
      readContract.mockResolvedValue(zeroAddress)

      const result = await getNameHasOwnResolver({
        name: 'gasless.xyz',
        protocolVersion: 'ENSv1',
      })

      expect(result._unsafeUnwrap()).toBe(false)
    })

    it('errs rather than guessing when the registry read fails', async () => {
      readContract.mockRejectedValue(new Error('rpc down'))

      const result = await getNameHasOwnResolver({
        name: 'jobintime.xyz',
        protocolVersion: 'ENSv1',
      })

      expect(result.isErr()).toBe(true)
    })
  })

  it('errs rather than guessing when the read fails', async () => {
    getRegistries.mockRejectedValue(new Error('rpc down'))

    const result = await getNameHasOwnResolver({
      name: 'ens.eth',
      protocolVersion: 'ENSv2',
    })

    expect(result.isErr()).toBe(true)
  })
})
