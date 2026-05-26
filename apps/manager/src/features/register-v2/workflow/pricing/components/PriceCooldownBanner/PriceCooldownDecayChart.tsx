import { Trans } from '@lingui/react/macro'
import { TemporaryPremiumChart } from '../temporary-premium/TemporaryPremiumChart'

type PriceCooldownDecayChartProps = {
  premiumStartDate: Date
  nowPoint: number
  selectedPoint: number
  onSelectedPointChange: (point: number) => void
  timezoneLabel: string
  compact?: boolean
}

/** Temporary premium decay chart wired to the v3-style TemporaryPremiumChart component. */
export const PriceCooldownDecayChart = ({
  premiumStartDate,
  nowPoint,
  selectedPoint,
  onSelectedPointChange,
  timezoneLabel,
  compact = false,
}: PriceCooldownDecayChartProps) => (
  <div className="flex w-full flex-col gap-2">
    <TemporaryPremiumChart
      allowPastSelection
      height={compact ? 180 : 240}
      nowPoint={nowPoint}
      onSelect={onSelectedPointChange}
      selectedPoint={selectedPoint}
      startDate={premiumStartDate}
    />
    <p className="text-[#737373] text-xs leading-5">
      <Trans>Times shown in your local time zone ({timezoneLabel})</Trans>
    </p>
  </div>
)
