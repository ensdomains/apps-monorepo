import { useEffect, useState } from 'react'

/**
 * Milliseconds left until `waitUntil`, ticking down to 0 and then stopping.
 * Returns 0 when there is no wait.
 *
 * Shared by the step countdown badge and by the modal's primary button, which
 * stays disabled while a step is still inside its wait window — advancing the
 * flow before then is a no-op (the machine advances itself once the wait ends).
 */
export const useWaitRemaining = (waitUntil: number | undefined): number => {
  const [remainingMs, setRemainingMs] = useState(() =>
    waitUntil ? Math.max(0, waitUntil - Date.now()) : 0,
  )

  useEffect(() => {
    const initial = waitUntil ? Math.max(0, waitUntil - Date.now()) : 0
    setRemainingMs(initial)
    if (!waitUntil || initial <= 0) return

    const interval = setInterval(() => {
      const next = Math.max(0, waitUntil - Date.now())
      setRemainingMs(next)
      if (next <= 0) clearInterval(interval)
    }, 500)

    return () => clearInterval(interval)
  }, [waitUntil])

  return remainingMs
}
