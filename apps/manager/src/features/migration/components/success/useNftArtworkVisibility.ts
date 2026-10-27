import { useEffect, useRef, useState } from 'react'

/** Keep viewport cards mounted across tab switches; the browser throttles their frames. */
export const useNftArtworkVisibility = (active: boolean) => {
  const ref = useRef<HTMLDivElement>(null)
  const [intersecting, setIntersecting] = useState<boolean | undefined>(
    undefined,
  )
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
    visible: active && intersecting === true,
  }
}
