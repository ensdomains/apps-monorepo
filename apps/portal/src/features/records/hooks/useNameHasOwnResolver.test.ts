import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const UNIVERSAL_RESOLVER =
  '0xeeeeeeee14d718c2b47d9923deab1335e144eeee' as Address
const OWN_RESOLVER = '0x8fade66b79cc9f707ab26799354482eb93a5b7dd' as Address
/** The read-only ExtendedDNSResolver a detached DNS name resolves through. */
const INHERITED_RESOLVER =
  '0x0ef1af80c24b681991d675176d9c07d8c9236b9a' as Address

const readContract = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
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

  it('is true when findResolver stops on the name itself', async () => {
    readContract.mockResolvedValue([OWN_RESOLVER, '0xnode', 0n])

    const result = await getNameHasOwnResolver({ name: 'ens.eth' })

    expect(result._unsafeUnwrap()).toBe(true)
  })

  it('queries the UniversalResolver with the DNS-encoded name', async () => {
    readContract.mockResolvedValue([OWN_RESOLVER, '0xnode', 0n])

    await getNameHasOwnResolver({ name: 'ens.eth' })

    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: UNIVERSAL_RESOLVER,
        functionName: 'findResolver',
        args: ['0x03656e730365746800'],
      }),
    )
  })

  it('is false when the resolver is inherited from an ancestor', async () => {
    // jobintime.xyz: the name's own registry entry is empty, so the walk
    // continues to `xyz` (offset 10) and lands on the TLD's offchain resolver.
    readContract.mockResolvedValue([INHERITED_RESOLVER, '0xnode', 10n])

    const result = await getNameHasOwnResolver({ name: 'jobintime.xyz' })

    expect(result._unsafeUnwrap()).toBe(false)
  })

  it('is false when no resolver is found at all', async () => {
    // The walk runs off the root without finding one, which also reports
    // offset 0 — so the offset alone would wrongly read as "owns it".
    readContract.mockResolvedValue([zeroAddress, '0xnode', 0n])

    const result = await getNameHasOwnResolver({ name: 'nope.eth' })

    expect(result._unsafeUnwrap()).toBe(false)
  })

  it('errs rather than guessing when the read fails', async () => {
    readContract.mockRejectedValue(new Error('rpc down'))

    const result = await getNameHasOwnResolver({ name: 'ens.eth' })

    expect(result.isErr()).toBe(true)
  })
})
