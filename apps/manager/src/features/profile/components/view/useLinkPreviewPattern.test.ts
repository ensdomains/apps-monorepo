import { act, cleanup, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as patterns from './ProfileLinks.helpers'
import { useLinkPreviewPattern } from './useLinkPreviewPattern'

const intersections: IntersectionObserverCallback[] = []
const disconnect = vi.fn()
const intersect = (index: number, isIntersecting: boolean) =>
  act(() => {
    intersections[index]?.(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })

const mountPattern = () =>
  renderHook(
    ({ href }) => {
      const result = useLinkPreviewPattern(href)
      useLayoutEffect(() => {
        result.ref.current = document.createElement('div')
      }, [result.ref])
      return result
    },
    { initialProps: { href: 'https://example.com' } },
  )

describe('lazy link preview patterns', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(patterns, 'getGeneratedLinkPattern')
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersections.push(callback)
        }
        observe() {}
        disconnect = disconnect
      },
    )
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    intersections.length = 0
    disconnect.mockClear()
  })

  it('generates nothing on mount or offscreen, then generates once near the viewport', () => {
    const { result, rerender } = mountPattern()
    expect(result.current.pattern).toBeUndefined()
    expect(patterns.getGeneratedLinkPattern).not.toHaveBeenCalled()

    intersect(0, false)
    expect(patterns.getGeneratedLinkPattern).not.toHaveBeenCalled()

    intersect(0, true)
    expect(patterns.getGeneratedLinkPattern).toHaveBeenCalledExactlyOnceWith(
      'https://example.com',
    )
    expect(result.current.pattern?.backgroundImage).toContain(
      'data:image/svg+xml',
    )
    expect(disconnect).toHaveBeenCalledOnce()

    const pattern = result.current.pattern
    intersect(0, true)
    intersect(0, false)
    rerender({ href: 'https://example.com' })
    expect(result.current.pattern).toBe(pattern)
    expect(patterns.getGeneratedLinkPattern).toHaveBeenCalledOnce()
  })

  it('discards the previous pattern and observer when the URL changes', () => {
    const { result, rerender } = mountPattern()
    intersect(0, true)
    const previousPattern = result.current.pattern

    rerender({ href: 'https://other.example' })
    expect(result.current.pattern).toBeUndefined()
    intersect(0, true)
    expect(patterns.getGeneratedLinkPattern).toHaveBeenCalledOnce()

    intersect(1, true)
    expect(patterns.getGeneratedLinkPattern).toHaveBeenLastCalledWith(
      'https://other.example',
    )
    expect(result.current.pattern).not.toEqual(previousPattern)
  })

  it('disconnects on unmount and ignores callbacks already queued', () => {
    const { unmount } = mountPattern()
    unmount()
    intersect(0, true)

    expect(disconnect).toHaveBeenCalledOnce()
    expect(patterns.getGeneratedLinkPattern).not.toHaveBeenCalled()
  })

  it('defers generation without IntersectionObserver and cancels it on unmount', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { result } = mountPattern()
    expect(patterns.getGeneratedLinkPattern).not.toHaveBeenCalled()

    act(() => vi.runAllTimers())
    expect(result.current.pattern?.backgroundImage).toContain(
      'data:image/svg+xml',
    )
    expect(patterns.getGeneratedLinkPattern).toHaveBeenCalledOnce()

    const { unmount } = mountPattern()
    unmount()
    act(() => vi.runAllTimers())
    expect(patterns.getGeneratedLinkPattern).toHaveBeenCalledOnce()
  })
})
