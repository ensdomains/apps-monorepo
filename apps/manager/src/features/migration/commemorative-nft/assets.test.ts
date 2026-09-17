import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCommemorativeNftImage } from './assets'
import { trackNftEvent } from './diagnostics'

vi.mock('./diagnostics', () => ({ trackNftEvent: vi.fn() }))
const assetUrl = 'https://assets.example/card.webp'
const filename = 'card.webp'

describe('NFT asset downloads', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('downloads a successful response as a blob using the requested filename', async () => {
    const blob = new Blob(['webp'], { type: 'image/webp' })
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(blob))
    const saveBlob = vi.fn()
    await downloadCommemorativeNftImage({
      assetUrl,
      filename,
      fetcher,
      saveBlob,
    })
    expect(fetcher).toHaveBeenCalledWith(assetUrl, {
      signal: expect.any(AbortSignal),
    })
    expect(await saveBlob.mock.calls[0]?.[0].text()).toBe('webp')
    expect(saveBlob.mock.calls[0]?.[1]).toBe(filename)
  })

  it('rejects HTTP failures rather than silently reporting a download', async () => {
    const saveBlob = vi.fn()
    await expect(
      downloadCommemorativeNftImage({
        assetUrl,
        filename,
        saveBlob,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(null, { status: 404 })),
      }),
    ).rejects.toThrow('HTTP 404')
    expect(saveBlob).not.toHaveBeenCalled()
    expect(trackNftEvent).toHaveBeenCalledWith('nft:download_failure', {
      reason: 'http',
    })
  })

  it('bounds a stalled response body and never saves a late result', async () => {
    vi.useFakeTimers()
    let resolveBody: ((blob: Blob) => void) | undefined
    const body = new Promise<Blob>((resolve) => {
      resolveBody = resolve
    })
    const response = new Response()
    vi.spyOn(response, 'blob').mockReturnValue(body)
    const saveBlob = vi.fn()
    const pending = downloadCommemorativeNftImage({
      assetUrl,
      filename,
      saveBlob,
      timeoutMs: 100,
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response),
    })
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    })
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    resolveBody?.(new Blob(['late']))
    await Promise.resolve()
    expect(saveBlob).not.toHaveBeenCalled()
    expect(trackNftEvent).toHaveBeenCalledWith('nft:download_failure', {
      reason: 'timeout',
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('aborts when the caller closes or changes owner', async () => {
    const controller = new AbortController()
    const saveBlob = vi.fn()
    const pending = downloadCommemorativeNftImage({
      assetUrl,
      filename,
      saveBlob,
      signal: controller.signal,
      fetcher: vi
        .fn<typeof fetch>()
        .mockReturnValue(new Promise(() => undefined)),
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(saveBlob).not.toHaveBeenCalled()
    expect(trackNftEvent).toHaveBeenCalledWith('nft:download_failure', {
      reason: 'aborted',
    })
  })
})
