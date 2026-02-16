/**
 * Calculates the expiry date by adding years to today.
 */
export const calculateExpirationDate = (years: number): Date => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + years)
  return date
}

/**
 * Calculates the duration in years from today to a target date, rounding up.
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
