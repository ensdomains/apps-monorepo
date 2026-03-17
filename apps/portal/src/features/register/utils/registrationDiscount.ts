const DISCOUNT_TIERS: { years: number; percent: number; label: string }[] = [
  { years: 10, percent: 50, label: '10+ years' },
  { years: 5, percent: 40, label: '5+ years' },
  { years: 3, percent: 25, label: '3+ years' },
  { years: 1, percent: 0, label: '1 year' },
]

export function getDiscountForYears(years: number): {
  percent: number
  label: string
} {
  const tier = DISCOUNT_TIERS.find((t) => years >= t.years)
  return tier ?? { percent: 0, label: '1 year' }
}
