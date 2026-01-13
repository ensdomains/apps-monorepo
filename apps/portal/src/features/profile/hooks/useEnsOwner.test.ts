import { ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { describe, expect, it, vi } from 'vitest'

// Mock the wagmi helpers
const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
  safeGetNamechainSepoliaClient: () => ok(mockClient),
}))

// Mock ensjs v1
const mockV1GetOwner = vi.fn()
vi.mock('@ensdomains/ensjs/public/v1', () => ({
  getOwner: mockV1GetOwner,
}))

// Mock ensjs v2
const mockV2GetOwner = vi.fn()
const mockGetNameRegistryAddress = vi.fn()
vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getOwner: mockV2GetOwner,
  getNameRegistryAddress: mockGetNameRegistryAddress,
}))

// Dynamic import after mocking
const { getEnsOwner } = await import('./useEnsOwner')

describe('getEnsOwner', () => {
  it('returns a V1 owner for a V1 name', async () => {
    const mockOwnerAddress = '0x1234567890123456789012345678901234567890'
    mockV1GetOwner.mockResolvedValue({ owner: mockOwnerAddress })

    const result = await getEnsOwner({ name: 'v1rtl.eth' })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        owner: mockOwnerAddress,
        network: 'sepolia',
      })
    }
  })

  it('returns a V2 owner when V1 has no owner', async () => {
    const mockOwnerAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
    mockV1GetOwner.mockResolvedValue({ owner: null })
    mockV2GetOwner.mockResolvedValue(mockOwnerAddress)

    const result = await getEnsOwner({ name: 'test.eth' })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        owner: mockOwnerAddress,
        network: 'namechainSepolia',
      })
    }
  })

  it('returns null when no owner found on either network', async () => {
    mockV1GetOwner.mockResolvedValue({ owner: null })
    mockV2GetOwner.mockResolvedValue(zeroAddress)

    const result = await getEnsOwner({ name: 'unowned.eth' })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBeNull()
    }
  })
})
