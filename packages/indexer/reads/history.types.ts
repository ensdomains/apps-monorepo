import type {
  EventDataByType,
  EventKind,
  EventType,
} from '../bigname/types/history.types'
import type { Address, Hex, PageQuery } from './common.types'

/** The event vocabulary is bigname's: the screens render `data` key by key, so every backend produces it. */
export type HistoryEventType = EventType
export type HistoryEventKind = EventKind
export type HistoryEventData = EventDataByType

type HistoryEventBase = Readonly<{
  /** Unique within one backend; a merge key, not a durable reference. */
  id: string
  /** Null on a row with no known name. */
  name: string | null
  /** `includeChildRegistrations` only: a child's registration on its parent's history. */
  subject?: 'name' | 'child'
  registrationId: string | null
  blockNumber: number | null
  timestamp: Date | null
  transactionHash: Hex | null
  logIndex: number | null
  /** The emitting contract; null for rows derived from state. */
  contractAddress: Address | null
  /** The backend's raw event kind; null when it serves none. */
  kind: HistoryEventKind | (string & {}) | null
}>

/** One history row, discriminated on `type`. */
export type HistoryEvent = {
  readonly [Type in HistoryEventType]: HistoryEventBase &
    Readonly<{ type: Type; data: HistoryEventData[Type] }>
}[HistoryEventType]

type HistoryFilters = PageQuery &
  Readonly<{
    types?: readonly HistoryEventType[]
    /** Raw kinds; intersects `types`. */
    kinds?: readonly HistoryEventKind[]
    /** One exact record key, in the record-key grammar. */
    recordKey?: string
    /** Default `desc`. */
    order?: 'asc' | 'desc'
    /** Inclusive. */
    from?: Date
    /** Inclusive. */
    to?: Date
    /** Ask for an exact `totalCount`. */
    includeTotal?: boolean
  }>

export type NameHistoryQuery = HistoryFilters &
  Readonly<{
    name: string
    /** `registration` limits the rows to the current registration. Default `both`. */
    scope?: 'name' | 'registration' | 'both'
    /** Add the registrations of direct children, with `subject: 'child'`. */
    includeChildRegistrations?: boolean
  }>

export type AddressHistoryQuery = HistoryFilters &
  Readonly<{ address: Address }>

/** Rows from anywhere; each filter narrows. */
export type EventsQuery = HistoryFilters &
  Readonly<{
    name?: string
    address?: Address
    /** Rows about the records of this resolver contract. */
    resolver?: Address
    contractAddress?: Address
    registrationId?: string
  }>
