import { useEffect, useRef, useState } from 'react'
import mysterySrc from '../assets/surprise-card-upright@2x.webp'

/** The artwork remains covered until the placeholder texture and the still artwork are ready. */
export const useNftReveal = (params: {
  readonly enabled: boolean
  readonly status: 'loading' | 'ready' | 'error'
  readonly visible: boolean
  readonly onComplete?: () => void
}) => {
  const host = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const [phase, setPhase] = useState<'waiting' | 'running' | 'complete'>(
    'waiting',
  )
  const complete = phase === 'complete'
  const ready = params.status === 'ready'

  useEffect(() => {
    if (complete) params.onComplete?.()
  }, [complete, params.onComplete])

  useEffect(() => {
    if (!params.enabled || !params.visible) {
      // Returning to an already-revealed card must not replay the ceremony.
      if (started.current) setPhase('complete')
      return
    }
    if (!ready || complete) return
    const element = host.current
    if (!element) return
    let cancelled = false
    let settled = false
    let dispose: (() => void) | undefined
    const images: HTMLImageElement[] = []
    const finish = () => {
      if (cancelled || settled) return
      settled = true
      clearTimeout(timeout)
      dispose?.()
      setPhase('complete')
    }
    const timeout = setTimeout(finish, 10_000)
    const decode = (url: string) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = url
      images.push(image)
      return image.decode().then(() => image)
    }
    void Promise.all([import('./reveal/startNftReveal'), decode(mysterySrc)])
      .then(([{ startNftReveal }, mystery]) => {
        if (cancelled || settled) return
        clearTimeout(timeout)
        dispose = startNftReveal({
          host: element,
          mystery,
          onComplete: finish,
        })
        started.current = true
        setPhase('running')
      })
      .catch(finish)

    return () => {
      cancelled = true
      clearTimeout(timeout)
      dispose?.()
      for (const image of images) image.removeAttribute('src')
    }
  }, [complete, params.enabled, ready, params.visible])

  const revealed = !params.enabled || complete
  return {
    host,
    ready: ready && revealed,
    showArtwork: ready && (phase === 'running' || revealed),
    running: params.enabled && phase === 'running',
    status: ready && !revealed ? ('loading' as const) : params.status,
  }
}
