import type { HistoryTableEvent } from './groupEventsByTransactionId'

/**
 * Provenance signals carried alongside a single name's events so that
 * attribution can be decided per name.
 */
type NameProvenance = {
  readonly name: string | null
  /**
   * Who holds the name at the registrar level — the NameWrapper owner or registrar
   * token holder on ENSv1, the token holder on ENSv2.
   */
  readonly registrarHolder: string | null
}

/**
 * One address-history event, as `getAddressHistoryQueryOptions` reads it from
 * bigname (ENSv1 and ENSv2 alike).
 */
export type AddressHistoryEvent = {
  readonly transactionHash: string
  readonly blockNumber: number
  readonly name: string
  /** The raw storage kind, else bigname's friendly type. */
  readonly type: string
  readonly timestamp: number
  /** `{txHash}-{logIndex}`, how the events table finds the event's log. */
  readonly id?: string
  /** The event's decoded payload, flat and printable. */
  readonly data?: Readonly<Record<string, unknown>>
}

/** One name's history from bigname's address history, with its provenance. */
export type AddressNameHistory = NameProvenance & {
  readonly events: readonly AddressHistoryEvent[]
}

/**
 * One name's events in the shape the events table consumes, still ungrouped.
 *
 * Grouping by transaction is deliberately left until after attribution: a single
 * transaction can touch several names, and merging its events before the names are
 * judged would carry a stranger's events into a row about the address's own name.
 */
export type NameHistoryGroup = NameProvenance & {
  readonly events: readonly HistoryTableEvent[]
}

/**
 * Transforms the history of every name associated with an address into the
 * events table's shape, keeping one group per name.
 *
 * Deliberately does *not* merge the groups: registry ownership alone does not make
 * a name's history the address's own, and that judgement needs each name's
 * provenance, which a flattened list no longer carries.
 */
export const groupAddressHistoryByName = (
  names?: readonly AddressNameHistory[],
): NameHistoryGroup[] =>
  (names || []).map(
    ({ name, registrarHolder, events }): NameHistoryGroup => ({
      name,
      registrarHolder,
      events: events.map((event) => ({
        ...event.data,
        transactionID: event.transactionHash,
        blockNumber: event.blockNumber,
        id: event.id ?? event.name,
        type: event.type,
        timestamp: BigInt(event.timestamp),
      })),
    }),
  )
