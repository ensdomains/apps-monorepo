import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNftReveal } from './useNftReveal'

const initialProps = {
  enabled: true,
  visible: true,
  status: 'loading' as 'loading' | 'ready' | 'error',
}
const setup = (props = initialProps) =>
  renderHook(useNftReveal, { initialProps: props })
const advanceTime = (milliseconds: number) =>
  act(() => vi.advanceTimersByTime(milliseconds))

describe('NFT reveal lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('hides the cover before showing the moving artwork and enabling actions', () => {
    const { result, rerender } = setup()
    expect(result.current.showPlaceholder).toBe(true)
    expect(result.current.showArtwork).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    rerender({ ...initialProps, status: 'ready' })
    expect(result.current.showPlaceholder).toBe(false)
    expect(result.current.showArtwork).toBe(false)
    expect(result.current.ready).toBe(false)
    advanceTime(199)
    expect(result.current.showArtwork).toBe(false)
    advanceTime(1)
    expect(result.current.showArtwork).toBe(true)
    expect(result.current.showPlaceholder).toBe(false)
    advanceTime(399)
    expect(result.current.ready).toBe(false)
    advanceTime(1)
    expect(result.current.ready).toBe(true)
    expect(result.current.status).toBe('ready')
    rerender({ ...initialProps, status: 'ready' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('skips the reveal for reduced motion or a non-dialog card', () => {
    const { result } = setup({
      ...initialProps,
      enabled: false,
      status: 'ready',
    })
    expect(result.current.ready).toBe(true)
    expect(result.current.showArtwork).toBe(true)
    expect(result.current.showPlaceholder).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels an interrupted reveal and never replays on return from a hidden tab', () => {
    const { rerender, result } = setup({ ...initialProps, status: 'ready' })
    advanceTime(100)
    rerender({ ...initialProps, status: 'ready', visible: false })
    expect(vi.getTimerCount()).toBe(0)
    rerender({ ...initialProps, status: 'ready' })
    expect(result.current.ready).toBe(true)
    expect(result.current.showArtwork).toBe(true)
    expect(result.current.showPlaceholder).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does no rendering after close', () => {
    const { unmount } = setup({ ...initialProps, status: 'ready' })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
