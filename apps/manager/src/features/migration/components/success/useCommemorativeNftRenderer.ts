import { useEffect, useRef, useState } from 'react'

const ARTWORK_TIMEOUT_MS = 10_000
const RENDERER_PAINT_SETTLE_MS = 300

type SourceStatus = 'loading' | 'ready' | 'failed'

export const useCommemorativeNftRenderer = (params: {
  readonly artworkUrl?: string
  readonly rendererUrl?: string
  readonly onReady?: () => void
  readonly onError?: () => void
}) => {
  const [imageStatus, setImageStatus] = useState<SourceStatus>(
    params.artworkUrl ? 'loading' : 'failed',
  )
  const [rendererStatus, setRendererStatus] = useState<SourceStatus>(
    params.rendererUrl ? 'loading' : 'failed',
  )
  const [rendererLoaded, setRendererLoaded] = useState(false)
  const callbacks = useRef(params)
  const reportedStatus = useRef<'ready' | 'failed' | undefined>(undefined)

  useEffect(() => {
    callbacks.current = params
  }, [params])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setImageStatus((status) => (status === 'loading' ? 'failed' : status))
      setRendererStatus((status) => (status === 'loading' ? 'failed' : status))
    }, ARTWORK_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!rendererLoaded || rendererStatus !== 'loading') return
    // The embedded renderer has no ready/error message protocol. Allow its
    // document to paint after load; a loaded image remains the fallback.
    let firstFrame: number | undefined
    let secondFrame: number | undefined
    const timer = window.setTimeout(() => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setRendererStatus('ready')
        })
      })
    }, RENDERER_PAINT_SETTLE_MS)
    return () => {
      window.clearTimeout(timer)
      if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame)
    }
  }, [rendererLoaded, rendererStatus])

  const ready = imageStatus === 'ready' || rendererStatus === 'ready'
  const failed = imageStatus === 'failed' && rendererStatus === 'failed'

  useEffect(() => {
    if (ready && reportedStatus.current !== 'ready') {
      reportedStatus.current = 'ready'
      callbacks.current.onReady?.()
    } else if (failed && reportedStatus.current !== 'failed') {
      reportedStatus.current = 'failed'
      callbacks.current.onError?.()
    }
  }, [failed, ready])

  return {
    imageStatus,
    rendererStatus,
    ready,
    failed,
    onImageLoad: () => setImageStatus('ready'),
    onImageError: () => setImageStatus('failed'),
    onRendererLoad: () => setRendererLoaded(true),
    onRendererError: () => setRendererStatus('failed'),
  }
}
