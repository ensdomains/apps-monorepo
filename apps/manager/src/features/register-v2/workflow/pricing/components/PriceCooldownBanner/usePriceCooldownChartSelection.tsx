import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { formatPremiumDateTimeLocal } from '../../lib/formatPremiumDateTime'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import {
  dateAtPoint,
  PREMIUM_RESOLUTION,
  pointAtPrice,
  posAtPoint,
  UNIT_CHART_GEO,
} from '../temporary-premium/TemporaryPremiumChart'

// ±$1 around `now` counts as "match". The live `now` is a continuously
// ticking float, so an exact-equals check would never fire.
const TARGET_MATCH_TOLERANCE_USD = 1

function parseTargetPriceInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '')
  const lastSeparator = Math.max(
    cleaned.lastIndexOf('.'),
    cleaned.lastIndexOf(','),
  )
  const normalized =
    lastSeparator === -1
      ? cleaned
      : `${cleaned.slice(0, lastSeparator).replace(/[.,]/g, '')}.${cleaned
          .slice(lastSeparator + 1)
          .replace(/[.,]/g, '')}`
  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

// The chart hides selected view when selectedPoint < 0, so we use -1 as
// "no user selection yet" — only `now` is shown on first load.
const NO_SELECTION = -1

export type PriceCooldownChartSelection = ReturnType<
  typeof usePriceCooldownChartSelection
>

export function usePriceCooldownChartSelection(
  premiumStartDate: Date,
  nowPoint: number,
) {
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

  // A typed price above `now` resolves to a past point. Suppress the selected
  // dot in that case — the reach-label still shows "already below".
  const pointFromTypedPrice = useCallback(
    (price: number): number => {
      const point = pointAtPrice(price)
      return point < nowPoint ? NO_SELECTION : point
    },
    [nowPoint],
  )

  const handleTargetPriceInputChange = useCallback(
    (value: string) => {
      setTargetPriceInput(value)
      const parsed = parseTargetPriceInput(value)
      if (parsed === null) return
      setSelectedPoint(pointFromTypedPrice(parsed))
    },
    [pointFromTypedPrice],
  )

  const handleTargetPriceInputBlur = useCallback(() => {
    if (!targetPriceInput.trim()) {
      setSelectedPoint(NO_SELECTION)
      return
    }
    const parsed = parseTargetPriceInput(targetPriceInput)
    if (parsed === null) return
    const point = pointFromTypedPrice(parsed)
    setSelectedPoint(point)
    if (point !== NO_SELECTION) syncInputFromPoint(point)
  }, [pointFromTypedPrice, syncInputFromPoint, targetPriceInput])

  const targetPriceReachLabel = useMemo((): ReactNode | null => {
    const trimmed = targetPriceInput.trim()
    if (!trimmed) return null
    const parsed = parseTargetPriceInput(trimmed)
    if (parsed === null) return null

    // Compare in the chart's curve coords (same space pointAtPrice maps into).
    const currentPrice = posAtPoint(nowPoint, UNIT_CHART_GEO).price

    // Target = $0 → end of cooldown date, not the generic reach date.
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

    // Target higher than current → already below; no future date.
    if (parsed > currentPrice + TARGET_MATCH_TOLERANCE_USD) {
      return (
        <>
          You&apos;re in luck — the fee is already below your{' '}
          <span className="text-[#353535]">{formatUsd(parsed)}</span> target.
        </>
      )
    }

    // Target within ±$1 of `now`.
    if (Math.abs(parsed - currentPrice) <= TARGET_MATCH_TOLERANCE_USD) {
      return (
        <>
          The fee is currently at{' '}
          <span className="text-[#353535]">{formatUsd(currentPrice)}</span>, you
          can buy now.
        </>
      )
    }

    // Target below `now` → project to the date the curve will reach it.
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
