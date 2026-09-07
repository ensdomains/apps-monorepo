import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommemorativeNftRenderer } from './useCommemorativeNftRenderer'

type RendererOptions = Parameters<typeof useCommemorativeNftRenderer>[0]

const sources = {
  artworkUrl: 'https://assets.example/nft.webp',
  rendererUrl: 'https://renderer.example/nft',
}

const mountRenderer = (options: RendererOptions = {}) => {
  const onReady = vi.fn()
  const onError = vi.fn()
  const hook = renderHook(() =>
    useCommemorativeNftRenderer({ ...sources, onReady, onError, ...options }),
  )
  return { ...hook, onReady, onError }
}

const advanceTime = (milliseconds: number) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })

const paintFrame = () =>
  act(() => {
    vi.advanceTimersToNextFrame()
  })

describe('commemorative NFT renderer readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fails stalled image and renderer requests after ten seconds', () => {
    const { result, onReady, onError } = mountRenderer()

    advanceTime(9_999)
    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(false)
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    advanceTime(1)
    expect(result.current.imageStatus).toBe('failed')
    expect(result.current.rendererStatus).toBe('failed')
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()

    advanceTime(10_000)
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('allows the image to become ready after the renderer fails', () => {
    const { result, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererError())
    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(false)
    expect(onError).not.toHaveBeenCalled()

    act(() => result.current.onImageLoad())
    expect(result.current.imageStatus).toBe('ready')
    expect(result.current.rendererStatus).toBe('failed')
    expect(result.current.ready).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('keeps a loaded image available when the renderer times out', () => {
    const { result, onReady, onError } = mountRenderer()

    act(() => result.current.onImageLoad())
    advanceTime(10_000)

    expect(result.current.imageStatus).toBe('ready')
    expect(result.current.rendererStatus).toBe('failed')
    expect(result.current.ready).toBe(true)
    expect(result.current.failed).toBe(false)
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('waits for the renderer to settle and paint without an image source', () => {
    const { result, onReady, onError } = mountRenderer({
      artworkUrl: undefined,
    })

    act(() => result.current.onRendererLoad())
    advanceTime(300)
    expect(result.current.ready).toBe(false)
    paintFrame()
    expect(result.current.ready).toBe(false)
    paintFrame()

    expect(result.current.rendererStatus).toBe('ready')
    expect(result.current.ready).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    advanceTime(10_000)
    expect(result.current.rendererStatus).toBe('ready')
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports readiness once when the image and renderer both become ready', () => {
    const { result, onReady, onError, rerender } = mountRenderer()

    act(() => {
      result.current.onImageLoad()
      result.current.onRendererLoad()
    })
    advanceTime(350)
    act(() => {
      result.current.onImageLoad()
      result.current.onRendererLoad()
    })
    rerender()

    expect(result.current.imageStatus).toBe('ready')
    expect(result.current.rendererStatus).toBe('ready')
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('cancels pending renderer readiness when both sources fail', () => {
    const { result, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererLoad())
    advanceTime(300)
    paintFrame()
    act(() => {
      result.current.onRendererError()
      result.current.onImageError()
    })
    advanceTime(10_000)

    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('reports missing sources as an error instead of a completed reveal', () => {
    const { result, onReady, onError } = mountRenderer({
      artworkUrl: undefined,
      rendererUrl: undefined,
    })

    expect(result.current.failed).toBe(true)
    expect(result.current.ready).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it.each([
    'ready',
    'error',
  ] as const)('uses the latest %s callback while sources are still loading', (outcome) => {
    const firstReady = vi.fn()
    const firstError = vi.fn()
    const nextReady = vi.fn()
    const nextError = vi.fn()
    const { result, rerender } = renderHook(
      (callbacks) => useCommemorativeNftRenderer({ ...sources, ...callbacks }),
      { initialProps: { onReady: firstReady, onError: firstError } },
    )

    rerender({ onReady: nextReady, onError: nextError })
    if (outcome === 'ready') {
      act(() => result.current.onImageLoad())
      expect(nextReady).toHaveBeenCalledOnce()
      expect(nextError).not.toHaveBeenCalled()
    } else {
      advanceTime(10_000)
      expect(nextError).toHaveBeenCalledOnce()
      expect(nextReady).not.toHaveBeenCalled()
    }
    expect(firstReady).not.toHaveBeenCalled()
    expect(firstError).not.toHaveBeenCalled()
  })

  it.each([
    0, 300, 316,
  ])('cleans up timers and frames when unmounted after %s milliseconds', (elapsed) => {
    const { result, onReady, onError, unmount } = mountRenderer()

    act(() => result.current.onRendererLoad())
    advanceTime(elapsed)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    advanceTime(10_000)

    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('starts a fresh attempt when an externally keyed source is remounted', () => {
    const first = mountRenderer()
    act(() => first.result.current.onImageLoad())
    expect(first.onReady).toHaveBeenCalledOnce()
    first.unmount()

    const next = mountRenderer({
      artworkUrl: 'https://assets.example/next.webp',
    })
    expect(next.result.current.ready).toBe(false)
    expect(next.result.current.failed).toBe(false)
    expect(next.onReady).not.toHaveBeenCalled()

    act(() => next.result.current.onImageLoad())
    expect(next.onReady).toHaveBeenCalledOnce()
    expect(first.onReady).toHaveBeenCalledOnce()
    expect(first.onError).not.toHaveBeenCalled()
  })
})
