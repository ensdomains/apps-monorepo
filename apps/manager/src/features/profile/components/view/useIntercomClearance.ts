import { useEffect } from 'react'
import {
  INTERCOM_LAUNCHER_GAP,
  resetIntercomLauncherClearance,
  setIntercomLauncherClearance,
} from '@/lib/intercom'

/** Keeps the Intercom launcher above a bar fixed to the bottom of the viewport. */
export const useIntercomClearance = (bar: HTMLElement | null) => {
  useEffect(() => {
    if (!bar) return

    const apply = () => {
      const { top } = bar.getBoundingClientRect()
      setIntercomLauncherClearance(
        window.innerHeight - top + INTERCOM_LAUNCHER_GAP,
      )
    }

    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(bar)
    window.addEventListener('resize', apply)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', apply)
      resetIntercomLauncherClearance()
    }
  }, [bar])
}
