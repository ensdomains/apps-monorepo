import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Pill used to display a labeled value on the decay chart (the `now` marker,
 * the user-selected target, and the hover preview).
 *
 * Layout matches the design spec:
 *  - 71×43, 12px radius, 0.4px lapis-100 border, 6px padding
 *  - Label row: ABCMonumentGrotesk 400 / 12px / line-height 150% / -1.1% tracking
 *  - Value row: ABCMonumentGroteskMono 500 / 16px / -0.176px tracking
 *
 * `min-w` rather than fixed `w` so larger formatted values (e.g. "$999,999")
 * still fit without clipping; in practice the chart formats values with M/k
 * abbreviations so most pills are at the design width.
 */
export type ChartValuePillVariant = 'now' | 'selected' | 'hover'

type ChartValuePillProps = {
  label: ReactNode
  value: ReactNode
  variant?: ChartValuePillVariant
  /** Whether the selected point is in the past — italic + muted label. */
  isPast?: boolean
  className?: string
}

const VALUE_COLOR_BY_VARIANT: Record<ChartValuePillVariant, string> = {
  now: 'text-ens-lapis-500',
  selected: 'text-ens-lapis-dense',
  hover: 'text-ens-lapis-surface',
}

const LABEL_COLOR_BY_VARIANT: Record<ChartValuePillVariant, string> = {
  now: 'text-ens-lapis-dense',
  selected: 'text-ens-lapis-dense',
  hover: 'text-ens-lapis-surface',
}

export const ChartValuePill = ({
  label,
  value,
  variant = 'now',
  isPast = false,
  className,
}: ChartValuePillProps) => (
  <div
    className={cn(
      'inline-flex min-w-[71px] flex-col items-center justify-center gap-0.5',
      'rounded-[12px] border-[0.4px] border-ens-lapis-100 bg-white p-1.5',
      variant === 'hover' && 'opacity-75',
      className,
    )}
  >
    <span
      className={cn(
        'text-center font-normal font-sans text-[12px] leading-[1.5] tracking-[-0.132px]',
        isPast && 'italic',
        LABEL_COLOR_BY_VARIANT[variant],
      )}
    >
      {label}
    </span>
    <span
      className={cn(
        'font-medium font-mono text-[16px] tabular-nums leading-none tracking-[-0.176px]',
        // Past selections are muted regardless of variant.
        isPast ? 'text-ens-lapis-surface' : VALUE_COLOR_BY_VARIANT[variant],
      )}
    >
      {value}
    </span>
  </div>
)
