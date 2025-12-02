const dashboardDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

const hasValidDate = (value?: Date | null): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime())

export const formatDashboardDate = (value?: Date | null) => {
  if (!hasValidDate(value)) return '—'

  try {
    return dashboardDateFormatter.format(value)
  } catch {
    return '—'
  }
}

const ONE_DAY_MS = 1000 * 60 * 60 * 24

export const getDaysUntil = (value?: Date | null) => {
  if (!hasValidDate(value)) return null

  return Math.ceil((value.getTime() - Date.now()) / ONE_DAY_MS)
}

export const isExpiringSoon = (
  value?: Date | null,
  thresholdDays = 30,
  daysUntilOverride?: number | null,
) => {
  const daysUntil = daysUntilOverride ?? getDaysUntil(value)

  if (daysUntil === null) return false

  return daysUntil > 0 && daysUntil <= thresholdDays
}
