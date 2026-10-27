import { TaggedError } from '@ens-apps/utils/neverthrow'
import { match } from 'ts-pattern'
import * as v from 'valibot'
import { saveBlobToFile } from '../../commemorative-nft/assets'
import { getRendererSandbox } from './rendererSandbox'

const MESSAGE_TYPE = 'ens-commemorative-nft-renderer'
const EXPORT_TIMEOUT_MS = 60_000
const messageIdentity = {
  type: v.literal(MESSAGE_TYPE),
  tokenId: v.string(),
}
const exportIdentity = { ...messageIdentity, requestId: v.string() }
const videoMessageSchema = v.variant('status', [
  v.object({ ...messageIdentity, status: v.literal('failed') }),
  v.object({
    ...messageIdentity,
    status: v.literal('ready'),
    videoExport: v.optional(v.boolean()),
  }),
  v.object({
    ...exportIdentity,
    status: v.literal('video-progress'),
    progress: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1)),
  }),
  v.object({
    ...exportIdentity,
    status: v.literal('video-complete'),
    blob: v.pipe(v.instance(Blob), v.mimeType(['video/mp4']), v.minSize(1)),
  }),
  v.object({
    ...exportIdentity,
    status: v.literal('video-error'),
    reason: v.picklist(['unsupported', 'failed']),
  }),
])

type VideoDownloadErrorReason = 'unsupported' | 'unavailable' | 'failed'

export class NftVideoDownloadError extends TaggedError(
  'NftVideoDownloadError',
)<{
  reason: VideoDownloadErrorReason
}> {}

export const downloadNftVideo = (params: {
  readonly rendererUrl: string
  readonly signal: AbortSignal
  readonly onProgress: (progress: number) => void
}): Promise<void> => {
  const url = new URL(params.rendererUrl)
  const tokenId = url.searchParams.get('tokenId')
  url.searchParams.delete('transparent')
  url.searchParams.delete('reveal')
  url.searchParams.set('export', 'video')
  params.signal.throwIfAborted()

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const frame = document.createElement('iframe')
    frame.title = 'NFT video export'
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.referrerPolicy = 'no-referrer'
    frame.sandbox.value = getRendererSandbox({
      rendererUrl: url.toString(),
      appOrigin: window.location.origin,
      trustedRendererOrigin: url.origin,
    })
    frame.style.cssText =
      'position:fixed;left:-10000px;top:0;width:1080px;height:1440px;border:0;pointer-events:none'
    let hasRequested = false
    let timeout: ReturnType<typeof setTimeout>

    const send = (status: string) => {
      frame.contentWindow?.postMessage(
        { type: MESSAGE_TYPE, status, tokenId, requestId },
        url.origin,
      )
    }
    const cleanup = () => {
      clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      params.signal.removeEventListener('abort', onAbort)
      frame.remove()
    }
    const fail = (error: unknown) => {
      send('cancel-video')
      cleanup()
      reject(error)
    }
    const resetTimeout = () => {
      clearTimeout(timeout)
      timeout = setTimeout(
        () => fail(new NftVideoDownloadError({ reason: 'unavailable' })),
        EXPORT_TIMEOUT_MS,
      )
    }
    const onAbort = () => fail(params.signal.reason)
    const onExportMessage = (
      message: Extract<
        v.InferOutput<typeof videoMessageSchema>,
        { requestId: string }
      >,
    ) => {
      if (!hasRequested || message.requestId !== requestId) return
      match(message)
        .with({ status: 'video-progress' }, ({ progress }) => {
          resetTimeout()
          params.onProgress(Math.round(progress * 100))
        })
        .with({ status: 'video-complete' }, ({ blob }) => {
          try {
            saveBlobToFile(blob, 'ensv2-commemorative-nft.mp4')
            cleanup()
            resolve()
          } catch (error) {
            fail(error)
          }
        })
        .with({ status: 'video-error' }, ({ reason }) => {
          fail(new NftVideoDownloadError({ reason }))
        })
        .exhaustive()
    }
    const requestExport = (isSupported: boolean) => {
      if (hasRequested) return
      if (!isSupported) {
        fail(new NftVideoDownloadError({ reason: 'unavailable' }))
        return
      }
      hasRequested = true
      resetTimeout()
      send('export-video')
    }
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.contentWindow || event.origin !== url.origin)
        return
      const result = v.safeParse(videoMessageSchema, event.data)
      if (!result.success || result.output.tokenId !== tokenId) return
      const message = result.output
      if ('requestId' in message) {
        onExportMessage(message)
        return
      }
      if (message.status === 'failed') {
        fail(new NftVideoDownloadError({ reason: 'failed' }))
        return
      }
      requestExport(message.videoExport === true)
    }

    window.addEventListener('message', onMessage)
    params.signal.addEventListener('abort', onAbort, { once: true })
    frame.onload = () => send('request')
    frame.onerror = () =>
      fail(new NftVideoDownloadError({ reason: 'unavailable' }))
    resetTimeout()
    frame.src = url.toString()
    document.body.appendChild(frame)
  })
}
