import { afterEach, describe, expect, it, vi } from 'vitest'
import { withRequestDeadline } from './requestDeadline'

describe('request deadlines', () => {
  afterEach(() => vi.useRealTimers())

  it('aborts a stalled operation at the default fifteen-second deadline', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const request = withRequestDeadline((value) => {
      signal = value
      return new Promise(() => {})
    })
    const rejected = expect(request).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await rejected
    expect(signal?.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels immediately without waiting for a non-abortable dependency', async () => {
    const caller = new AbortController()
    let finish: ((value: string) => void) | undefined
    const request = withRequestDeadline(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
      { signal: caller.signal },
    )
    const reason = new DOMException('Owner changed', 'AbortError')
    caller.abort(reason)
    await expect(request).rejects.toBe(reason)
    finish?.('obsolete result')
    await expect(request).rejects.toBe(reason)
  })

  it('does not schedule work when the caller is already cancelled', async () => {
    const caller = new AbortController()
    caller.abort()
    const operation = vi.fn()
    await expect(
      withRequestDeadline(operation, { signal: caller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(operation).not.toHaveBeenCalled()
  })

  it('releases the deadline after completion', async () => {
    vi.useFakeTimers()
    await expect(withRequestDeadline(async () => 'ready')).resolves.toBe(
      'ready',
    )
    expect(vi.getTimerCount()).toBe(0)
  })
})
