import type { PricingDuration, PricingQuote, PricingQuoteMap } from './types'

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
