import { useCallback, useEffect, useRef } from 'react'

type UseAutoScrollCarouselOptions = {
  enabled: boolean
  intervalMs: number
  totalSlides: number
  onSlideChange: (index: number) => void
}

export const useAutoScrollCarousel = ({
  enabled,
  intervalMs,
  totalSlides,
  onSlideChange,
}: UseAutoScrollCarouselOptions) => {
  const currentRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)
  const intervalMsRef = useRef(intervalMs)
  intervalMsRef.current = intervalMs
  const totalSlidesRef = useRef(totalSlides)
  totalSlidesRef.current = totalSlides
  const onSlideChangeRef = useRef(onSlideChange)
  onSlideChangeRef.current = onSlideChange

  const startInterval = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      currentRef.current = (currentRef.current + 1) % totalSlidesRef.current
      onSlideChangeRef.current(currentRef.current)
    }, intervalMsRef.current)
  }, [])

  useEffect(() => {
    if (!enabled) return
    startInterval()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, startInterval])

  const reset = useCallback(
    (fromIndex?: number) => {
      if (fromIndex !== undefined) {
        currentRef.current = fromIndex
      }
      startInterval()
    },
    [startInterval],
  )

  return { reset }
}
