// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWaitRemaining } from './useWaitRemaining'

describe('useWaitRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when there is no wait', () => {
    expect(renderHook(() => useWaitRemaining(undefined)).result.current).toBe(0)
  })

  it('returns 0 for a wait that already elapsed', () => {
    expect(
      renderHook(() => useWaitRemaining(Date.now() - 1_000)).result.current,
    ).toBe(0)
  })

  it('ticks down and stops at 0', () => {
    const base = Date.now()
    const { result } = renderHook(() => useWaitRemaining(base + 2_000))

    expect(result.current).toBe(2_000)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current).toBe(1_000)

    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    expect(result.current).toBe(0)
  })

  it('recomputes when the deadline changes', () => {
    const now = Date.now()
    const { result, rerender } = renderHook(
      ({ waitUntil }) => useWaitRemaining(waitUntil),
      { initialProps: { waitUntil: now + 1_000 } },
    )

    expect(result.current).toBe(1_000)

    rerender({ waitUntil: now + 5_000 })
    expect(result.current).toBe(5_000)
  })

  it('clears its interval on unmount', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useWaitRemaining(Date.now() + 2_000))

    unmount()

    expect(clearInterval).toHaveBeenCalled()
  })
})
