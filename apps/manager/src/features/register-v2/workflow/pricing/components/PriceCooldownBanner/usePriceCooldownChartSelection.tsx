import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { formatPremiumDateTimeLocal } from '../../lib/formatPremiumDateTime'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import {
  dateAtPoint,
  pointAtPrice,
  posAtPoint,
  PREMIUM_RESOLUTION,
  UNIT_CHART_GEO,
} from '../temporary-premium/TemporaryPremiumChart'

/**
 * Dollar window around the current fee where we consider the user's typed
 * target to "match" the current price. Within ±$1 → "currently at $X"
 * message; outside that we either fall into the future-reach or
 * already-below branches. The chart's `now` value is a float that ticks
 * sub-cent per second so an exact-match check would basically never fire.
 */
const TARGET_MATCH_TOLERANCE_USD = 1

function parseTargetPriceInput(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

/**
 * Sentinel for "no user selection yet". The chart's selectedView memo
 * returns null when selectedPoint < 0, which hides the selected dot, leader
 * line, and label. This matches the v3 reference UX: on first load the chart
 * shows only the `now` dot; the black selected dot appears only after the
 * user clicks the curve or types a target price.
 */
const NO_SELECTION = -1

export function usePriceCooldownChartSelection(
  premiumStartDate: Date,
  nowPoint: number,
) {
  // Initialize to NO_SELECTION rather than nowPoint. The old behaviour
  // (init = nowPoint) was visually invisible only while selectedPoint was
  // exactly at the moving nowPoint — under MOCK_TIME_SCALE the gap opens
  // up within a second or two, making a stale "past" selected dot appear
  // unprompted.
  const [selectedPoint, setSelectedPoint] = useState<number>(NO_SELECTION)
  const [targetPriceInput, setTargetPriceInput] = useState('')

  const syncInputFromPoint = useCallback((point: number) => {
    const price = posAtPoint(point, UNIT_CHART_GEO).price
    setTargetPriceInput(formatPriceForInput(price))
  }, [])

  const handleSelectedPointChange = useCallback(
    (point: number) => {
      setSelectedPoint(point)
      syncInputFromPoint(point)
    },
    [syncInputFromPoint],
  )

  const handleTargetPriceInputChange = useCallback((value: string) => {
    setTargetPriceInput(value)
    const parsed = parseTargetPriceInput(value)
    if (parsed === null) return
    setSelectedPoint(pointAtPrice(parsed))
  }, [])

  const handleTargetPriceInputBlur = useCallback(() => {
    if (!targetPriceInput.trim()) {
      // Empty input → clear selection entirely (return to "only now-dot"
      // state). Previously this snapped the selection to nowPoint, which
      // showed a momentary at-now selected dot and then drifted into the
      // past as nowPoint advanced.
      setSelectedPoint(NO_SELECTION)
      return
    }
    const parsed = parseTargetPriceInput(targetPriceInput)
    if (parsed === null) return
    const point = pointAtPrice(parsed)
    setSelectedPoint(point)
    syncInputFromPoint(point)
  }, [syncInputFromPoint, targetPriceInput])

  const targetPriceReachLabel = useMemo((): ReactNode | null => {
    const trimmed = targetPriceInput.trim()
    if (!trimmed) return null
    const parsed = parseTargetPriceInput(trimmed)
    if (parsed === null) return null

    // All comparisons happen in the chart's curve coordinate system, since
    // `pointAtPrice` (used to convert the user's input to a selectedPoint)
    // operates on the same curve. Keeps the input/selectedPoint loop
    // internally consistent.
    const currentPrice = posAtPoint(nowPoint, UNIT_CHART_GEO).price

    // Case 3 — user typed $0. The fee hits $0 exactly at the end of the
    // 21-day window (premiumStart + period). Show that end date with the
    // "end of the cooldown" framing rather than the generic reach date.
    if (parsed === 0) {
      const endDate = dateAtPoint(PREMIUM_RESOLUTION, premiumStartDate)
      return (
        <>
          The fee will reach $0 on{' '}
          <span className="text-[#353535]">
            {formatPremiumDateTimeLocal(endDate.getTime())}
          </span>{' '}
          — the end of the cooldown.
        </>
      )
    }

    // Case 1 — target is meaningfully higher than the current fee. The user
    // is saying "I'd pay X" but the chain already wants less than X, so
    // they can buy now. We don't surface a future date here — there isn't
    // a meaningful one.
    if (parsed > currentPrice + TARGET_MATCH_TOLERANCE_USD) {
      return (
        <>
          You&apos;re in luck — the fee is already below your{' '}
          <span className="text-[#353535]">{formatUsd(parsed)}</span> target.
        </>
      )
    }

    // Case 2 — target sits within $1 of the current fee. Treat as "match".
    if (Math.abs(parsed - currentPrice) <= TARGET_MATCH_TOLERANCE_USD) {
      return (
        <>
          The fee is currently at{' '}
          <span className="text-[#353535]">{formatUsd(currentPrice)}</span>,
          you can buy now.
        </>
      )
    }

    // Default — target is below the current fee. Project forward to the
    // date when the decay curve will hit that price.
    const reachDate = dateAtPoint(selectedPoint, premiumStartDate)
    const price = posAtPoint(selectedPoint, UNIT_CHART_GEO).price
    return (
      <>
        The fee will reach {formatUsd(price)} on{' '}
        <span className="text-[#353535]">
          {formatPremiumDateTimeLocal(reachDate.getTime())}.
        </span>
      </>
    )
  }, [nowPoint, premiumStartDate, selectedPoint, targetPriceInput])

  return {
    selectedPoint,
    targetPriceInput,
    handleSelectedPointChange,
    handleTargetPriceInputChange,
    handleTargetPriceInputBlur,
    targetPriceReachLabel,
  }
}
