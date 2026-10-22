export const RECENT_EVENT_WINDOW_DAYS = 30

const SECONDS_PER_DAY = 86_400

/**
 * How many of a newest-first event page fall inside the window. When every
 * row on the page is inside it and more pages exist, the true count is higher.
 */
export const countRecentEvents = ({
  timestamps,
  nowSeconds,
  hasMore,
  days = RECENT_EVENT_WINDOW_DAYS,
}: {
  readonly timestamps: readonly number[]
  readonly nowSeconds: number
  readonly hasMore: boolean
  readonly days?: number
}): { readonly count: number; readonly isLowerBound: boolean } => {
  const cutoff = nowSeconds - days * SECONDS_PER_DAY
  const count = timestamps.filter((timestamp) => timestamp >= cutoff).length

  return { count, isLowerBound: hasMore && count === timestamps.length }
}

export const formatRecentEventCount = (
  recent: { readonly count: number; readonly isLowerBound: boolean } | null,
): string => (recent ? `${recent.count}${recent.isLowerBound ? '+' : ''}` : '—')
