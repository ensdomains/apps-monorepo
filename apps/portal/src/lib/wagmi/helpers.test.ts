import { sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

// Mock wagmi config
const mockGetClient = vi.fn()
const mockConfig = {
  getClient: mockGetClient,
}

vi.mock('../wagmi', () => ({
  wagmiConfig: mockConfig,
  ensChain: { ...sepolia, id: 11155111 },
}))

// Dynamic import after mocking
const { safeGetClient } = await import('./helpers')

describe('wagmi/helpers', () => {
  describe('safeGetClient', () => {
    it('should return Ok with client on success', () => {
      const mockClient = {
        chain: { id: 11155111, name: 'Sepolia' },
        transport: { type: 'http' },
      }
      mockGetClient.mockReturnValue(mockClient)

      const result = safeGetClient()

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(mockClient)
      }
    })

    it('should return Err when client retrieval fails', () => {
      mockGetClient.mockImplementation(() => {
        throw new Error('Failed to get client')
      })

      const result = safeGetClient()

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('Wagmi/ClientError')
        expect(result.error.cause).toBeDefined()
      }
    })
  })
})
