import type { BaseEventCategory } from '@/components/table/EventsDataTable/types'
import type { SubgraphEvent } from './groupEventsByTransactionId'

/**
 * V1 event types from subgraph
 */
export type V1EventBase = {
  readonly id: string
  readonly transactionID: string
  readonly blockNumber: number
  readonly type: string
}

/**
 * Provenance signals shared by both protocol versions, carried alongside a
 * single name's events so that attribution can be decided per name.
 */
type NameProvenance = {
  readonly name: string | null
  /**
   * Who holds the name at the registrar level — the NameWrapper owner or registrar
   * token holder on V1, the registry owner on V2.
   */
  readonly registrarHolder: string | null
}

/**
 * One V1 name's history, as returned by the address history subgraph query
 */
export type V1NameHistory = NameProvenance & {
  readonly domainEvents: readonly V1EventBase[]
  readonly registrationEvents: readonly V1EventBase[]
  readonly resolverEvents: readonly V1EventBase[]
}

/**
 * V2 event type from the indexer
 */
export type V2Event = {
  readonly transactionHash: string
  readonly blockNumber: number
  readonly name: string
  readonly type: string
  readonly timestamp: number
}

/**
 * One V2 name's history, as returned by the address history indexer query
 */
export type V2NameHistory = NameProvenance & {
  readonly events: readonly V2Event[]
}

/**
 * One name's events in the shape the events table consumes, still ungrouped.
 *
 * Grouping by transaction is deliberately left until after attribution: a single
 * transaction can touch several names, and merging its events before the names are
 * judged would carry a stranger's events into a row about the address's own name.
 */
export type NameHistoryGroup = NameProvenance & {
  readonly events: readonly (SubgraphEvent & {
    readonly category?: BaseEventCategory
  })[]
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
  v1Names?: readonly V1NameHistory[],
  v2Names?: readonly V2NameHistory[],
): NameHistoryGroup[] => [
  ...(v1Names || []).map(
    ({ name, registrarHolder, ...events }): NameHistoryGroup => ({
      name,
      registrarHolder,
      events: [
        ...events.domainEvents.map((e) => ({ ...e, category: 'domain' })),
        ...events.registrationEvents.map((e) => ({
          ...e,
          category: 'registration',
        })),
        ...events.resolverEvents.map((e) => ({ ...e, category: 'resolver' })),
      ],
    }),
  ),
  ...(v2Names || []).map(
    ({ name, registrarHolder, events }): NameHistoryGroup => ({
      name,
      registrarHolder,
      events: events.map((event) => ({
        transactionID: event.transactionHash,
        blockNumber: event.blockNumber,
        id: event.name,
        type: event.type,
        timestamp: BigInt(event.timestamp),
      })),
    }),
  ),
]
