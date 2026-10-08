import type {
  Address,
  Cursor,
  Envelope,
  Hex,
  Namespace,
  RegistrationId,
  RegistryRef,
  SortOrder,
  Timestamp,
} from './common.types'
import type { AuthorityRelation, GrantScope, Power } from './permissions.types'

/** History collections: the friendly event types. */
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
  | 'migration'

/** Raw storage kinds served with `include=raw` and accepted by the `kind` filter. */
export type EventKind =
  | 'RegistrationGranted'
  | 'LabelRegistered'
  | 'RegistrationRenewed'
  | 'RegistrationReleased'
  | 'ExpiryChanged'
  | 'TokenControlTransferred'
  | 'AuthorityTransferred'
  | 'AuthorityEpochChanged'
  | 'ResolverChanged'
  | 'RecordChanged'
  | 'RecordVersionChanged'
  | 'ReverseChanged'
  | 'PermissionChanged'
  /** A role change on an ENSv2 registry's root resource. */
  | 'RootPermissionChanged'
  | 'PermissionScopeChanged'
  | 'RolesChanged'
  | 'EACRolesChanged'
  | 'SubregistryChanged'
  | 'MigrationApplied'

/** Name and address history: `scope` values (default `both`). */
export type HistoryScope = 'name' | 'registration' | 'both'

/** History collections: tokens accepted in the comma-separated `include` parameter. */
export type HistoryIncludeToken = 'data' | 'raw' | 'total_count'

