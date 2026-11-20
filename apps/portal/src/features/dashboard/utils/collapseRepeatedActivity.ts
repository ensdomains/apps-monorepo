import type { RecentActivityEvent } from '../hooks/useRecentActivity'
import { formatActivityEvent } from './formatActivityEvent'

/** What a row shows, scoped to its transaction and name. */
const activityKey = (event: RecentActivityEvent): string => {
  const { text, actor, entityFromData, value } = formatActivityEvent(event)
  return JSON.stringify([
    event.transactionHash,
    event.name,
    text,
    actor,
    entityFromData,
    value,
  ])
}

/** Keeps the first of a transaction's rows for one name that render identically. */
export const collapseRepeatedActivity = (
  events: readonly RecentActivityEvent[],
): RecentActivityEvent[] => {
  const keys = events.map(activityKey)
  return events.filter(
    (event, index) => keys.indexOf(activityKey(event)) === index,
  )
}
