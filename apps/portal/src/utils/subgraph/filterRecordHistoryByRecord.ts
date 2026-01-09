import type { ReturnResolverEvent } from '@ensdomains/ensjs/subgraph'
import type { NameRecord } from '@/features/records/components/RecordsTable/columns'

export const filterRecordHistoryByRecord = (
  events: ReturnResolverEvent[],
  record: NameRecord,
): ReturnResolverEvent[] => {
  const filteredEvents: ReturnResolverEvent[] = []
  for (const event of events) {
    if (event.type === 'AddrChanged' || event.type === 'MulticoinAddrChanged') {
      if (
        (record as Extract<NameRecord, { type: 'address' }>).value ===
        event.addr
      ) {
        filteredEvents.push(event)
      }
    } else if (event.type === 'TextChanged') {
      if ((record as Extract<NameRecord, { type: 'text' }>).key === event.key) {
        filteredEvents.push(event)
      }
    } else {
      filteredEvents.push(event)
    }
  }
  return filteredEvents
}
