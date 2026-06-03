import type { ReactNode } from 'react'

export type PriceCooldownBannerProps = {
  basePricePerYearLabel: string
  currentPremiumLabel: string
  /** Live USD value for the animated pill. Falls back to currentPremiumLabel. */
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
