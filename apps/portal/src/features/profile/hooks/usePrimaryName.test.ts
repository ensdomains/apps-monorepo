import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const NAME = 'vitalik.eth'
const ADDRESS = '0x1111111111111111111111111111111111111111'
// ENSIP-11 coin type for Base on mainnet: 0x80000000 | 8453.
const BASE_MAINNET_COIN_TYPE = (0x80000000 | 8453) >>> 0

const mockGetName = vi.fn()
const mockGetAddressRecord = vi.fn()
const mockReadContract = vi.fn()

vi.mock('@/config', () => ({ envConfig: { network: 'mainnet' } }))
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: {} }),
}))
vi.mock('@/lib/wagmiL2', () => ({
  l2WagmiConfig: { getClient: () => ({ chain: {} }) },
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  getName: (...args: unknown[]) => mockGetName(...args),
  getAddressRecord: (...args: unknown[]) => mockGetAddressRecord(...args),
}))
vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => mockReadContract,
}))

const { getPrimaryName } = await import('./usePrimaryName')

describe('getPrimaryName', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No L1 default reverse; fall through to the L2 registrars.
    mockGetName.mockResolvedValue(null)
    mockGetAddressRecord.mockResolvedValue({ value: ADDRESS })
  })

  it('prefers a forward-verified L1 default reverse', async () => {
    mockGetName.mockResolvedValue({ name: NAME, match: true })

    expect((await getPrimaryName(ADDRESS))._unsafeUnwrap()).toBe(NAME)
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  // The reverse registrar is keyed on the L2 chain id, but the ENSIP-19
  // forward check reads the ENSIP-11 record (`0x80000000 | chainId`). Passing
  // the bare chain id (8453) never matches a real record.
  it('verifies an L2 primary against its ENSIP-11 coin type', async () => {
    // OP (10), Arbitrum (42161), then Base (8453).
    mockReadContract
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(NAME)

    expect((await getPrimaryName(ADDRESS))._unsafeUnwrap()).toBe(NAME)
    expect(mockGetAddressRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: NAME,
        coin: BASE_MAINNET_COIN_TYPE,
      }),
    )
  })

  it('skips an L2 record whose forward check does not match', async () => {
    mockReadContract.mockResolvedValue(NAME)
    mockGetAddressRecord.mockResolvedValue({
      value: '0x2222222222222222222222222222222222222222',
    })

    expect((await getPrimaryName(ADDRESS))._unsafeUnwrap()).toBeNull()
  })
})
