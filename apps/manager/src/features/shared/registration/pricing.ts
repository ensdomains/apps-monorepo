import type {
  PricingDuration,
  PricingOptions,
  PricingQuoteMap,
} from './pricingTypes'

export const PRICING_DURATIONS: PricingDuration[] = [1, 3, 5, 10]
export const SECONDS_PER_DAY = 86400
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY
export const MIN_REGISTER_DURATION_SECONDS = 2419200
export const MIN_REGISTER_DURATION_YEARS =
  MIN_REGISTER_DURATION_SECONDS / SECONDS_PER_YEAR

export const PRICING_YEAR_DISCOUNTS: Record<PricingDuration, number> = {
  1: 0,
  3: 0,
  5: 0,
  10: 0,
}

export const INITIAL_PRICING_OPTIONS: PricingOptions = {
  1: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[1],
    label: '1 year',
    total: 0,
  },
  3: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[3],
    label: '3 years',
    total: 0,
  },
  5: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[5],
    label: '5 years',
    total: 0,
  },
  10: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[10],
    label: '10 years',
    total: 0,
  },
}

export const createEmptyPricingQuoteMap = (): PricingQuoteMap => ({
  1: {},
  3: {},
  5: {},
  10: {},
})

export const calculateExpirationDate = (years: number): Date => {
  return new Date(Date.now() + years * SECONDS_PER_YEAR * 1000)
}

export const formatExpirationDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const durationYearsToSeconds = (durationYears: number): bigint => {
  if (!Number.isFinite(durationYears) || durationYears <= 0) {
    return BigInt(MIN_REGISTER_DURATION_SECONDS)
  }

  const clampedYears = Math.max(MIN_REGISTER_DURATION_YEARS, durationYears)
  const seconds = Math.round(clampedYears * SECONDS_PER_YEAR)

  return BigInt(Math.max(MIN_REGISTER_DURATION_SECONDS, seconds))
}
