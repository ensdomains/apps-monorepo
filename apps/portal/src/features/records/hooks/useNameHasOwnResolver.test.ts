import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const UNIVERSAL_RESOLVER =
  '0xeeeeeeee14d718c2b47d9923deab1335e144eeee' as Address
const V1_REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e' as Address
const OWN_RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address
/** The read-only ExtendedDNSResolver a detached DNS name resolves through. */
const INHERITED_RESOLVER =
  '0x0ef1af80c24b681991d675176d9c07d8c9236b9a' as Address

const readContract = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () =>
    ok({
      chain: {
        id: 11155111,
        contracts: { ensLegacyRegistry: { address: V1_REGISTRY } },
      },
    }),
}))
vi.mock('@/lib/constants/universalResolver', () => ({
  universalResolverAddress: UNIVERSAL_RESOLVER,
}))
vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => readContract,
}))

const { getNameHasOwnResolver } = await import('./useNameHasOwnResolver')

describe('getNameHasOwnResolver', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  describe('ENSv2 — the UniversalResolver walk', () => {
    it('is true when findResolver stops on the name itself', async () => {
      readContract.mockResolvedValue([OWN_RESOLVER, '0xnode', 0n])

      const result = await getNameHasOwnResolver({
        name: 'ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(true)
    })

    it('queries the UniversalResolver with the DNS-encoded name', async () => {
      readContract.mockResolvedValue([OWN_RESOLVER, '0xnode', 0n])

      await getNameHasOwnResolver({
        name: 'ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: UNIVERSAL_RESOLVER,
          functionName: 'findResolver',
          args: ['0x03656e730365746800'],
        }),
      )
    })

    it('is false when the resolver is inherited from an ancestor', async () => {
      readContract.mockResolvedValue([INHERITED_RESOLVER, '0xnode', 4n])

      const result = await getNameHasOwnResolver({
        name: 'sub.ens.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(false)
    })

    it('is false when no resolver is found at all', async () => {
      // The walk runs off the root without finding one, which also reports
      // offset 0 — so the offset alone would wrongly read as "owns it".
      readContract.mockResolvedValue([zeroAddress, '0xnode', 0n])

      const result = await getNameHasOwnResolver({
        name: 'nope.eth',
        protocolVersion: 'ENSv2',
      })

      expect(result._unsafeUnwrap()).toBe(false)
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
    readContract.mockRejectedValue(new Error('rpc down'))

    const result = await getNameHasOwnResolver({
      name: 'ens.eth',
      protocolVersion: 'ENSv2',
    })

    expect(result.isErr()).toBe(true)
  })
})
