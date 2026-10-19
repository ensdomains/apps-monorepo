import { useEffect } from 'react'
import { setIntercomLauncherClearance } from '@/lib/intercom'

const SETTLE_MS = 100
const LAUNCHER_SIZE = 60
const LAUNCHER_RIGHT_PADDING = 20

/** Lifts Intercom only when a fixed bottom bar overlaps its default position. */
export const useIntercomClearance = (bar: HTMLElement | null) => {
  useEffect(() => {
    if (!bar) return

    let lastClearance = -1
    let timer: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      const { height, left, right, top } = bar.getBoundingClientRect()
      const launcherRight = window.innerWidth - LAUNCHER_RIGHT_PADDING
      const launcherLeft = launcherRight - LAUNCHER_SIZE
      const isLauncherOverlapping = right > launcherLeft && left < launcherRight
      const clearance =
        height > 0 && isLauncherOverlapping
          ? Math.round(window.innerHeight - top)
          : 0
      if (clearance === lastClearance) return
      lastClearance = clearance
      setIntercomLauncherClearance(clearance)
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(apply, SETTLE_MS)
    }

    apply()
    const observer = new ResizeObserver(schedule)
    observer.observe(bar)
    window.addEventListener('resize', schedule)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      setIntercomLauncherClearance(0)
    }
  }, [bar])
}
