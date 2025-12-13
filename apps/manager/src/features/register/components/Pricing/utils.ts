import type { PricingDuration, PricingOptions, PricingQuoteMap } from './types'

export const PRICING_DURATIONS: PricingDuration[] = [1, 2, 3, 4, 5]

export const PRICING_YEAR_DISCOUNTS: Record<PricingDuration, number> = {
  1: 0,
  2: 15,
  3: 40,
  4: 45,
  5: 50,
}

export const INITIAL_PRICING_OPTIONS: PricingOptions = {
  1: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[1],
    label: '1 year',
    total: 0,
  },
  2: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[2],
    label: '2 years',
    total: 0,
  },
  3: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[3],
    label: '3 years',
    badge: 'best',
    total: 0,
  },
  4: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[4],
    label: '4 years',
    total: 0,
  },
  5: {
    price: 0,
    discount: PRICING_YEAR_DISCOUNTS[5],
    label: '5 years+',
    total: 0,
  },
}

export function getInitialPricingOptions(
  discountsEnabled: boolean,
): PricingOptions {
  if (discountsEnabled) {
    return INITIAL_PRICING_OPTIONS
  }

  return {
    1: {
      ...INITIAL_PRICING_OPTIONS[1],
      discount: 0,
    },
    2: {
      ...INITIAL_PRICING_OPTIONS[2],
      discount: 0,
    },
    3: {
      ...INITIAL_PRICING_OPTIONS[3],
      discount: 0,
    },
    4: {
      ...INITIAL_PRICING_OPTIONS[4],
      discount: 0,
    },
    5: {
      ...INITIAL_PRICING_OPTIONS[5],
      discount: 0,
    },
  }
}

export function sanitizePricingDuration(
  value: number | undefined | null,
): PricingDuration {
  const defaultDuration: PricingDuration = 1

  if (value == null || Number.isNaN(value)) return defaultDuration

  const rounded = Math.round(value)
  const firstDuration = PRICING_DURATIONS[0] ?? 1
  const lastDuration = PRICING_DURATIONS[PRICING_DURATIONS.length - 1] ?? 5
  const clamped = Math.max(
    firstDuration,
    Math.min(lastDuration, rounded),
  ) as PricingDuration

  if (PRICING_DURATIONS.includes(clamped)) {
    return clamped
  }

  return defaultDuration
}

export const createEmptyPricingQuoteMap = (): PricingQuoteMap => ({
  1: {},
  2: {},
  3: {},
  4: {},
  5: {},
})

export const formatDuration = (duration: number): string => {
  return duration.toString().padStart(2, '0')
}

export const calculateExpirationDate = (years: number): Date => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + years)
  return date
}

export const formatExpirationDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Calculates the duration in years from today to a target date, rounding up to the nearest year
 * @param targetDate - The target expiration date
 * @returns The duration in years (minimum 1), rounded up
 */
export const calculateDurationFromDate = (targetDate: Date): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(targetDate)
  target.setHours(0, 0, 0, 0)

  const diffMs = target.getTime() - today.getTime()

  if (diffMs <= 0) {
    return 1
  }

  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000)
  const roundedYears = Math.ceil(diffYears)

  return Math.max(1, roundedYears)
}
