import type { PricingDuration, PricingOptions, PricingQuoteMap } from './types'

// ============================================================================
// PRICING CONSTANTS
// ============================================================================

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

export function sanitizePricingDuration(
  value: number | undefined | null,
): PricingDuration {
  const defaultDuration: PricingDuration = 1

  if (value == null || Number.isNaN(value)) return defaultDuration

  const rounded = Math.round(value)
  const firstDuration = PRICING_DURATIONS[0]!
  const lastDuration = PRICING_DURATIONS[PRICING_DURATIONS.length - 1]!
  const clamped = Math.max(
    firstDuration,
    Math.min(lastDuration, rounded),
  ) as PricingDuration

  if (PRICING_DURATIONS.includes(clamped)) {
    return clamped
  }

  return defaultDuration
}

// ============================================================================
// PRICING UTILITIES
// ============================================================================

/**
 * Creates an empty pricing quote map with all durations initialized to empty objects
 */
export const createEmptyPricingQuoteMap = (): PricingQuoteMap => ({
  1: {},
  2: {},
  3: {},
  4: {},
  5: {},
})

/**
 * Formats a duration number with leading zero (e.g., 1 -> "01")
 */
export const formatDuration = (duration: PricingDuration): string => {
  return duration.toString().padStart(2, '0')
}

/**
 * Calculates the expiration date based on duration in years
 */
export const calculateExpirationDate = (years: number): Date => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + years)
  return date
}

/**
 * Formats a date in a readable format (e.g., "January 15, 2025")
 */
export const formatExpirationDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
