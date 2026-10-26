import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOPLAY_INTERVAL_MS,
  getNextAutoplayIndex,
  useCarouselAutoplay,
} from './useCarouselAutoplay'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('getNextAutoplayIndex', () => {
  it('moves forward and wraps back to the first slide', () => {
    expect(getNextAutoplayIndex(0, 4)).toBe(1)
    expect(getNextAutoplayIndex(3, 4)).toBe(0)
  })
})

describe('useCarouselAutoplay', () => {
  const render = (props: {
    readonly activeIndex: number
    readonly isPaused: boolean
  }) => {
    const onAdvance = vi.fn()
    const hook = renderHook((current) => useCarouselAutoplay(current), {
      initialProps: { ...props, slideCount: 4, onAdvance },
    })
    return { ...hook, onAdvance }
  }

  it('advances after the interval', () => {
    const { onAdvance } = render({ activeIndex: 3, isPaused: false })

    vi.advanceTimersByTime(AUTOPLAY_INTERVAL_MS - 1)
    expect(onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAdvance).toHaveBeenCalledWith(0)
  })

  it('waits while paused', () => {
    const { onAdvance } = render({ activeIndex: 0, isPaused: true })

    vi.advanceTimersByTime(AUTOPLAY_INTERVAL_MS * 3)
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('restarts the wait when the slide changes', () => {
    const { onAdvance, rerender } = render({ activeIndex: 0, isPaused: false })

    vi.advanceTimersByTime(AUTOPLAY_INTERVAL_MS - 1000)
    rerender({ activeIndex: 2, isPaused: false, slideCount: 4, onAdvance })
    vi.advanceTimersByTime(AUTOPLAY_INTERVAL_MS - 1)
    expect(onAdvance).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onAdvance).toHaveBeenCalledWith(3)
  })
})
