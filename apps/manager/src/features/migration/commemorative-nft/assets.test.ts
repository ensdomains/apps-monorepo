import { describe, expect, it, vi } from 'vitest'
import {
  CommemorativeNftAssetRequestError,
  downloadCommemorativeNftAsset,
  getCommemorativeNftAssetsReadyRefetchInterval,
  readCommemorativeNftAssetsReady,
  requestCommemorativeNftAssetPreparation,
  startCommemorativeNftAssetPreparation,
  startCommemorativeNftAssetPreparationAfterReceipt,
} from './assets'

const metadataUrl = 'https://api.example/v1/commemorative-nft/123456789.json'
const prepareUrl = 'https://api.example/v1/commemorative-nft/123456789/prepare'

describe('commemorative NFT asset downloads', () => {
  it('fetches cross-origin media and saves it as a local blob download', async () => {
    const png = new Blob(['png'], { type: 'image/png' })
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(png, { status: 200 }))
    const saveBlob = vi.fn()

    await downloadCommemorativeNftAsset({
      assetUrl: 'https://api.example/v1/commemorative-nft/123456789.png',
      fetcher,
      filename: 'ensv2-commemorative-nft.png',
      saveBlob,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/v1/commemorative-nft/123456789.png',
    )
    expect(saveBlob).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/png' }),
      'ensv2-commemorative-nft.png',
    )
  })

  it('does not save an unavailable asset', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }))
    const saveBlob = vi.fn()

    await expect(
      downloadCommemorativeNftAsset({
        assetUrl: 'https://api.example/v1/commemorative-nft/123456789.mp4',
        fetcher,
        filename: 'ensv2-commemorative-nft.mp4',
        saveBlob,
      }),
    ).rejects.toBeInstanceOf(CommemorativeNftAssetRequestError)
    expect(saveBlob).not.toHaveBeenCalled()
  })
})

describe('commemorative NFT asset preparation', () => {
  it('submits a POST request to the preparation endpoint', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }))

    await expect(
      requestCommemorativeNftAssetPreparation({ fetcher, prepareUrl }),
    ).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith(prepareUrl, { method: 'POST' })
  })

  it('reports failed preparation requests', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }))

    await expect(
      requestCommemorativeNftAssetPreparation({ fetcher, prepareUrl }),
    ).rejects.toBeInstanceOf(CommemorativeNftAssetRequestError)
  })

  it('starts preparation without waiting for the response', () => {
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>(() => {}))

    expect(
      startCommemorativeNftAssetPreparation({ fetcher, prepareUrl }),
    ).toBeUndefined()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('starts preparation only after a confirmed claim receipt', async () => {
    let confirmReceipt: (() => void) | undefined
    const waitForReceipt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          confirmReceipt = resolve
        }),
    )
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }))

    const afterReceipt = startCommemorativeNftAssetPreparationAfterReceipt({
      fetcher,
      prepareUrl,
      waitForReceipt,
    })
    expect(fetcher).not.toHaveBeenCalled()

    confirmReceipt?.()
    await afterReceipt
    expect(fetcher).toHaveBeenCalledWith(prepareUrl, { method: 'POST' })
  })

  it('does not fail a confirmed mint when preparation is rejected', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }))

    await expect(
      startCommemorativeNftAssetPreparationAfterReceipt({
        fetcher,
        prepareUrl,
        waitForReceipt: async () => undefined,
      }),
    ).resolves.toBeUndefined()
  })
})

describe('commemorative NFT asset readiness', () => {
  it('checks metadata readiness with an abortable HEAD request', async () => {
    const controller = new AbortController()
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))

    await expect(
      readCommemorativeNftAssetsReady({
        fetcher,
        metadataUrl,
        signal: controller.signal,
      }),
    ).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith(metadataUrl, {
      cache: 'no-store',
      method: 'HEAD',
      signal: controller.signal,
    })
  })

  it.each([
    202, 404, 425, 503,
  ])('treats HTTP %s as still preparing', async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))

    await expect(
      readCommemorativeNftAssetsReady({ fetcher, metadataUrl }),
    ).resolves.toBe(false)
  })

  it('reports unexpected readiness failures', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }))

    await expect(
      readCommemorativeNftAssetsReady({ fetcher, metadataUrl }),
    ).rejects.toBeInstanceOf(CommemorativeNftAssetRequestError)
  })

  it('polls every five seconds only until assets are ready', () => {
    expect(
      getCommemorativeNftAssetsReadyRefetchInterval({
        poll: true,
        ready: false,
      }),
    ).toBe(5_000)
    expect(
      getCommemorativeNftAssetsReadyRefetchInterval({
        poll: true,
        ready: true,
      }),
    ).toBe(false)
    expect(
      getCommemorativeNftAssetsReadyRefetchInterval({
        poll: false,
        ready: false,
      }),
    ).toBe(false)
  })
})
