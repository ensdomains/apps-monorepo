import type { PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { hasV2NameEntry } from './changeResolver'

describe('registered V2 profile entries', () => {
  it.each([0, 1, 2])(
    'uses registry status %s rather than historical ownership',
    async (status) => {
      const client = {
        readContract: vi.fn(async () => ({
          status,
          latestOwner: '0x1111111111111111111111111111111111111111',
        })),
      } as unknown as PublicClient
      await expect(
        hasV2NameEntry(
          {
            label: 'alice',
            registryAddress: '0x2222222222222222222222222222222222222222',
          },
          client,
        ),
      ).resolves.toBe(status === 2)
    },
  )
})
