import { useEffect, useRef, useState } from 'react'

const RENDERER_TIMEOUT_MS = 10_000

type SourceStatus = 'loading' | 'ready' | 'failed'

export const useCommemorativeNftRenderer = (params: {
  readonly rendererUrl?: string
  readonly onReady?: () => void
  readonly onError?: () => void
}) => {
  const [rendererStatus, setRendererStatus] = useState<SourceStatus>(
    params.rendererUrl ? 'loading' : 'failed',
  )
  const callbacks = useRef(params)
  const reportedStatus = useRef<'ready' | 'failed' | undefined>(undefined)

  useEffect(() => {
    callbacks.current = params
  }, [params])

  useEffect(() => {
    if (rendererStatus !== 'loading') return
    const timer = window.setTimeout(() => {
      setRendererStatus('failed')
    }, RENDERER_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [rendererStatus])

  const ready = rendererStatus === 'ready'
  const failed = rendererStatus === 'failed'

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
    rendererStatus,
    ready,
    failed,
    onRendererLoad: () =>
      setRendererStatus((status) => (status === 'loading' ? 'ready' : status)),
    onRendererError: () => setRendererStatus('failed'),
  }
}