/** Filters shared by name history, address history and `/v1/events`. */
type HistoryFilters = Readonly<{
  type?: readonly EventType[]
  /** Removes types after `type`; exclusion wins. */
  exclude_type?: readonly EventType[]
  /** Raw kinds; intersects the type filters. */
  kind?: readonly EventKind[]
  /** One exact stored record key; keeps record writes and resets. */
  record_key?: string
  /** Default `desc`. */
  order?: SortOrder
  /** Inclusive. */
  from_timestamp?: Timestamp
  /** Inclusive. */
  to_timestamp?: Timestamp
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/names/{name}/history`: query; `child_registrations` is rejected for `eth` and `base.eth`. */
export type NameHistoryQuery = HistoryFilters &
  Readonly<{
    namespace?: Namespace
    scope?: HistoryScope
    include?: readonly (HistoryIncludeToken | 'child_registrations')[]
  }>

/** `GET /v1/addresses/{address}/history`: query (`namespace` defaults to `ens`). */
export type AddressHistoryQuery = HistoryFilters &
  Readonly<{
    namespace?: Namespace
    /** Authority relations only; `resolves_to` is not accepted here. */
    relation?: readonly AuthorityRelation[] | 'any'
    scope?: HistoryScope
    include?: readonly HistoryIncludeToken[]
  }>

/** `GET /v1/events`: query; `total_count` is exact for anchored and `contract_address` reads. */
export type EventsQuery = HistoryFilters &
  Readonly<{
    namespace?: Namespace
    name?: string
    address?: Address
    /** `<chain_id>:<address>` naming one resolver contract. */
    resolver?: `${number}:${string}`
    contract_address?: Address
    registration_id?: RegistrationId
    from_block?: number
    to_block?: number
    include?: readonly HistoryIncludeToken[]
  }>

/** Why an expiry is null: never ends, never set, or released. */
export type ExpiryReason = 'no_expiry' | 'not_set' | 'released'

export type MigrationPath =
  | 'unwrapped'
  | 'unlocked_wrapped'
  | 'locked_wrapped'
  | 'locked_child'
  | 'emancipated_child'

/** Retained raw bytes of a non-text record write. */
export type HexBytes = Readonly<{ encoding: 'hex'; bytes: Hex }>

/** A `record` row's `value`: text and hex strings, or one of the closed object forms. */
export type HistoryRecordValue =
  | string
  | HexBytes
  | Readonly<{ deleted: boolean }>
  | Readonly<{ previous: HexBytes; current: HexBytes }>
  | Readonly<{ indexed_data_hash: Hex }>

/** History-only scope of a BaseRegistrar controller change: registrar-wide, not a name grant. */
export type RegistrarControllerScope = Readonly<{
  kind: 'registrar_controller'
  detail: Readonly<{ registrar: RegistryRef }>
}>

/** Scope on a `permission` history row. */
export type HistoryGrantScope = GrantScope | RegistrarControllerScope

type ExpiryData = Readonly<{
  expires_at?: Timestamp | null
  /** Present exactly when `expires_at` is null. */
  expires_at_reason?: ExpiryReason
}>

/** The ENSv2 storage key of the row's token, as a decimal string; not a labelhash or token id. */
type CanonicalIdData = Readonly<{ canonical_id?: string }>

/** Registrar payment evidence, where the event retained it; full-precision decimal strings. */
type PaymentData = Readonly<{
  /** A registration's unsplit amount, or a renewal's total. */
  cost?: string
  /** ENSv2 only: the ERC-20 paid in. */
  payment_token?: RegistryRef
  referrer?: Hex
}>

/** Per-type `include=data` payloads; only the fields a row carries are present. */
export type EventDataByType = Readonly<{
  registration: ExpiryData &
    CanonicalIdData &
    PaymentData &
    Readonly<{
      /** ENSv2 only: the versioned token at this event's position. */
      token_id?: string
      base_cost?: string
      premium?: string
      registrant?: Address
      owner?: Address
      resolver?: RegistryRef
      subregistry?: RegistryRef
      /** Groups the rows of one registration action, which can share one charge. */
      action_id?: string
      action_role?: 'registered' | 'linked' | 'reachable'
    }>
  renewal: ExpiryData & CanonicalIdData & PaymentData
  release: ExpiryData & CanonicalIdData
  expiry: ExpiryData & CanonicalIdData & Readonly<{ fuses?: number }>
  transfer: CanonicalIdData &
    Readonly<{
      from?: Address
      to?: Address
      fuses?: number
      /** The operator an ERC-1155 transfer named; never the transaction sender. */
      operator?: Address
      token_id?: string
    }>
  authority: Readonly<{ owner?: Address; from?: Address }>
  /** `resolver` absent means the pointer was cleared. */
  resolver: CanonicalIdData & Readonly<{ resolver?: RegistryRef }>
  record: Readonly<{
    /** May be outside the record grammar (`name`, `abi:<ct>`); absent on a version reset. */
    key?: string
    value?: HistoryRecordValue
    coin_type?: number
    /** Resolver the write landed on. */
    resolver?: RegistryRef
    node?: Hex
    record_id?: string
  }>
  primary_name: Readonly<{
    address?: Address
    coin_type?: number
    /** The stored name, unnormalized; only with `name_status: 'set'`. */
    name?: string
    name_status?: 'set' | 'cleared' | 'unknown'
  }>
  /**
   * A root role change (`RootPermissionChanged`) is a permission row with a
   * root `grant_scope`, `added_powers` and `removed_powers`, no name, and the
   * registry as `contract_address`; never on name history.
   */
  permission: CanonicalIdData &
    Readonly<{
      address?: Address
      grant_scope?: HistoryGrantScope
      /** The subject's whole set after the change, before read-time masks. */
      powers?: readonly Power[]
      added_powers?: readonly Power[]
      removed_powers?: readonly Power[]
      token_id?: string
      /** Registrar-controller rows: added or removed. */
      approved?: boolean
      fuses?: number
    }>
  /** `subregistry` absent means the link was cleared. */
  subregistry: CanonicalIdData & Readonly<{ subregistry?: RegistryRef }>
  migration: Readonly<{ migration_path?: MigrationPath }>
}>

/** Fields of every row on the three history collections. */
export type EventRowBase = Readonly<{
  /** Opaque 64-character row identity; a merge key, not a durable reference. */
  id: string
  /** Address history and `/v1/events` omit it on a row with no known name. */
  name?: string
  namespace: Namespace
  registration_id: RegistrationId | null
  block_number: number | null
  timestamp: Timestamp | null
  /** Null on rows derived from interpreter state rather than one log. */
  transaction_hash: Hex | null
  log_index: number | null
  /** `include=data`: the emitting contract; null for state-derived rows. */
  contract_address?: Address | null
  /** `include=raw`. */
  kind?: EventKind
}>

type EventRowOf<Base> = {
  readonly [Type in EventType]: Base &
    Readonly<{
      type: Type
      /** `include=data`. */
      data?: EventDataByType[Type]
    }>
}[EventType]

/** `GET /v1/names/{name}/history`: one row, discriminated on `type`. */
export type NameHistoryRow = EventRowOf<
  EventRowBase &
    Readonly<{
      name: string
      /** `include=child_registrations` only. */
      subject?: 'name' | 'child'
    }>
>

/** `GET /v1/addresses/{address}/history` and `GET /v1/events`: one row, discriminated on `type`. */
export type EventRow = EventRowOf<EventRowBase>

/** `GET /v1/names/{name}/history`: response. */
export type NameHistoryResponse = Envelope<readonly NameHistoryRow[]>

/** `GET /v1/addresses/{address}/history` and `GET /v1/events`: response. */
export type EventsResponse = Envelope<readonly EventRow[]>
