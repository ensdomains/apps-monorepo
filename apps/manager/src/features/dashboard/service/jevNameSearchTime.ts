import { parse } from 'chrono-node/en'
import { MS_PER_DAY } from '@/features/grace/utils/gracePeriod'

export type ParsedExpiryWithinDays = number | null | 'invalid'

export const parseExpiryWithinDays = (
  query: string,
  now: Date = new Date(),
): ParsedExpiryWithinDays => {
  const results = parse(
    query,
    { instant: now, timezone: 0 },
    { forwardDate: true },
  )
  if (results.length === 0) return null
  if (results.length !== 1) return 'invalid'

  const result = results[0]
  if (!result) return 'invalid'
  // Calendar expressions need explicit boundary and user-timezone policy. For
  // now, accept only durations such as "in two weeks" or "within 48 hours".
  if (!result.tags().has('result/relativeDate')) return 'invalid'

  const millisecondsUntilExpiry = result.start.date().getTime() - now.getTime()
  const withinDays = Math.ceil(millisecondsUntilExpiry / MS_PER_DAY)
  return Number.isSafeInteger(withinDays) && withinDays > 0
    ? withinDays
    : 'invalid'
}
