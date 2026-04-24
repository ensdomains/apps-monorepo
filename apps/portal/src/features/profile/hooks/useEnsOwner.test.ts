import { ok } from 'neverthrow'
import { zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the wagmi helpers
const mockClient = { chain: { id: 11155111 } }
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockClient),
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
  beforeEach(() => {
    vi.clearAllMocks()
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
