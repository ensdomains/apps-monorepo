import { type ReactNode, useCallback, useMemo, useState } from 'react'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { formatPremiumDateTimeLocal } from '../../lib/formatPremiumDateTime'
import { formatPriceForInput } from '../../lib/formatPriceForInput'
import {
  dateAtPoint,
  pointAtPrice,
  posAtPoint,
  UNIT_CHART_GEO,
} from '../temporary-premium/TemporaryPremiumChart'

function parseTargetPriceInput(raw: string): number | null {
  const parsed = Number.parseFloat(raw.replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export function usePriceCooldownChartSelection(
  premiumStartDate: Date,
  nowPoint: number,
) {
  const [selectedPoint, setSelectedPoint] = useState(nowPoint)
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
      setSelectedPoint(nowPoint)
      return
    }
    const parsed = parseTargetPriceInput(targetPriceInput)
    if (parsed === null) return
    const point = pointAtPrice(parsed)
    setSelectedPoint(point)
    syncInputFromPoint(point)
  }, [nowPoint, syncInputFromPoint, targetPriceInput])

  const targetPriceReachLabel = useMemo((): ReactNode | null => {
    const parsed = parseTargetPriceInput(targetPriceInput)
    if (parsed === null || !targetPriceInput.trim()) return null

    const reachDate = dateAtPoint(selectedPoint, premiumStartDate)
    const price = posAtPoint(selectedPoint, UNIT_CHART_GEO).price

    if (selectedPoint < nowPoint) {
      return (
        <>
          Price was {formatUsd(price)} on{' '}
          <span className="text-[#353535]">
            {formatPremiumDateTimeLocal(reachDate.getTime())}.
          </span>
        </>
      )
    }

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
