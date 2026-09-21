import { act, cleanup, renderHook } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackNftEvent } from '../../commemorative-nft/diagnostics'
import { useCommemorativeNftRenderer } from './useCommemorativeNftRenderer'

vi.mock('../../commemorative-nft/diagnostics', () => ({
  trackNftEvent: vi.fn(),
}))

type RendererOptions = Parameters<typeof useCommemorativeNftRenderer>[0]

const rendererOrigin = 'https://renderer.example'
const rendererUrl = `${rendererOrigin}/?tokenId=42&transparent=1`
const readyMessage = {
  type: 'ens-commemorative-nft-renderer',
  status: 'ready',
  tokenId: '42',
}

const createRendererFrame = () => {
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const rendererWindow = iframe.contentWindow
  if (!rendererWindow) throw new Error('Renderer window is unavailable')
  vi.spyOn(rendererWindow, 'postMessage').mockImplementation(() => undefined)
  return { iframe, rendererWindow }
}

const sendMessage = (
  source: Window,
  data: unknown = readyMessage,
  overrides: MessageEventInit<unknown> = {},
) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin: rendererOrigin,
        data,
        ...overrides,
      }),
    )
  })

const mountRenderer = (options: RendererOptions = {}) => {
  const onReady = vi.fn()
  const onError = vi.fn()
  const frame = createRendererFrame()
  const hook = renderHook(() =>
    useCommemorativeNftRenderer({ rendererUrl, onReady, onError, ...options }),
  )
  hook.result.current.rendererRef.current = frame.iframe
  return { ...hook, ...frame, onReady, onError }
}

const advanceTime = (milliseconds: number) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })

describe('commemorative NFT renderer readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    cleanup()
    for (const iframe of document.querySelectorAll('iframe')) iframe.remove()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('requests renderer status on document load without marking artwork ready', () => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()
    const postMessage = vi.spyOn(rendererWindow, 'postMessage')

    advanceTime(9_999)
    act(() => result.current.onRendererLoad())
    expect(postMessage).toHaveBeenCalledWith(
      { ...readyMessage, status: 'request' },
      rendererOrigin,
    )
    expect(result.current.rendererStatus).toBe('loading')
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    advanceTime(1)
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(trackNftEvent).toHaveBeenCalledWith('nft:renderer_fallback', {
      reason: 'renderer_timeout',
    })

    sendMessage(rendererWindow)
    expect(result.current.failed).toBe(true)
    expect(onReady).not.toHaveBeenCalled()
  })

  it('becomes ready only on a matching renderer message and reports it once', () => {
    const { result, rendererWindow, onReady, onError, rerender } =
      mountRenderer()

    sendMessage(rendererWindow)
    expect(result.current.ready).toBe(true)
    expect(result.current.failed).toBe(false)
    expect(onReady).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    sendMessage(rendererWindow)
    act(() => result.current.onRendererLoad())
    rerender()
    advanceTime(10_000)

    expect(result.current.ready).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('recovers a cached iframe ready reply sent before the message listener attaches', () => {
    const { iframe, rendererWindow } = createRendererFrame()
    const onReady = vi.fn()
    vi.spyOn(rendererWindow, 'postMessage').mockImplementation(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: rendererWindow,
          origin: rendererOrigin,
          data: readyMessage,
        }),
      )
    })
    const { result } = renderHook(() => {
      const renderer = useCommemorativeNftRenderer({ rendererUrl, onReady })
      const { rendererRef, onRendererLoad } = renderer
      useLayoutEffect(() => {
        rendererRef.current = iframe
        onRendererLoad()
      }, [rendererRef, onRendererLoad])
      return renderer
    })

    expect(result.current.ready).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    'https://other.example',
    'null',
    'https://renderer.example:8443',
  ])('ignores status messages from an unexpected origin: %s', (origin) => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()

    sendMessage(rendererWindow, readyMessage, { origin })
    sendMessage(
      rendererWindow,
      { ...readyMessage, status: 'failed' },
      { origin },
    )
    expect(result.current.rendererStatus).toBe('loading')
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()

    advanceTime(10_000)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('ignores a matching message from another window on the renderer origin', () => {
    const { result, onReady, onError } = mountRenderer()
    const other = createRendererFrame()

    sendMessage(other.rendererWindow)
    sendMessage(other.rendererWindow, { ...readyMessage, status: 'failed' })

    expect(result.current.rendererStatus).toBe('loading')
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it.each([
    null,
    'ready',
    {},
    { ...readyMessage, type: 'unrelated' },
    { ...readyMessage, status: 'request' },
    { ...readyMessage, tokenId: '43' },
    { ...readyMessage, tokenId: 42 },
    { ...readyMessage, tokenId: '042' },
  ])('ignores malformed or unrelated renderer messages: %j', (message) => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()

    sendMessage(rendererWindow, message)

    expect(result.current.rendererStatus).toBe('loading')
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports renderer metadata or WebGL failure immediately and ignores late ready', () => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererLoad())
    sendMessage(rendererWindow, { ...readyMessage, status: 'failed' })
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(trackNftEvent).toHaveBeenCalledWith('nft:renderer_fallback', {
      reason: 'renderer_failed',
    })
    expect(vi.getTimerCount()).toBe(0)

    sendMessage(rendererWindow)
    sendMessage(rendererWindow, { ...readyMessage, status: 'failed' })
    expect(result.current.failed).toBe(true)
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('reports renderer failure after a successful first frame', () => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()

    sendMessage(rendererWindow)
    sendMessage(rendererWindow, { ...readyMessage, status: 'failed' })

    expect(result.current.ready).toBe(false)
    expect(result.current.failed).toBe(true)
    expect(onReady).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('fails on iframe error and ignores late ready until retry', () => {
    const { result, rendererWindow, onReady, onError } = mountRenderer()

    act(() => result.current.onRendererError())
    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)

    sendMessage(rendererWindow)
    advanceTime(10_000)

    expect(result.current.failed).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    '/relative',
    'https://renderer.example/',
  ])('reports a missing or invalid renderer URL as an error: %s', (url) => {
    const { result, onReady, onError } = mountRenderer({ rendererUrl: url })

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
    const frame = createRendererFrame()
    const { result, rerender } = renderHook(
      (callbacks) => useCommemorativeNftRenderer({ rendererUrl, ...callbacks }),
      { initialProps: { onReady: firstReady, onError: firstError } },
    )
    result.current.rendererRef.current = frame.iframe

    rerender({ onReady: nextReady, onError: nextError })
    if (outcome === 'ready') {
      sendMessage(frame.rendererWindow)
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
  ])('cleans up the timeout and listener when unmounted after %s milliseconds', (elapsed) => {
    const { rendererWindow, onReady, onError, unmount } = mountRenderer()
    const removeEventListener = vi.spyOn(window, 'removeEventListener')

    advanceTime(elapsed)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    )
    advanceTime(10_000)
    sendMessage(rendererWindow)

    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('starts a fresh retry and ignores messages from the previous iframe', () => {
    const first = mountRenderer()
    act(() => first.result.current.onRendererError())
    first.unmount()

    const next = mountRenderer()
    sendMessage(first.rendererWindow)
    expect(next.result.current.rendererStatus).toBe('loading')

    sendMessage(next.rendererWindow)
    expect(next.onReady).toHaveBeenCalledOnce()
    expect(first.onReady).not.toHaveBeenCalled()
    expect(first.onError).toHaveBeenCalledOnce()
  })
})
