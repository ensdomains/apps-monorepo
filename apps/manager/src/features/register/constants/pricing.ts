import type {
  PricingDuration,
  PricingOptions,
} from '../components/CheckAvailability/types'

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
  const clamped = Math.max(
    PRICING_DURATIONS[0],
    Math.min(PRICING_DURATIONS[PRICING_DURATIONS.length - 1], rounded),
  ) as PricingDuration

  if (PRICING_DURATIONS.includes(clamped)) {
    return clamped
  }

  return defaultDuration
}
