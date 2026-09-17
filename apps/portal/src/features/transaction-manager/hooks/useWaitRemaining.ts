import { useEffect, useState } from 'react'

/**
 * Milliseconds left until `waitUntil`, ticking down to 0 and then stopping.
 * Returns 0 when there is no wait.
 *
 * The value is derived during render rather than held in state: the deadline
 * changes when the button switches which step it targets, and a state copy would
 * still read the previous step's remaining time for a frame — long enough to show
 * the button as actionable in the middle of a cooldown. The effect only drives
 * re-renders; it never owns the value.
 *
 * Shared by the step countdown badge and by the modal's primary button, which
 * stays disabled while a step is still inside its wait window — advancing the
 * flow before then is a no-op (the machine advances itself once the wait ends).
 */
export const useWaitRemaining = (waitUntil: number | undefined): number => {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!waitUntil || waitUntil <= Date.now()) return

    const interval = setInterval(() => {
      tick((n) => n + 1)
      if (waitUntil <= Date.now()) clearInterval(interval)
    }, 500)

    return () => clearInterval(interval)
  }, [waitUntil])

  return waitUntil ? Math.max(0, waitUntil - Date.now()) : 0
}
