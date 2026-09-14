const premiumDateTimeFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** Formats an epoch timestamp as local date + time for premium cooldown UI. */
export const formatPremiumDateTimeLocal = (epochMs: number): string => {
  const parts = premiumDateTimeFormat.formatToParts(new Date(epochMs))
  return parts
    .map((part, index) =>
      // No-break space before AM/PM so the time never wraps mid-way.
      part.type === 'literal' && parts[index + 1]?.type === 'dayPeriod'
        ? '\u00A0'
        : part.value,
    )
    .join('')
}

/** Short label for chart axis (e.g. "$100M"). */
export const formatPremiumAxisLabel = (valueUsd: number): string => {
  if (!Number.isFinite(valueUsd)) return '—'
  if (valueUsd >= 1_000_000) {
    const millions = valueUsd / 1_000_000
    return millions >= 10
      ? `$${Math.round(millions)}M`
      : `$${millions.toFixed(millions < 1 ? 2 : 0)}M`
  }
  if (valueUsd >= 1_000) {
    return `$${Math.round(valueUsd / 1_000)}K`
  }
  return `$${Math.round(valueUsd)}`
}
