import type { ReactNode } from 'react'

export type PriceCooldownBannerProps = {
  basePricePerYearLabel: string
  currentPremiumLabel: string
  premiumEndsAtLabel: string
  periodDays?: number
  chartStartLabel: string
  chartWindowProgress: number
  timezoneLabel: string
  targetPriceInput?: string
  onTargetPriceInputChange?: (value: string) => void
  targetPriceReachLabel?: ReactNode | null
  favoriteCount?: number
  searchCount30d?: number
  className?: string
  /** Storybook: force expanded state */
  defaultExpanded?: boolean
}
