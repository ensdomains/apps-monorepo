import { useCallback, useEffect, useState } from 'react'

type ImageStatus = 'loading' | 'ready' | 'failed'
type RendererStatus = ImageStatus
type NftArtworkStatus = 'loading' | 'ready' | 'error'

const resolveNftArtworkStatus = (params: {
  readonly animate: boolean
  readonly renderer: RendererStatus
  readonly image: ImageStatus
}): NftArtworkStatus => {
  if (params.animate && params.renderer !== 'failed')
    return params.renderer === 'ready' ? 'ready' : 'loading'
  return params.image === 'failed' ? 'error' : params.image
}

/** Predecode the fallback alongside the renderer, without revealing it early. */
export const useDecodedNftImage = (imageUrl: string | undefined) => {
  const [source, setSource] = useState<{ url?: string; status: ImageStatus }>({
    url: imageUrl,
    status: imageUrl ? 'loading' : 'failed',
  })

  useEffect(() => {
    if (!imageUrl) return
    setSource({ url: imageUrl, status: 'loading' })
    let cancelled = false
    const image = new Image()
    const finish = (nextStatus: ImageStatus) => {
      if (cancelled) return
      clearTimeout(timer)
      setSource((current) =>
        current.url === imageUrl && current.status === 'loading'
          ? { url: imageUrl, status: nextStatus }
          : current,
      )
    }
    const timer = setTimeout(() => finish('failed'), 10_000)
    image.decoding = 'async'
    image.onload = () => {
      void image.decode().then(
        () => finish('ready'),
        () => finish('failed'),
      )
    }
    image.onerror = () => finish('failed')
    image.src = imageUrl

    return () => {
      cancelled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      image.removeAttribute('src')
    }
  }, [imageUrl])

  return source.url === imageUrl
    ? source.status
    : imageUrl
      ? 'loading'
      : 'failed'
}

export const useNftArtworkLoading = (params: {
  readonly imageUrl?: string
  readonly animate: boolean
  readonly waitingForVisibility?: boolean
}) => {
  const image = useDecodedNftImage(params.imageUrl)
  const [renderer, setRenderer] = useState<RendererStatus>('loading')
  const [revealed, setRevealed] = useState(false)
  const initialStatus = params.waitingForVisibility
    ? 'loading'
    : resolveNftArtworkStatus({ animate: params.animate, renderer, image })
  const status =
    initialStatus === 'loading' && revealed && image === 'ready'
      ? 'ready'
      : initialStatus

  useEffect(() => {
    if (status === 'ready') setRevealed(true)
  }, [status])

  useEffect(() => {
    // A suspended iframe is recreated on return. A failure stays latched until
    // the user explicitly retries; scrolling must not start another attempt.
    if (!params.animate)
      setRenderer((current) => (current === 'failed' ? current : 'loading'))
  }, [params.animate])

  const onRendererReady = useCallback(
    () => setRenderer((current) => (current === 'failed' ? current : 'ready')),
    [],
  )
  const onRendererError = useCallback(() => setRenderer('failed'), [])

  return {
    imageReady: image === 'ready',
    animationReady: params.animate && renderer === 'ready',
    renderAnimation: params.animate && renderer !== 'failed',
    status,
    onRendererReady,
    onRendererError,
  }
}
