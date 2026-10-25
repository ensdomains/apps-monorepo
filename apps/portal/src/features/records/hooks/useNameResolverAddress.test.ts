import { ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LEGACY_REGISTRY = '0x00000000000000000000000000000000000e1000'
const UR_RESOLVER = '0x1111111111111111111111111111111111111111'
const LEGACY_RESOLVER = '0x2222222222222222222222222222222222222222'

const mockGetResolver = vi.fn()
const mockReadContract = vi.fn()

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: {} }),
}))
vi.mock('@ensdomains/ensjs/chain', () => ({
  getChainContractAddress: () => LEGACY_REGISTRY,
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  getResolver: (...args: unknown[]) => mockGetResolver(...args),
}))
vi.mock('viem/actions', () => ({ readContract: vi.fn() }))
vi.mock('viem/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('viem/utils')>()),
  getAction: () => mockReadContract,
}))

const { getNameResolverAddress } = await import('./useNameResolverAddress')

const read = (name = 'lapsed.eth') => getNameResolverAddress({ name })

describe('getNameResolverAddress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadContract.mockResolvedValue(LEGACY_RESOLVER)
  })

  it('reports the resolver the UniversalResolver walk finds', async () => {
    mockGetResolver.mockResolvedValue(UR_RESOLVER)

    expect((await read())._unsafeUnwrap()).toBe(UR_RESOLVER)
    expect(mockReadContract).not.toHaveBeenCalled()
  })

  // A lapsed ENSv1 name leaves the walk 28 days before its grace ends, while
  // the legacy registry still names the resolver its owner can write.
  it('falls back to the legacy registry when the walk finds nothing', async () => {
    mockGetResolver.mockResolvedValue(null)

    expect((await read())._unsafeUnwrap()).toBe(LEGACY_RESOLVER)
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: LEGACY_REGISTRY }),
    )
  })

  it('reports no resolver when neither source names one', async () => {
    mockGetResolver.mockResolvedValue(zeroAddress)
    mockReadContract.mockResolvedValue(zeroAddress)

    expect((await read())._unsafeUnwrap()).toBeNull()
  })
})
