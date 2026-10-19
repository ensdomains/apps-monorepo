import { useEffect } from 'react'
import { setIntercomLauncherClearance } from '@/lib/intercom'

const SETTLE_MS = 100

/** Keeps the Intercom launcher above a bar fixed to the bottom of the viewport. */
export const useIntercomClearance = (bar: HTMLElement | null) => {
  useEffect(() => {
    if (!bar) return

    let lastClearance = -1
    let timer: ReturnType<typeof setTimeout> | undefined

    const apply = () => {
      const { height, top } = bar.getBoundingClientRect()
      const clearance = height === 0 ? 0 : Math.round(window.innerHeight - top)
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
