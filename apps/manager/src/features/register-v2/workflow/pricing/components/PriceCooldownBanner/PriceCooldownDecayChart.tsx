import { Trans } from '@lingui/react/macro'
import { tw } from '@/utils/tailwind'

type PriceCooldownDecayChartProps = {
  startLabel: string
  currentPremiumLabel: string
  windowProgress: number
  timezoneLabel: string
  compact?: boolean
}

/** Exponential decay curve with a "now" marker along the premium window. */
export const PriceCooldownDecayChart = ({
  startLabel,
  currentPremiumLabel,
  windowProgress,
  timezoneLabel,
  compact = false,
}: PriceCooldownDecayChartProps) => {
  const progress = Math.max(0, Math.min(1, windowProgress))
  const viewW = 300
  const viewH = compact ? 124 : 178
  const pad = 12
  const plotW = viewW - pad * 2
  const plotH = viewH - pad * 2

  const curvePath = `M ${pad} ${pad + plotH * 0.08} C ${pad + plotW * 0.35} ${pad + plotH * 0.35}, ${pad + plotW * 0.65} ${pad + plotH * 0.72}, ${pad + plotW} ${pad + plotH}`

  const markerX = pad + plotW * progress
  const markerY = pad + plotH * (0.08 + 0.92 * (1 - progress ** 0.55))

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className={tw(
          'relative overflow-hidden rounded-xl bg-ens-lapis-100',
          'shadow-[inset_0px_0px_4px_0px_rgba(198,223,233,0.3)]',
          compact ? 'h-[124px]' : 'min-h-[178px]',
        )}
      >
        <svg
          aria-hidden
          className="size-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${viewW} ${viewH}`}
        >
          <path
            d={curvePath}
            fill="none"
            stroke="var(--color-ens-lapis-500)"
            strokeWidth="2.5"
          />
          <circle
            cx={markerX}
            cy={markerY}
            fill="var(--color-ens-lapis-500)"
            r="4"
          />
          <line
            stroke="var(--color-ens-lapis-400)"
            strokeDasharray="4 4"
            strokeWidth="1.5"
            x1={markerX}
            x2={markerX + 52}
            y1={markerY}
            y2={markerY}
          />
        </svg>
        <span
          className={tw(
            'absolute top-2 left-3 font-mono text-ens-lapis-400',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          {startLabel}
        </span>
        <span
          className={tw(
            'absolute right-3 bottom-2 font-mono text-ens-lapis-400',
            compact ? 'text-[10px]' : 'text-xs',
          )}
        >
          $0
        </span>
        <div
          className="absolute flex flex-col"
          style={{
            left: `${Math.min(72, (markerX / viewW) * 100)}%`,
            top: `${Math.max(8, (markerY / viewH) * 100 - 18)}%`,
          }}
        >
          <span className="text-[#595755] text-xs leading-normal">
            <Trans>now</Trans>
          </span>
          <span className="font-medium font-mono text-base text-ens-lapis-500 leading-normal">
            {currentPremiumLabel}
          </span>
        </div>
      </div>
      <p className="text-[#737373] text-xs leading-5">
        <Trans>Times shown in your local time zone ({timezoneLabel})</Trans>
      </p>
    </div>
  )
}
