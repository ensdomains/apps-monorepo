import { useEffect, useRef, useState } from 'react'

/** Mount the expensive iframe only while its card can actually be seen. */
export const useNftArtworkVisibility = (active: boolean) => {
  const ref = useRef<HTMLDivElement>(null)
  const [intersecting, setIntersecting] = useState<boolean | undefined>(
    undefined,
  )
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document !== 'undefined' && document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    const onVisibilityChange = () =>
      setDocumentVisible(document.visibilityState !== 'hidden')
    onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setIntersecting(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIntersecting(entry?.isIntersecting === true)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return {
    ref,
    resolved: intersecting !== undefined,
    visible: active && intersecting === true && documentVisible,
  }
}
