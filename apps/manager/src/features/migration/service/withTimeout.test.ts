import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from './withTimeout'

describe('withTimeout', () => {
  it('resolves with the original value when the promise settles first', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 50)
    expect(result).toBe('ok')
  })

  it('rejects with the original error when the promise rejects first', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 50),
    ).rejects.toThrow('boom')
  })

  it('rejects with a timeout error when the timer fires first', async () => {
    const pending = new Promise<string>(() => {})
    await expect(withTimeout(pending, 5)).rejects.toThrow(/timed out after 5ms/)
  })

  it('attaches PreflightTimeoutError metadata to the timeout error', async () => {
    const pending = new Promise<never>(() => {})
    const err = (await withTimeout(pending, 5).catch((e) => e)) as Error & {
      timeoutMs?: number
    }
    expect(err.name).toBe('PreflightTimeoutError')
    expect(err.timeoutMs).toBe(5)
  })

  it('clears the timeout timer once the promise resolves', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.resolve(42), 1000)
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })

  it('clears the timeout timer once the promise rejects', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    await withTimeout(Promise.reject(new Error('x')), 1000).catch(() => {})
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
