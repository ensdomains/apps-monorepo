import type { GetNameHistoryReturnType } from '@ensdomains/ensjs/subgraph'
import type { Address } from 'viem'
import type {
  BaseEvent,
  EventsTableData,
} from '@/components/table/EventsDataTable'
import type { V2NameHistoryEvent } from '@/features/profile/hooks/useV2NameHistory'
import {
  extractEventAddress,
  findAddressFromEvents,
} from './extractEventAddress'
import type { ENSEvent } from './transformHistoryToEvents'

/**
 * Categorize event based on its type
 */
const categorizeEvent = (
  eventType: string,
): 'domain' | 'registration' | 'resolver' => {
  const lowerType = eventType.toLowerCase()
  if (lowerType.includes('regist') || lowerType.includes('renew')) {
    return 'registration'
  }
  if (
    lowerType.includes('resolver') ||
    lowerType.includes('text') ||
    lowerType.includes('addr')
  ) {
    return 'resolver'
  }
  return 'domain'
}

/**
 * Transform and merge V1 and V2 name history into a single sorted array
 */
export const transformAndMergeNameHistory = (
  v1History?: GetNameHistoryReturnType,
  v2History?: V2NameHistoryEvent[],
): EventsTableData<ENSEvent>[] => {
  const transactionMap = new Map<
    string,
    {
      transactionID: string
      blockNumber: number
      from: Address | null
      events: BaseEvent[]
    }
  >()

  // Helper function to process V1 events
  const processV1Events = (
    events:
      | Array<{
          transactionID: string
          blockNumber: number
          id: string
          type: string
          [key: string]: unknown
        }>
      | null
      | undefined,
    category: 'domain' | 'registration' | 'resolver',
  ) => {
    events?.forEach((event) => {
      if (!transactionMap.has(event.transactionID)) {
        transactionMap.set(event.transactionID, {
          transactionID: event.transactionID,
          blockNumber: event.blockNumber,
          from: extractEventAddress(event),
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionID)
      if (!tx) return
      if (!tx.from) {
        tx.from = extractEventAddress(event)
      }
      tx.events.push({
        id: event.id,
        type: event.type,
        category,
        details: event,
      })
    })
  }

  // Process all V1 events
  processV1Events(v1History?.domainEvents, 'domain')
  processV1Events(v1History?.registrationEvents, 'registration')
  processV1Events(v1History?.resolverEvents, 'resolver')

  // Process V2 events
  if (v2History) {
    v2History.forEach((event) => {
      if (!transactionMap.has(event.transactionHash)) {
        transactionMap.set(event.transactionHash, {
          transactionID: event.transactionHash,
          blockNumber: event.blockNumber,
          from: null,
          events: [],
        })
      }
      const tx = transactionMap.get(event.transactionHash)
      if (!tx) return

      const category = categorizeEvent(event.type)
      tx.events.push({
        id: event.name,
        type: event.type,
        category,
        details: event,
      })
    })
  }

  // Convert map to array and ensure all transactions have a "from" address
  return Array.from(transactionMap.values())
    .map((tx) => ({
      ...tx,
      from: tx.from || findAddressFromEvents(tx.events),
      // Network will be populated when we have chain info from subgraph
      // For now, it will use the default network from config
      network: undefined,
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber)
}
