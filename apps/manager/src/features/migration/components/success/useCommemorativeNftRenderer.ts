import { useCallback, useEffect, useRef, useState } from 'react'
import { trackNftEvent } from '../../commemorative-nft/diagnostics'

const RENDERER_TIMEOUT_MS = 10_000
const RENDERER_MESSAGE_TYPE = 'ens-commemorative-nft-renderer'

export type NftRevealFrame = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const parseRevealFrame = (value: unknown): NftRevealFrame | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const { x, y, width, height } = value as Record<string, unknown>
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return undefined
  return { x, y, width, height }
}

type SourceStatus = 'loading' | 'ready' | 'failed'

export const useCommemorativeNftRenderer = (params: {
  readonly rendererUrl?: string
  readonly onReady?: () => void
  readonly onError?: () => void
  readonly holdForReveal?: boolean
}) => {
  const rendererRef = useRef<HTMLIFrameElement>(null)
  const [revealFrame, setRevealFrame] = useState<NftRevealFrame>()
  const rendererDocumentLoaded = useRef(false)
  const rendererUrl =
    params.rendererUrl && URL.canParse(params.rendererUrl)
      ? new URL(params.rendererUrl)
      : undefined
  const rendererOrigin = rendererUrl?.origin
  const tokenId = rendererUrl?.searchParams.get('tokenId')
  const [rendererStatus, setRendererStatus] = useState<SourceStatus>(
    rendererOrigin && tokenId ? 'loading' : 'failed',
  )
  const callbacks = useRef(params)
  const reportedStatus = useRef<'ready' | 'failed' | undefined>(undefined)
  const failureReason = useRef<'renderer_failed' | 'renderer_timeout'>(
    'renderer_failed',
  )
  const requestRendererStatus = useCallback(() => {
    if (!rendererOrigin || !tokenId) return
    rendererRef.current?.contentWindow?.postMessage(
      { type: RENDERER_MESSAGE_TYPE, status: 'request', tokenId },
      rendererOrigin,
    )
  }, [rendererOrigin, tokenId])
  const onRendererLoad = useCallback(() => {
    rendererDocumentLoaded.current = true
    requestRendererStatus()
  }, [requestRendererStatus])

  useEffect(() => {
    callbacks.current = params
  }, [params])

  useEffect(() => {
    if (!rendererOrigin || !tokenId) return

    const onMessage = (event: MessageEvent<unknown>) => {
      const rendererWindow = rendererRef.current?.contentWindow
      if (
        !rendererWindow ||
        event.source !== rendererWindow ||
        event.origin !== rendererOrigin
      )
        return

      const message = event.data
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        message.type !== RENDERER_MESSAGE_TYPE ||
        !('tokenId' in message) ||
        message.tokenId !== tokenId ||
        !('status' in message)
      )
        return

      if (message.status === 'failed') setRendererStatus('failed')
      else if (message.status === 'ready') {
        setRevealFrame(parseRevealFrame(Reflect.get(message, 'revealFrame')))
        setRendererStatus((status) => (status === 'loading' ? 'ready' : status))
      }
    }

    window.addEventListener('message', onMessage)
    // A cached iframe can finish loading before this passive effect attaches.
    if (rendererDocumentLoaded.current) requestRendererStatus()
    return () => window.removeEventListener('message', onMessage)
  }, [rendererOrigin, tokenId, requestRendererStatus])

  useEffect(() => {
    if (rendererStatus !== 'loading') return
    const timer = window.setTimeout(() => {
      failureReason.current = 'renderer_timeout'
      setRendererStatus('failed')
    }, RENDERER_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [rendererStatus])

  const ready = rendererStatus === 'ready'
  const failed = rendererStatus === 'failed'
  const requestedReveal = rendererUrl?.searchParams.get('reveal') === '1'

  useEffect(() => {
    if (
      !ready ||
      params.holdForReveal ||
      !requestedReveal ||
      !rendererOrigin ||
      !tokenId
    )
      return
    rendererRef.current?.contentWindow?.postMessage(
      { type: RENDERER_MESSAGE_TYPE, status: 'animate', tokenId },
      rendererOrigin,
    )
  }, [ready, params.holdForReveal, requestedReveal, rendererOrigin, tokenId])

  useEffect(() => {
    if (ready && reportedStatus.current !== 'ready') {
      reportedStatus.current = 'ready'
      callbacks.current.onReady?.()
    } else if (failed && reportedStatus.current !== 'failed') {
      reportedStatus.current = 'failed'
      trackNftEvent('nft:renderer_fallback', { reason: failureReason.current })
      callbacks.current.onError?.()
    }
  }, [failed, ready])

  return {
    rendererRef,
    revealFrame,
    rendererStatus,
    ready,
    failed,
    // Document load only starts the handshake; the first rendered frame is ready.
    onRendererLoad,
    onRendererError: () => setRendererStatus('failed'),
  }
}
