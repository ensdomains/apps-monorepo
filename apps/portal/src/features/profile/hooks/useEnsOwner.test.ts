import { ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the wagmi helpers
const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
}))

// Mock chain contract address lookup used by the shared resolveEnsOwner (V1
// fallback only — the V2 path reads everything by name via the UR).
const V2_ETH_REGISTRY = '0x00000000000000000000000000000000000e2000'
const V1_ETH_REGISTRY = '0x00000000000000000000000000000000000e1000'
vi.mock('@ensdomains/ensjs/chain', () => ({
  getChainContractAddress: () => V1_ETH_REGISTRY,
}))

// Mock ensjs v1
const mockV1GetOwner = vi.fn()
vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: mockV1GetOwner,
}))

// Mock the UniversalHelper reads (the hackathon deployment's home for the V2
// owner / registry-ancestry lookups, formerly ensjs v2 against the UR)
const mockV2GetOwner = vi.fn()
const mockGetNameRegistries = vi.fn()
vi.mock('@ens-apps/indexer/universalHelper', () => ({
  getOwner: mockV2GetOwner,
  getNameRegistries: mockGetNameRegistries,
}))

// Dynamic import after mocking
const { getEnsOwner } = await import('./useEnsOwner')

describe('getEnsOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Leaf-first ancestry: index 1 (the leaf's containing registry) is non-zero.
    mockGetNameRegistries.mockResolvedValue([
      zeroAddress,
      V2_ETH_REGISTRY,
      '0x0000000000000000000000000000000000007007',
    ])
  })

  it('returns a V2 owner for a V2 name without calling V1', async () => {
    const ownerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    mockV2GetOwner.mockResolvedValue(ownerAddress)

    const result = await getEnsOwner({ name: 'test.eth' })

    expect(result._unsafeUnwrap()).toMatchObject({
      owner: ownerAddress,
      protocolVersion: 'ENSv2',
    })
    expect(mockV1GetOwner).not.toHaveBeenCalled()
  })

  it('returns a V1 owner for a V1 name', async () => {
    const ownerAddress = '0x1234567890123456789012345678901234567890'
    mockV2GetOwner.mockResolvedValue(zeroAddress)
    mockV1GetOwner.mockResolvedValue({ owner: ownerAddress })

    const result = await getEnsOwner({ name: 'v1rtl.eth' })

    expect(result._unsafeUnwrap()).toMatchObject({
      owner: ownerAddress,
      protocolVersion: 'ENSv1',
    })
  })

  it('returns null when no owner found on either registry', async () => {
    mockV2GetOwner.mockResolvedValue(zeroAddress)
    mockV1GetOwner.mockResolvedValue({ owner: null })

    const result = await getEnsOwner({ name: 'unowned.eth' })

    expect(result._unsafeUnwrap()).toBeNull()
  })
})
