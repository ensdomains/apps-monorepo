import { describe, expect, it, vi } from 'vitest'
import { withRetry } from '../src/retry.js'

describe('withRetry', () => {
  it('uses exponential delays and eventually succeeds', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('one'))
      .mockRejectedValueOnce(new Error('two'))
      .mockResolvedValue('ok')
    const sleep = vi.fn(async () => undefined)

    await expect(
      withRetry(operation, { attempts: 5, baseDelayMs: 100, sleep }),
    ).resolves.toBe('ok')
    expect(sleep).toHaveBeenNthCalledWith(1, 100)
    expect(sleep).toHaveBeenNthCalledWith(2, 200)
  })

  it('stops immediately for non-retryable errors', async () => {
    const operation = vi.fn(async () => {
      throw new Error('terminal')
    })

    await expect(
      withRetry(operation, {
        attempts: 5,
        baseDelayMs: 100,
        isRetryable: () => false,
      }),
    ).rejects.toThrow('terminal')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
