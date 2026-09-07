import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommemorativeNftRenderer } from './useCommemorativeNftRenderer'

type RendererOptions = Parameters<typeof useCommemorativeNftRenderer>[0]

const rendererUrl = 'https://renderer.example/nft'

const mountRenderer = (options: RendererOptions = {}) => {
  const onReady = vi.fn()
  const onError = vi.fn()
  const hook = renderHook(() =>
    useCommemorativeNftRenderer({ rendererUrl, onReady, onError, ...options }),
  )
  return { ...hook, onReady, onError }
}

const advanceTime = (milliseconds: number) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })

describe('commemorative NFT renderer readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fails a stalled iframe request after ten seconds', () => {
    const { result, onReady, onError } = mountRenderer()

    advanceTime(9_999)
    expect(result.current.rendererStatus).toBe('loading')
    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(false)
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    advanceTime(1)
    expect(result.current.rendererStatus).toBe('failed')
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()

    advanceTime(10_000)
    act(() => result.current.onRendererLoad())
    expect(result.current.rendererStatus).toBe('failed')
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('becomes ready immediately on iframe load and reports readiness once', () => {
    const { result, onReady, onError, rerender } = mountRenderer()

    act(() => result.current.onRendererLoad())

    expect(result.current.rendererStatus).toBe('ready')
    expect(result.current.ready).toBe(true)
    expect(result.current.failed).toBe(false)
    expect(onReady).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    act(() => result.current.onRendererLoad())
    rerender()
    advanceTime(10_000)

    expect(result.current.rendererStatus).toBe('ready')
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('fails on iframe error and ignores late load events until retry', () => {
    const { result, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererError())
    expect(result.current.rendererStatus).toBe('failed')
    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    act(() => {
      result.current.onRendererError()
      result.current.onRendererLoad()
    })
    advanceTime(10_000)

    expect(result.current.rendererStatus).toBe('failed')
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it('reports an iframe error after it has loaded', () => {
    const { result, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererLoad())
    act(() => result.current.onRendererError())

    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('reports a missing renderer URL as an error', () => {
    const { result, onReady, onError } = mountRenderer({
      rendererUrl: undefined,
    })

    expect(result.current.failed).toBe(true)
    expect(result.current.ready).toBe(false)
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    'ready',
    'error',
  ] as const)('uses the latest %s callback while the iframe is still loading', (outcome) => {
    const firstReady = vi.fn()
    const firstError = vi.fn()
    const nextReady = vi.fn()
    const nextError = vi.fn()
    const { result, rerender } = renderHook(
      (callbacks) => useCommemorativeNftRenderer({ rendererUrl, ...callbacks }),
      { initialProps: { onReady: firstReady, onError: firstError } },
    )

    rerender({ onReady: nextReady, onError: nextError })
    if (outcome === 'ready') {
      act(() => result.current.onRendererLoad())
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
    0, 9_999,
  ])('cleans up the loading timeout when unmounted after %s milliseconds', (elapsed) => {
    const { onReady, onError, unmount } = mountRenderer()

    advanceTime(elapsed)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    advanceTime(10_000)

    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('starts a fresh retry when the failed iframe is remounted', () => {
    const first = mountRenderer()
    act(() => first.result.current.onRendererError())
    expect(first.onError).toHaveBeenCalledOnce()
    first.unmount()

    const next = mountRenderer()
    expect(next.result.current.rendererStatus).toBe('loading')
    expect(next.result.current.ready).toBe(false)
    expect(next.result.current.failed).toBe(false)
    expect(next.onReady).not.toHaveBeenCalled()
    expect(next.onError).not.toHaveBeenCalled()

    act(() => next.result.current.onRendererLoad())
    expect(next.onReady).toHaveBeenCalledOnce()
    expect(first.onReady).not.toHaveBeenCalled()
    expect(first.onError).toHaveBeenCalledOnce()
  })
})
