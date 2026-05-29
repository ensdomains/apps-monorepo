import { useEffect, useState } from 'react'

/**
 * Reactive timestamp that re-renders the subscriber every `intervalMs`.
 *
 * Used by the temporary-premium cooldown UI to crawl the chart's "now" dot
 * smoothly between on-chain rentPrice refetches: we anchor the premium
 * start date once, then derive `nowPoint = pointAtDate(new Date(nowMs), …)`
 * from this tick.
 *
 * `nowFn` is the source of truth for "what time is it". Production uses
 * `Date.now`. The dev simulation passes `mockNow` (see mocks/mockClock.ts)
 * so the banner pill, the chart's `now` dot, and the mocked pricing query
 * all read from the same virtual clock — keeping the cart total and the
 * banner premium in lockstep when `VITE_FF_MOCK_TEMP_PREMIUM_TIME_SCALE`
 * is set.
 *
 * Implementation note: we use `useState + useEffect` rather than
 * `useSyncExternalStore`. The latter would require a stable `getSnapshot`
 * — `() => Date.now()` violates that contract because it returns a
 * different value on every call, and React responds by re-rendering until
 * it hits the "Maximum update depth exceeded" bail-out.
 */
export function useTickingNowMs(
  intervalMs = 1000,
  enabled = true,
  nowFn: () => number = Date.now,
): number {
  const [nowMs, setNowMs] = useState<number>(() => nowFn())

  useEffect(() => {
    if (!enabled) return
    // Snap to current time the moment we enable, so the first paint after a
    // disabled→enabled flip doesn't lag by up to intervalMs.
    setNowMs(nowFn())
    const id = setInterval(() => {
      setNowMs(nowFn())
    }, intervalMs)
    return () => clearInterval(id)
    // `nowFn` is expected to be a stable module-level reference (Date.now
    // or the imported `mockNow`). If callers pass an inline arrow they'll
    // re-create the interval each render — caller's responsibility.
  }, [intervalMs, enabled, nowFn])

  return nowMs
}
