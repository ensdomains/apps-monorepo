import { renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestWrapper } from '@/test-utils'

// Mock the wagmi helpers
const mockSafeGetClient = vi.fn()
vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: mockSafeGetClient,
}))

// Mock getSupportedInterfaces from ensjs
const mockGetSupportedInterfaces = vi.fn()
vi.mock('@ensdomains/ensjs/public', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ensdomains/ensjs/public')>()
  return {
    ...actual,
    getSupportedInterfaces: mockGetSupportedInterfaces,
  }
})

// Dynamic import after mocking
const { useSupportsInterfaces } = await import('./useSupportsInterfaces')

describe('useSupportsInterfaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return successful client
    mockSafeGetClient.mockReturnValue(
      ok({
        chain: { id: 11155111 },
        transport: { type: 'http' },
      }),
    )
    // Default: return interface data
    mockGetSupportedInterfaces.mockResolvedValue({
      '0x01ffc9a7': true,
      '0x80ac58cd': false,
    })
  })

  it('should fetch interface support data and call getSupportedInterfaces with correct params', async () => {
    const wrapper = createTestWrapper()
    const params = {
      address: '0x1234567890123456789012345678901234567890' as `0x${string}`,
      interfaces: ['0x01ffc9a7', '0x80ac58cd'] as `0x${string}`[],
    }

    const { result } = renderHook(() => useSupportsInterfaces(params), {
      wrapper,
    })

    // Wait for query to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Should have data
    expect(result.current.data).toBeDefined()

    // Should have called getSupportedInterfaces with correct parameters
    expect(mockGetSupportedInterfaces).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        address: params.address,
        interfaces: params.interfaces,
      }),
    )
  })
})
