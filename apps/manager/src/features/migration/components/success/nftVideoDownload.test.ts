import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveBlobToFile } from '../../commemorative-nft/assets'
import { downloadNftVideo } from './nftVideoDownload'

vi.mock('../../commemorative-nft/assets', () => ({ saveBlobToFile: vi.fn() }))

const rendererOrigin = 'https://renderer.example'
const requestId = '00000000-0000-4000-8000-000000000001'
const ready = { status: 'ready', videoExport: true }
const progress = { status: 'video-progress', progress: 0.425, requestId }
const blob = new Blob(['mp4'], { type: 'video/mp4' })
const complete = { status: 'video-complete', blob, requestId }
const controllers: AbortController[] = []

const startDownload = () => {
  const controller = new AbortController()
  controllers.push(controller)
  const onProgress = vi.fn()
  const pending = downloadNftVideo({
    rendererUrl: `${rendererOrigin}/?tokenId=42&transparent=1&reveal=1`,
    signal: controller.signal,
    onProgress,
  })
  void pending.catch(() => undefined)
  const frame = document.querySelector<HTMLIFrameElement>(
    'iframe[title="NFT video export"]',
  )
  if (!frame?.contentWindow) throw new Error('Missing export frame')
  const source = frame.contentWindow
  const postMessage = vi
    .spyOn(source, 'postMessage')
    .mockImplementation(() => {})
  const send = (data: object, overrides: MessageEventInit<unknown> = {}) => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        origin: rendererOrigin,
        data: {
          type: 'ens-commemorative-nft-renderer',
          tokenId: '42',
          ...data,
        },
        ...overrides,
      }),
    )
  }
  return { controller, onProgress, pending, frame, postMessage, send }
}

