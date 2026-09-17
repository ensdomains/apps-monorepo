import type { Hash } from 'viem'
import type {
  BaseEvent,
  EventsTableData,
} from '@/components/table/EventsDataTable/types'
import { groupEventsByTransactionId } from './groupEventsByTransactionId'
import type { ENSEvent } from './transformHistoryToEvents'

/**
 * V1 event types from subgraph
 */
export type V1EventBase = {
  id: string
  transactionID: string
  blockNumber: number
  type: string
}

/**
 * Provenance signals shared by both protocol versions, carried alongside a
 * single name's events so that attribution can be decided per name.
 */
type NameProvenance = {
  name: string | null
  /**
   * Who holds the name at the registrar level — the NameWrapper owner or registrar
   * token holder on V1, the registry owner on V2.
   */
  registrarHolder: string | null
}

/**
 * One V1 name's history, as returned by the address history subgraph query
 */
export type V1NameHistory = NameProvenance & {
  domainEvents: V1EventBase[]
  registrationEvents: V1EventBase[]
  resolverEvents: V1EventBase[]
}

/**
 * V2 event type from the indexer
 */
export type V2Event = {
  transactionHash: string
  blockNumber: number
  name: string
  type: string
  timestamp: number
}

/**
 * One V2 name's history, as returned by the address history indexer query
 */
export type V2NameHistory = NameProvenance & {
  events: V2Event[]
}

/**
 * A single name's events, already in table form, with the provenance signals
 * still attached so the caller can decide whether to show them.
 */
export type NameHistoryGroup = NameProvenance & {
  rows: EventsTableData<ENSEvent>[]
}

/**
 * Transforms one V1 name's events (domain, registration, resolver) into
 * table rows, grouped by transaction ID
 */
const transformV1NameHistory = (
  nameHistory: V1NameHistory,
): NameHistoryGroup => {
  const allEvents: Array<V1EventBase & { category: string }> = [
    ...(nameHistory.domainEvents || []).map((e) => ({
      ...e,
      category: 'domain' as const,
    })),
    ...(nameHistory.registrationEvents || []).map((e) => ({
      ...e,
      category: 'registration' as const,
    })),
    ...(nameHistory.resolverEvents || []).map((e) => ({
      ...e,
      category: 'resolver' as const,
    })),
  ]

  return {
    name: nameHistory.name,
    registrarHolder: nameHistory.registrarHolder,
    rows: groupEventsByTransactionId(allEvents, 'domain'),
  }
}

/**
 * Transforms one V2 name's events into table rows, grouped by transaction ID
 */
const transformV2NameHistory = (
  nameHistory: V2NameHistory,
): NameHistoryGroup => {
  const subgraphFormat = (nameHistory.events || []).map((event) => ({
    transactionID: event.transactionHash,
    blockNumber: event.blockNumber,
    id: event.name,
    type: event.type,
    timestamp: BigInt(event.timestamp),
  }))

  return {
    name: nameHistory.name,
    registrarHolder: nameHistory.registrarHolder,
    rows: groupEventsByTransactionId(subgraphFormat, 'domain'),
  }
}

/**
 * Transforms the V1 and V2 history of every name the registry associates with an
 * address, keeping one group per name.
 *
 * Deliberately does *not* merge the groups: registry ownership alone does not make
 * a name's history the address's own, and that judgement needs each name's
 * provenance, which a flattened list no longer carries.
 */
export const groupAddressHistoryByName = (
  v1Names?: V1NameHistory[],
  v2Names?: V2NameHistory[],
): NameHistoryGroup[] => [
  ...(v1Names || []).map(transformV1NameHistory),
  ...(v2Names || []).map(transformV2NameHistory),
]

/**
 * Extracts block numbers that need timestamp lookups
 * Filters out events that already have timestamps
 */
export const extractBlocksNeedingTimestamps = <TEvent extends BaseEvent>(
  events: EventsTableData<TEvent>[],
): bigint[] => {
  return events
    .filter((tx) => !tx.timestamp)
    .map((tx) => BigInt(tx.blockNumber))
}

/**
 * Extracts transaction hashes for sender lookups
 */
export const extractTransactionHashes = <TEvent extends BaseEvent>(
  events: EventsTableData<TEvent>[],
): Hash[] => {
  return events.map((tx) => tx.transactionID as Hash)
}
