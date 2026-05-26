import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { SECONDS_IN_YEAR } from '../../../utils/time'
import type { PriceCooldownBannerProps } from '../components/PriceCooldownBanner/types'
import { formatPremiumDateTimeLocal } from './formatPremiumDateTime'
import { ORACLE_PRICE_DECIMALS } from './oracle'
import {
  getPremiumInstantRange,
  getPremiumPeriodDays,
  type PremiumDecayConfig,
  type PremiumInstantRange,
} from './premiumDecay'

export type BuildPriceCooldownBannerInput = {
  premiumUsd: number
  baseRatePerSecond: bigint
  premiumDecay: PremiumDecayConfig
}

export type BuildPriceCooldownBannerResult = {
  show: boolean
  props: Omit<
    PriceCooldownBannerProps,
    | 'premiumStartDate'
    | 'nowPoint'
    | 'selectedPoint'
    | 'onSelectedPointChange'
    | 'targetPriceInput'
    | 'onTargetPriceInputChange'
    | 'onTargetPriceInputBlur'
    | 'targetPriceReachLabel'
  >
  premiumRange: PremiumInstantRange | null
  premiumDecay: PremiumDecayConfig
}

export function buildPriceCooldownBannerProps({
  premiumUsd,
  baseRatePerSecond,
  premiumDecay,
}: BuildPriceCooldownBannerInput): BuildPriceCooldownBannerResult | null {
  if (premiumUsd <= 0) return null

  const premiumRange = getPremiumInstantRange(
    premiumUsd,
    undefined,
    premiumDecay,
  )
  if (!premiumRange) return null

  const basePricePerYearUsd = decimalBigintToNumber(
    baseRatePerSecond * BigInt(SECONDS_IN_YEAR),
    ORACLE_PRICE_DECIMALS,
  )

  const periodDays = getPremiumPeriodDays(premiumDecay)

  return {
    show: true,
    premiumRange,
    premiumDecay,
    props: {
      basePricePerYearLabel: `${formatUsd(Math.ceil(basePricePerYearUsd))}/year`,
      currentPremiumLabel: formatUsd(premiumUsd),
      premiumEndsAtLabel: formatPremiumDateTimeLocal(premiumRange.endMs),
      periodDays,
      timezoneLabel: getLocalTimezoneLabel(),
    },
  }
}

function getLocalTimezoneLabel(): string {
  try {
    const offsetMinutes = -new Date().getTimezoneOffset()
    const sign = offsetMinutes >= 0 ? '+' : '-'
    const abs = Math.abs(offsetMinutes)
    const hours = Math.floor(abs / 60)
    const mins = abs % 60
    const offset =
      mins === 0
        ? `UTC${sign}${hours}`
        : `UTC${sign}${hours}:${String(mins).padStart(2, '0')}`
    return offset
  } catch {
    return 'UTC'
  }
}
