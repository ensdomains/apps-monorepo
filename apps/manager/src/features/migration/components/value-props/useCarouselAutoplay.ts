import { useEffect } from 'react'

export const AUTOPLAY_INTERVAL_MS = 4000

/** The slide autoplay moves to, wrapping back to the first one. */
export const getNextAutoplayIndex = (
  activeIndex: number,
  slideCount: number,
): number => (activeIndex + 1) % slideCount

/**
 * Moves to the next slide every few seconds. Any change of slide restarts the
 * wait, so a manual move gets the full interval too.
 */
export const useCarouselAutoplay = ({
  activeIndex,
  slideCount,
  isPaused,
  onAdvance,
}: {
  readonly activeIndex: number
  readonly slideCount: number
  readonly isPaused: boolean
  readonly onAdvance: (index: number) => void
}) => {
  useEffect(() => {
    if (isPaused || slideCount < 2) return

    const timeout = setTimeout(
      () => onAdvance(getNextAutoplayIndex(activeIndex, slideCount)),
      AUTOPLAY_INTERVAL_MS,
    )
    return () => clearTimeout(timeout)
  }, [activeIndex, slideCount, isPaused, onAdvance])
}
