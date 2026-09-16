import { act, cleanup, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNftArtworkVisibility } from './useNftArtworkVisibility'

let onIntersection: IntersectionObserverCallback | undefined
const observe = vi.fn()
const disconnect = vi.fn()

const intersect = (isIntersecting: boolean) =>
  act(() => {
    onIntersection?.(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
const visibility = (state: DocumentVisibilityState) =>
  act(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  })
const mountVisibility = () =>
  renderHook(
    ({ active }) => {
      const result = useNftArtworkVisibility(active)
      useLayoutEffect(() => {
        result.ref.current = document.createElement('div')
      }, [result.ref])
      return result
    },
    { initialProps: { active: true } },
  )

describe('NFT artwork visibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersection = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    observe.mockClear()
    disconnect.mockClear()
  })

  it('does not activate until the actual card intersects the viewport', () => {
    const { result } = mountVisibility()
    expect(result.current.visible).toBe(false)
    expect(result.current.resolved).toBe(false)
    expect(observe).toHaveBeenCalledWith(result.current.ref.current)
    intersect(false)
    expect(result.current.resolved).toBe(true)
    expect(result.current.visible).toBe(false)
    intersect(true)
    expect(result.current.visible).toBe(true)
  })

  it('deactivates when offscreen, in a background tab, or covered by a modal', () => {
    const { result, rerender } = mountVisibility()
    intersect(true)
    expect(result.current.visible).toBe(true)
    visibility('hidden')
    expect(result.current.visible).toBe(false)
    visibility('visible')
    expect(result.current.visible).toBe(true)
    rerender({ active: false })
    expect(result.current.visible).toBe(false)
    rerender({ active: true })
    expect(result.current.visible).toBe(true)
    intersect(false)
    expect(result.current.visible).toBe(false)
  })

  it('cleans up its observer and visibility listener', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { unmount } = mountVisibility()
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
  })

  it('allows rendering without IntersectionObserver while still respecting document visibility', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { result } = mountVisibility()
    expect(result.current.visible).toBe(true)
    visibility('hidden')
    expect(result.current.visible).toBe(false)
  })
})
