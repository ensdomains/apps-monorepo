import type { ReactNode } from 'react'

export type PriceCooldownBannerProps = {
  basePricePerYearLabel: string
  currentPremiumLabel: string
  /**
   * Live USD value for the premium pill, recomputed every second from the
   * decay formula. When provided, the pill renders with `AnimateNumber`
   * (slot-machine digit animation) and `currentPremiumLabel` becomes a
   * non-animated fallback for SSR / storybook. When omitted, the pill
   * falls back to the static string `currentPremiumLabel`.
   */
  currentPremiumValue?: number
  premiumEndsAtLabel: string
  periodDays?: number
  timezoneLabel: string
  premiumStartDate: Date
  nowPoint: number
  selectedPoint: number
  onSelectedPointChange: (point: number) => void
  targetPriceInput?: string
  onTargetPriceInputChange?: (value: string) => void
  onTargetPriceInputBlur?: () => void
  targetPriceReachLabel?: ReactNode | null
  favoriteCount?: number
  searchCount30d?: number
  className?: string
  /** Storybook: force expanded state */
  defaultExpanded?: boolean
}
