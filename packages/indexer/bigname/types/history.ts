import type {
  Address,
  Cursor,
  Envelope,
  Hex,
  Namespace,
  RegistrationId,
  RegistryRef,
  ResolverRef,
  SortOrder,
  Timestamp,
} from './common'
import type { AuthorityRelation, Power } from './permissions'

/** History collections: the eleven friendly event types. */
export type EventType =
  | 'registration'
  | 'renewal'
  | 'release'
  | 'expiry'
  | 'transfer'
  | 'authority'
  | 'resolver'
  | 'record'
  | 'primary_name'
  | 'permission'
  | 'subregistry'

/** Name and address history: `scope` values (default `both`). */
export type HistoryScope = 'name' | 'registration' | 'both'

/** History collections: tokens accepted in the comma-separated `include` parameter. */
export type HistoryIncludeToken = 'data' | 'raw' | 'total_count'

/** `GET /v1/names/{name}/history`: query; `include` also accepts `child_registrations`. */
export type NameHistoryQuery = Readonly<{
  namespace?: Namespace
  scope?: HistoryScope
  type?: readonly EventType[]
  order?: SortOrder
  from_timestamp?: Timestamp
  to_timestamp?: Timestamp
  include?: readonly (HistoryIncludeToken | 'child_registrations')[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/addresses/{address}/history`: query (`namespace` defaults to `ens`). */
export type AddressHistoryQuery = Readonly<{
  namespace?: Namespace
  /** Authority relations only; `resolves_to` is not accepted here. */
  relation?: AuthorityRelation | 'any' | `${AuthorityRelation},${string}`
  scope?: HistoryScope
  type?: readonly EventType[]
  order?: SortOrder
  from_timestamp?: Timestamp
  to_timestamp?: Timestamp
  include?: readonly HistoryIncludeToken[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/events`: query. */
export type EventsQuery = Readonly<{
  namespace?: Namespace
  name?: string
  address?: Address
  /** `<chain_id>:<address>` naming one resolver contract. */
  resolver?: `${number}:${string}`
  contract_address?: Address
  registration_id?: RegistrationId
  type?: readonly EventType[]
  from_block?: number
  to_block?: number
  from_timestamp?: Timestamp
  to_timestamp?: Timestamp
  include?: readonly HistoryIncludeToken[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** History collections: the lean event row every history route serves. */
export type EventRowBase = Readonly<{
  /** Opaque 64-character row identity; a merge key, not a durable reference. */
  id: string
  type: EventType
  name: string
  namespace: Namespace
  /** Null when the event is not associated with a registration lifecycle. */
  registration_id: RegistrationId | null
  block_number: number | null
  timestamp: Timestamp | null
  /** Null on rows derived from interpreter state rather than one log. */
  transaction_hash: Hex | null
  log_index: number | null
}>

/** `GET /v1/names/{name}/history`: lean row; `subject` only with `include=child_registrations`. */
export type NameHistoryRow = EventRowBase &
  Readonly<{
    subject?: 'name' | 'child'
  }>

/** `GET /v1/addresses/{address}/history`: lean row. */
export type AddressHistoryRow = EventRowBase

/** `GET /v1/events`: lean row; `name` is omitted when the event carries none. */
export type EventsRow = Omit<EventRowBase, 'name'> &
  Readonly<{
    name?: string
  }>

/** History collections with `include=data`: the per-type `data` payload, discriminated on `type`. */
export type EventData =
  | Readonly<{
      type: 'registration'
      data: Readonly<{
        registrant?: Address
        owner?: Address
        expires_at?: Timestamp
        resolver?: ResolverRef
        subregistry?: RegistryRef
      }>
    }>
  | Readonly<{
      type: 'renewal' | 'release'
      data: Readonly<{ expires_at?: Timestamp }>
    }>
  | Readonly<{
      type: 'expiry'
      data: Readonly<{ expires_at?: Timestamp; fuses?: number }>
    }>
  | Readonly<{
      type: 'transfer'
      data: Readonly<{ from?: Address; to?: Address; fuses?: number }>
    }>
  | Readonly<{
      type: 'authority'
      data: Readonly<{ owner?: Address; from?: Address }>
    }>
  | Readonly<{
      type: 'resolver'
      /** `resolver` absent means the pointer was cleared. */
      data: Readonly<{ resolver?: ResolverRef }>
    }>
  | Readonly<{
      type: 'record'
      /** `key` may name a family outside `RecordKey`; text values are strings, others hex. */
      data: Readonly<{ key?: string; value?: string; coin_type?: number }>
    }>
  | Readonly<{
      type: 'primary_name'
      data: Readonly<{ address?: Address; coin_type?: number }>
    }>
  | Readonly<{
      type: 'permission'
      data: Readonly<{
        address?: Address
        powers?: readonly Power[]
        fuses?: number
      }>
    }>
  | Readonly<{
      type: 'subregistry'
      /** `subregistry` absent means the link was cleared. */
      data: Readonly<{ subregistry?: RegistryRef }>
    }>

/** History collections with `include=data`: fields added to every row. */
export type EventDataFields = Readonly<{
  /** Null for rows derived from interpreter state. */
  contract_address: Address | null
}> &
  EventData

/** History collections with `include=raw`: the raw storage event kind (e.g. `RecordChanged`). */
export type EventRawFields = Readonly<{
  kind: string
}>

/** History collections: a lean row expanded by `include=data`. */
export type WithEventData<Row extends Readonly<{ type: EventType }>> = Omit<
  Row,
  'type'
> &
  EventDataFields

/** History collections: a row expanded by `include=raw`. */
export type WithEventRaw<Row> = Row & EventRawFields

/** `GET /v1/names/{name}/history`: response. */
export type NameHistoryResponse = Envelope<readonly NameHistoryRow[]>

/** `GET /v1/addresses/{address}/history`: response. */
export type AddressHistoryResponse = Envelope<readonly AddressHistoryRow[]>

/** `GET /v1/events`: response. */
export type EventsResponse = Envelope<readonly EventsRow[]>
