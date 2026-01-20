import type { Address } from 'viem'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { extractFromAddress } from '@/utils/events/extractFromAddress'
import type { BaseEvent } from '../types'

interface MobileExpandedEventsProps<TEvent extends BaseEvent> {
  events: TEvent[]
}

export const MobileExpandedEvents = <TEvent extends BaseEvent = BaseEvent>({
  events,
}: MobileExpandedEventsProps<TEvent>) => {
  return (
    <>
      {events.map((event) => {
        const eventDetails = event.details as Record<string, unknown>
        const fromAddress = extractFromAddress(eventDetails)

        return (
          <div
            key={event.id}
            className="pl-4 border-l-2 border-gray-300 flex flex-col gap-2"
          >
            <div className="text-sm font-medium">Event</div>
            <div className="text-base">{event.type}</div>
            {fromAddress && (
              <>
                <div className="text-sm font-medium">From</div>
                <AddressDisplay address={fromAddress as Address} />
              </>
            )}
          </div>
        )
      })}
    </>
  )
}