describe('NFT video export', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // Drive renderer messages locally without fetching an external document.
    vi.spyOn(HTMLIFrameElement.prototype, 'src', 'set').mockImplementation(
      function (this: HTMLIFrameElement, src) {
        this.setAttribute('src', src)
        this.srcdoc = ''
      },
    )
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(requestId)
    vi.mocked(saveBlobToFile).mockReset()
  })

  afterEach(() => {
    for (const controller of controllers) controller.abort()
    controllers.length = 0
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('handshakes once, reports progress, saves the MP4, and removes all export resources', async () => {
    const { controller, onProgress, pending, frame, postMessage, send } =
      startDownload()
    const removeMessageListener = vi.spyOn(window, 'removeEventListener')
    const removeAbortListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    )
    const url = new URL(frame.src)
    expect(url.searchParams.get('export')).toBe('video')
    expect(url.searchParams.has('transparent')).toBe(false)
    expect(url.searchParams.has('reveal')).toBe(false)
    frame.dispatchEvent(new Event('load'))
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'ens-commemorative-nft-renderer',
        tokenId: '42',
        status: 'request',
        requestId,
      },
      rendererOrigin,
    )

    send(progress)
    send(complete)
    expect(onProgress).not.toHaveBeenCalled()
    expect(saveBlobToFile).not.toHaveBeenCalled()
    send(ready)
    send(ready)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'ens-commemorative-nft-renderer',
        tokenId: '42',
        status: 'export-video',
        requestId,
      },
      rendererOrigin,
    )
    send(progress)
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(43)
    send(complete)
    await pending
    expect(saveBlobToFile).toHaveBeenCalledExactlyOnceWith(
      blob,
      'ensv2-commemorative-nft.mp4',
    )
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(removeMessageListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    )
    expect(removeAbortListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    )

    controller.abort()
    send(progress)
    send(complete)
    expect(postMessage).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(saveBlobToFile).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'source', data: {}, event: { source: window } },
    { name: 'origin', data: {}, event: { origin: 'https://other.example' } },
    { name: 'token', data: { tokenId: 'other-token' }, event: {} },
    { name: 'request', data: { requestId: 'other-request' }, event: {} },
  ])('ignores messages with the wrong $name', async ({ name, data, event }) => {
    const { onProgress, pending, frame, postMessage, send } = startDownload()
    if (name !== 'request') {
      send({ ...ready, ...data }, event)
      expect(postMessage).not.toHaveBeenCalled()
    }
    send(ready)
    send({ ...progress, ...data }, event)
    send({ ...complete, ...data }, event)
    expect(onProgress).not.toHaveBeenCalled()
    expect(saveBlobToFile).not.toHaveBeenCalled()
    expect(frame.isConnected).toBe(true)
    send(complete)
    await pending
    expect(saveBlobToFile).toHaveBeenCalledOnce()
  })

  it.each([
    { ...progress, type: 'other-protocol' },
    { ...progress, progress: -0.1 },
    { ...progress, progress: 1.1 },
    { ...progress, progress: Number.NaN },
    { ...progress, requestId: undefined },
    { ...complete, blob: new Blob([], { type: 'video/mp4' }) },
    { ...complete, blob: new Blob(['image'], { type: 'image/webp' }) },
  ])('ignores malformed export data: %j', async (message) => {
    const { onProgress, pending, frame, send } = startDownload()
    send(ready)
    send(message)
    expect(onProgress).not.toHaveBeenCalled()
    expect(saveBlobToFile).not.toHaveBeenCalled()
    expect(frame.isConnected).toBe(true)
    send(complete)
    await pending
  })

  it.each([
    { message: { status: 'ready' }, reason: 'unavailable' },
    { message: { status: 'failed' }, reason: 'failed' },
    {
      message: { status: 'video-error', reason: 'unsupported', requestId },
      reason: 'unsupported',
    },
    {
      message: { status: 'video-error', reason: 'failed', requestId },
      reason: 'failed',
    },
  ])(
    'rejects renderer failure with reason $reason',
    async ({ message, reason }) => {
      const { pending, frame, postMessage, send } = startDownload()
      if (message.status === 'video-error') send(ready)
      send(message)
      await expect(pending).rejects.toMatchObject({
        _tag: 'NftVideoDownloadError',
        reason,
      })
      expect(frame.isConnected).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'cancel-video', requestId }),
        rendererOrigin,
      )
      expect(saveBlobToFile).not.toHaveBeenCalled()
    },
  )

  it('cancels an active export and ignores late renderer replies', async () => {
    const { controller, onProgress, pending, frame, postMessage, send } =
      startDownload()
    send(ready)
    controller.abort()
    await expect(pending).rejects.toBe(controller.signal.reason)
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'cancel-video', requestId }),
      rendererOrigin,
    )
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    send(progress)
    send(complete)
    expect(onProgress).not.toHaveBeenCalled()
    expect(saveBlobToFile).not.toHaveBeenCalled()
  })

  it('does not create an export frame for an already-aborted request', () => {
    const controller = new AbortController()
    controller.abort()
    expect(() =>
      downloadNftVideo({
        rendererUrl: `${rendererOrigin}/?tokenId=42`,
        signal: controller.signal,
        onProgress: vi.fn(),
      }),
    ).toThrow(controller.signal.reason)
    expect(document.querySelector('iframe')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['preparing', 'rendering'])(
    'times out a stalled %s export and cleans up',
    async (phase) => {
      const { pending, frame, postMessage, send } = startDownload()
      if (phase === 'rendering') {
        send(ready)
        vi.advanceTimersByTime(59_000)
        send(progress)
      }
      vi.advanceTimersByTime(59_999)
      expect(frame.isConnected).toBe(true)
      const rejected = expect(pending).rejects.toMatchObject({
        _tag: 'NftVideoDownloadError',
        reason: 'unavailable',
      })
      vi.advanceTimersByTime(1)
      await rejected
      expect(frame.isConnected).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'cancel-video' }),
        rendererOrigin,
      )
      send(complete)
      expect(saveBlobToFile).not.toHaveBeenCalled()
    },
  )

  it('cleans up when saving the completed file fails', async () => {
    const error = new Error('Download blocked')
    vi.mocked(saveBlobToFile).mockImplementationOnce(() => {
      throw error
    })
    const { pending, frame, send } = startDownload()
    send(ready)
    send(complete)
    await expect(pending).rejects.toBe(error)
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans up when the renderer frame fails to load', async () => {
    const { pending, frame } = startDownload()
    frame.dispatchEvent(new Event('error'))
    await expect(pending).rejects.toMatchObject({ reason: 'unavailable' })
    expect(frame.isConnected).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
