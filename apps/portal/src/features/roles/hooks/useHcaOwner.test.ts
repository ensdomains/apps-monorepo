import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HCA = '0x0725c395fb2393379654403399130c6802fa4ebe' as Address
const OWNER = '0x21984fE740E949482f455261594BCA47AB19Cc40' as Address

const readContract = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))
vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => readContract,
}))

const { getHcaOwner } = await import('./useHcaOwner')

describe('getHcaOwner', () => {
  beforeEach(() => {
    readContract.mockReset()
  })

  it('returns the wallet the factory certifies for an HCA', async () => {
    readContract.mockResolvedValue(OWNER)

    const result = await getHcaOwner({ account: HCA })

    expect(result._unsafeUnwrap()).toBe(OWNER)
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'authorizedOwnerOf',
        args: [HCA],
      }),
    )
  })

  it('returns null for an address the factory did not deploy', async () => {
    readContract.mockResolvedValue(zeroAddress)

    expect((await getHcaOwner({ account: OWNER }))._unsafeUnwrap()).toBeNull()
  })

  it('fails when the factory read fails', async () => {
    readContract.mockRejectedValue(new Error('rpc down'))

    expect((await getHcaOwner({ account: HCA })).isErr()).toBe(true)
  })
})
