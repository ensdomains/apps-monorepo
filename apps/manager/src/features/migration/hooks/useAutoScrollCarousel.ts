import { useEffect, useRef } from 'react'

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

  useEffect(() => {
    if (!enabled) return

    timerRef.current = setInterval(() => {
      currentRef.current = (currentRef.current + 1) % totalSlides
      onSlideChange(currentRef.current)
    }, intervalMs)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, intervalMs, totalSlides, onSlideChange])

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      currentRef.current = (currentRef.current + 1) % totalSlides
      onSlideChange(currentRef.current)
    }, intervalMs)
  }

  return { reset }
}
