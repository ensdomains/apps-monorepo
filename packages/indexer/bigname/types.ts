// Hand-written types for the bigname `/v1` API.
// Sources: bigname/docs/api-v1.md (envelope, dictionary, status, errors, cursors),
// bigname/docs/api-v1-routes.md (per-route reference), DTOs under apps/api/src/v2/.
// Optional fields are omitted on the wire unless typed `| null` here.
// Unknown query parameters are rejected with `400 invalid_input`; the `*Query`
// types below list exactly the parameters each route accepts.

/** Lower-cased `0x`-prefixed 20-byte EVM address. */
export type Address = string
/** Lower-cased `0x`-prefixed hex string (hashes, contenthash, multicoin address bytes). */
export type Hex = string
/** RFC 3339 UTC timestamp, e.g. `2026-06-10T00:00:00Z`. */
export type Timestamp = string
/** Opaque, versioned pagination cursor. */
export type Cursor = string
/** Public namespace slug (`ens`, `basenames`). */
export type Namespace = string
/** Opaque stable handle of one registration lifecycle. */
export type RegistrationId = string

// ---------------------------------------------------------------------------
// 1. Envelope and errors
// ---------------------------------------------------------------------------

/** Every route: `completeness` values (api-v1.md "Status Vocabulary"). */
export type Completeness = 'full' | 'partial' | 'unsupported'

/** Every route: answer origin reported in `meta.source`. */
export type Source = 'indexed' | 'verified'

/** Every route: one readable per-chain position under `meta.as_of`. */
export type AsOf = Readonly<{
  block_number: number
  block_hash: Hex
  timestamp: Timestamp
}>

/** Every route: a chain suppressed from `meta.as_of`, under `meta.as_of_completeness`. */
export type AsOfCompleteness = Readonly<{
  completeness: Completeness
  unsupported_reason: string
}>

/** Permission reads: permission surfaces whose holders the rows do not list. */
export type UnlistedPermissionSurface =
  | 'ens_v2_registry_operators'
  | 'registrar_approvals'
  | 'resolver_approvals'
  | 'wrapper_parent_control'

/** Every route: response metadata; maps are keyed by decimal chain id string ("1", "8453"). */
export type Meta = Readonly<{
  as_of?: Readonly<Record<string, AsOf>>
  as_of_completeness?: Readonly<Record<string, AsOfCompleteness>>
  /** Opaque token to replay the served positions with `at` (single-resource routes only). */
  as_of_token?: string
  completeness?: Completeness
  unsupported_fields?: readonly string[]
  unsupported_reason?: string
  /** Permission reads only (`GET /v1/permissions`, `include=role_summary`). */
  unlisted_permission_surfaces?: readonly UnlistedPermissionSurface[]
  source?: Source
}>

/** Every collection: standard pagination object (default page_size 50, max 200). */
export type Page = Readonly<{
  cursor: Cursor | null
  next_cursor: Cursor | null
  page_size: number
  total_count: number | null
  has_more: boolean
}>

/** Every route: the one success shape; `page` appears on collections only. */
export type Envelope<T> = Readonly<{
  data: T
  page?: Page
  meta: Meta
}>

/**
 * Every route: error `code` and its HTTP status (api-v1.md "Error Model").
 * invalid_input 400, not_found 404, unsupported 422, stale 409, conflict 409,
 * request_timeout 408, rate_limited 429, overloaded 503, internal_error 500.
 */
export type ErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'unsupported'
  | 'stale'
  | 'conflict'
  | 'request_timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'internal_error'

/** Every route: the error body. */
export type ErrorBody = Readonly<{
  error: Readonly<{
    code: ErrorCode
    message: string
    details: Readonly<Record<string, unknown>>
  }>
}>

// ---------------------------------------------------------------------------
// 2. Shared vocabulary
// ---------------------------------------------------------------------------

/** Every route except `/v1/status`: the one in-band result status vocabulary. */
export type ResultStatus =
  | 'ok'
  | 'not_found'
  | 'invalid_name'
  | 'mismatch'
  | 'unsupported'
  | 'stale'
  | 'failed'

/** Single-resource snapshot reads: `finality` values. */
export type Finality = 'latest' | 'safe' | 'finalized'

/** Paginated routes: `order` values. */
export type SortOrder = 'asc' | 'desc'

/** Name-shaped rows: registration/control lifecycle label. */
export type RegistrationStatus =
  | 'active'
  | 'wrapped'
  | 'registered'
  | 'released'
  | 'unregistered'

/** Name-shaped rows: current ENSv1 NameWrapper lifecycle value. */
export type WrapperState = 'wrapped' | 'emancipated' | 'locked'

/** Name detail, permission rows, restrictions: expiry-effective NameWrapper fuse word. */
export type WrapperFuses = Readonly<{
  fuses: number
  cannot_unwrap: boolean
  cannot_burn_fuses: boolean
  cannot_transfer: boolean
  cannot_set_resolver: boolean
  cannot_set_ttl: boolean
  cannot_create_subdomain: boolean
  cannot_approve: boolean
  parent_cannot_control: boolean
  is_dot_eth: boolean
  can_extend_expiry: boolean
}>

/** Name-shaped rows: where the chain reads the current registration fields from. */
export type Authority = 'ens_v0' | 'ens_v1' | 'ens_v2'

/** Name-shaped rows: `resolver` `{chain_id, address}`. */
export type ResolverRef = Readonly<{
  chain_id: number
  address: Address
}>

/** Name-shaped rows: `subregistry` `{chain_id, address}` of an ENSv2 registry. */
export type RegistryRef = Readonly<{
  chain_id: number
  address: Address
}>

/** `GET /v1/names/{name}`, detail lookup: the holder a released ENSv1 lease had when it lapsed. */
export type LapsedRegistration = Readonly<{
  registrant?: Address
  held_through?: 'registrar' | 'wrapper'
  released_at?: Timestamp
}>

/**
 * Permission rows, role summaries, permission event data: one effective power.
 * Closed ~60-value snake_case vocabulary; see api-v1.md "Permission powers vocabulary"
 * (`registration_control`, `resolver_control`, `registry_control`, `set_resolver`, ENSv2
 * `ROLE_*` names and their `admin_*` counterparts, ...). Not enumerated here.
 */
export type Power = string

/** Address-name rows, reverse lookup rows: address-to-name relation values. */
export type Relation = 'owner' | 'manager' | 'registrant' | 'resolves_to'

/** Authority relations that `any` expands to. */
export type AuthorityRelation = 'owner' | 'manager' | 'registrant'

/**
 * `relation` query/body filter: one authority relation, a comma-separated set of them,
 * `any` (all three), or `resolves_to` on its own.
 */
export type RelationFilter =
  | AuthorityRelation
  | 'any'
  | 'resolves_to'
  | `${AuthorityRelation},${string}`

/** `GET /v1/permissions`, `include=role_summary`: explicit grant relation; direct rows omit it. */
export type GrantRelation = 'operator'

/** `GET /v1/permissions`, `include=role_summary`: protocol scope kinds of a permission row. */
export type GrantScopeKind =
  | 'root'
  | 'registry'
  | 'registration'
  | 'resolver'
  | 'record_manager'
  | 'account'

/** `GET /v1/permissions`, `include=role_summary`: `grant_scope` `{kind, detail}`. */
export type GrantScope =
  | Readonly<{
      kind: 'root' | 'registry' | 'registration'
      detail: Readonly<Record<never, never>>
    }>
  | Readonly<{ kind: 'resolver'; detail: Readonly<{ resolver: ResolverRef }> }>
  | Readonly<{
      kind: 'record_manager'
      detail: Readonly<{ chain_id: number; manager: Address }>
    }>
  | Readonly<{
      kind: 'account'
      detail: Readonly<{
        chain_id: number
        authority_kind: string
        authority_contract: Address
        owner: Address
      }>
    }>

/** `include=role_summary`, permission rows: one grant `{grant_relation?, grant_scope, powers}`. */
export type Grant = Readonly<{
  grant_relation?: GrantRelation
  grant_scope: GrantScope
  powers: readonly Power[]
}>

/** `GET /v1/addresses/{address}/names?include=role_summary`: grants grouped by subject address. */
export type RoleSummary = Readonly<{
  address: Address
  grants: readonly Grant[]
}>

/** `ens_v2_registry` restrictions: token-scoped roles whose assignment can no longer change. */
export type LockedRole =
  | 'unregister'
  | 'renew'
  | 'set_subregistry'
  | 'set_resolver'
  | 'transfer'

/** `GET /v1/permissions` (top level), `include=role_summary` rows: resource restrictions. */
export type Restrictions =
  | Readonly<{
      registration_id: RegistrationId
      kind: 'ens_v1_wrapper'
      wrapper_state: WrapperState
      wrapper_fuses: WrapperFuses
      wrapper_expires_at?: Timestamp
    }>
  | Readonly<{
      registration_id: RegistrationId
      kind: 'ens_v2_registry'
      locked_roles: readonly LockedRole[]
    }>

// ---------------------------------------------------------------------------
// 3. GET /v1/status
// ---------------------------------------------------------------------------

/** `GET /v1/status`: the only route with the ops status vocabulary. */
export type OpsStatus = 'ready' | 'degraded' | 'stale'

/** `GET /v1/status`: cached provider head comparison state. */
export type NetworkHeadStatus =
  | 'fresh'
  | 'stale'
  | 'unavailable'
  | 'pending'
  | 'unconfigured'

/** `GET /v1/status`: one chain entry under `data.chains`. */
export type ChainStatus = Readonly<{
  latest_block: number | null
  indexed_block: number | null
  safe_block: number | null
  finalized_block: number | null
  lag_blocks: number | null
  lag_seconds: number | null
  network_block: number | null
  network_head_observed_at: Timestamp | null
  network_head_age_seconds: number | null
  network_head_status: NetworkHeadStatus
  ingestion_lag_blocks: number | null
  ingestion_lag_seconds: number | null
  status: OpsStatus
}>

/** `GET /v1/status`: `data`; `chains` is keyed by decimal chain id string. */
export type StatusData = Readonly<{
  status: OpsStatus
  pending_invalidation_count: number
  pending_invalidation_count_capped: boolean
  dead_letter_count: number
  chains: Readonly<Record<string, ChainStatus>>
}>

/** `GET /v1/status`: response (no `page`; `meta` carries no snapshot fields). */
export type StatusResponse = Envelope<StatusData>

// ---------------------------------------------------------------------------
// 4. GET /v1/names
// ---------------------------------------------------------------------------

/** `GET /v1/names`: query; at least one of `expires_after`/`expires_before` is required. */
export type NamesQuery = Readonly<{
  namespace: Namespace
  /** Inclusive lower `expires_at` bound. */
  expires_after?: Timestamp
  /** Exclusive upper `expires_at` bound. */
  expires_before?: Timestamp
  sort?: 'expires_at'
  order?: SortOrder
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/names`: one listing row (the search row shape). */
export type NameListingRow = Readonly<{
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
  owner?: Address
  registrant?: Address
  registration_status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
}>

/** `GET /v1/names`: response (`page.total_count` is always null). */
export type NamesResponse = Envelope<readonly NameListingRow[]>

// ---------------------------------------------------------------------------
// 5. GET /v1/names/{name}
// ---------------------------------------------------------------------------

/** `GET /v1/names/{name}`: query. */
export type NameRecordQuery = Readonly<{
  namespace?: Namespace
  /** RFC 3339 timestamp or a `meta.as_of_token`; percent-encode `+` as `%2B`. */
  at?: string
  finality?: Finality
  source?: Source
  include?: readonly 'counts'[]
}>

/** `GET /v1/names/{name}`: the flat name-profile record. */
export type NameRecord = Readonly<{
  registration_id?: RegistrationId
  /** Decimal string. */
  token_id?: string
  owner?: Address
  manager?: Address
  registrant?: Address
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  registration_status?: RegistrationStatus
  /** Present exactly when `wrapper_fuses` is present. */
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  authority?: Authority
  /** Only while `registration_status` is `released` on an ENSv1 name. */
  lapsed_registration?: LapsedRegistration
  /** Only with `authority=ens_v2` proven by an ENSv1->ENSv2 migration. */
  migrated_at?: Timestamp
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
  resolver?: ResolverRef
  subregistry?: RegistryRef
  /** Decimal coin type -> scalar hex address; `{}` means known-empty. */
  addresses?: Readonly<Record<string, Hex>>
  /** Text key -> value; `{}` means known-empty. */
  text_records?: Readonly<Record<string, string>>
  content_hash?: Hex
  primary_name?: string
  primary_address?: Hex
  chain_id?: number
  network?: string
  /** `include=counts` only. */
  subname_count?: number
  /** `include=counts` only; omitted with no current record inventory. */
  record_count?: number
  status: ResultStatus
  unsupported_reason?: string
  failure_reason?: string
  /** Omitted when empty. */
  unsupported_fields?: readonly string[]
}>

/** `GET /v1/names/{name}`: response. */
export type NameRecordResponse = Envelope<NameRecord>

// ---------------------------------------------------------------------------
// 6. GET /v1/names/{name}/records
// ---------------------------------------------------------------------------

/** `GET /v1/names/{name}/records`: the closed product record-key grammar. */
export type RecordKey =
  | `addr:${number}`
  | `text:${string}`
  | 'avatar'
  | 'contenthash'

/** `GET /v1/names/{name}/records`: query. */
export type NameRecordsQuery = Readonly<{
  namespace?: Namespace
  at?: string
  finality?: Finality
  source?: Source | 'auto'
  /** At most 200 keys. */
  keys?: readonly RecordKey[]
  include?: readonly 'inventory'[]
}>

/** `GET /v1/names/{name}/records`: `meta` on an ENSIP-19 derived answer. */
export type RecordAnswerMeta = Readonly<{
  basis: 'derived'
  rule: 'ensip19_default_address'
  source_record_key: 'addr:2147483648'
}>

/** `GET /v1/names/{name}/records`: one per-key answer; `value` only when `status` is `ok`. */
export type RecordAnswer = Readonly<{
  status: ResultStatus
  /** Text values are strings; address and contenthash values are lowercase hex. */
  value?: string
  unsupported_reason?: string
  failure_reason?: string
  meta?: RecordAnswerMeta
}>

/** `GET /v1/names/{name}/records?include=inventory`: why `abi_content_types` is null. */
export type AbiUnsupportedReason =
  | 'inventory_not_available'
  | 'inventory_not_authoritative'
  | 'abi_observations_not_supported'
  | 'abi_observations_stale'
  | 'abi_content_type_not_single_bit'

/** `GET /v1/names/{name}/records?include=inventory`, `POST /v1/lookup` `include=inventory`. */
export type RecordInventory = Readonly<{
  known_keys: readonly string[]
  unset_keys: readonly string[]
  unsupported_keys: readonly string[]
  /** Canonical decimal strings of single-bit uint256 content types, ascending; null when unlistable. */
  abi_content_types: readonly string[] | null
  /** Present exactly when `abi_content_types` is null. */
  abi_unsupported_reason?: AbiUnsupportedReason
}>

/** `GET /v1/names/{name}/records`: `data`; `resolver` is null when no exact registry pointer is served. */
export type NameRecords = Readonly<{
  namespace: Namespace
  resolver: ResolverRef | null
  /** Keyed by `RecordKey`; `{}` when there is no key to answer. */
  records: Readonly<Partial<Record<RecordKey, RecordAnswer>>>
  inventory?: RecordInventory
}>

/** `GET /v1/names/{name}/records`: response. */
export type NameRecordsResponse = Envelope<NameRecords>

// ---------------------------------------------------------------------------
// 7. GET /v1/names/{name}/subnames
// ---------------------------------------------------------------------------

/** `GET /v1/names/{name}/subnames`: query. */
export type SubnamesQuery = Readonly<{
  namespace?: Namespace
  /** ENSIP-15 name prefix; one trailing dot marks a label boundary. */
  q?: string
  sort?: 'name' | 'expires_at' | 'registered_at'
  order?: SortOrder
  include_expired?: 'true' | 'false'
  include?: readonly 'counts'[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/names/{name}/subnames`: one direct child row. */
export type Subname = Readonly<{
  /** May be a non-name form (`[<labelhash>].<parent>` or escaped bytes); distinguish rows by hashes. */
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
  labelhash?: Hex
  owner?: Address
  registrant?: Address
  registration_status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  subregistry?: RegistryRef
  /** `include=counts` only. */
  subname_count?: number
}>

/** `GET /v1/names/{name}/subnames`: response. */
export type SubnamesResponse = Envelope<readonly Subname[]>

// ---------------------------------------------------------------------------
// 8. History: GET /v1/names/{name}/history, GET /v1/addresses/{address}/history, GET /v1/events
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 9. GET /v1/addresses/{address}/names
// ---------------------------------------------------------------------------

/** `GET /v1/addresses/{address}/names`: query. */
export type AddressNamesQuery = Readonly<{
  namespace?: Namespace
  relation?: RelationFilter
  /** Only with `relation=resolves_to`: decimal coin type (default 60) or `evm`. */
  coin_type?: number | 'evm'
  authority?: Authority
  /** Rejected with `relation=resolves_to`. */
  is_migrated?: 'true' | 'false'
  /** ENSIP-15 name prefix; one trailing dot marks a label boundary. */
  q?: string
  sort?: 'name' | 'expires_at' | 'registered_at'
  order?: SortOrder
  dedupe?: 'name' | 'registration'
  include?: readonly ('counts' | 'role_summary')[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `resolves_to` rows: the coin type asked about and the record key that answered it. */
export type AddressNameResolution = Readonly<{
  coin_type: number
  record_key: `addr:${number}`
}>

/** `GET /v1/addresses/{address}/names`: one row. */
export type AddressName = Readonly<{
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
  /** Handle for `GET /v1/permissions?registration_id=`; omitted on a serving-resource-only `resolves_to` row. */
  permission_resource_id?: string
  owner?: Address
  registrant?: Address
  registration_status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  authority?: Authority
  migrated_at?: Timestamp
  /** Matched subset of `owner`/`manager`/`registrant`, or `["resolves_to"]`. */
  relations: readonly Relation[]
  is_primary: boolean
  /** `relation=resolves_to` with one decimal `coin_type` only. */
  resolution?: AddressNameResolution
  /** `relation=resolves_to&coin_type=evm` only; ascending by coin type, at most 100 entries. */
  resolutions?: readonly AddressNameResolution[]
  /** `include=counts` only. */
  subname_count?: number
  /** `include=counts` or `include=role_summary`; omitted with no record inventory. */
  record_count?: number
  /** `include=role_summary` only. */
  role_summary?: readonly RoleSummary[]
  /** `include=role_summary` only; omitted when no resource-level constraint model applies. */
  restrictions?: Restrictions
}>

/** `GET /v1/addresses/{address}/names`: response. */
export type AddressNamesResponse = Envelope<readonly AddressName[]>

// ---------------------------------------------------------------------------
// 10. GET /v1/permissions
// ---------------------------------------------------------------------------

/** `GET /v1/permissions`: query; at least one of `name`, `registration_id`, `address`. */
export type PermissionsQuery = Readonly<{
  name?: string
  registration_id?: RegistrationId
  address?: Address
  namespace?: Namespace
  include?: readonly 'lineage'[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/permissions`: how a row was admitted under the per-name ownership rule. */
export type AuthorityContext = 'current_for_name' | 'resource_audit'

/** `GET /v1/permissions`: one decoded setter-argument reading of an ENSv2 record-ID resolver grant. */
export type RecordResourceSelector =
  | Readonly<{
      kind: 'address'
      hash: Hex
      coin_type?: number
      coin_type_decimal?: string
    }>
  | Readonly<{
      kind: 'text' | 'data'
      hash: Hex
      key?: string
      key_bytes?: Hex
    }>
  | Readonly<{
      kind: 'abi'
      hash: Hex
      content_type?: number
      content_type_decimal?: string
    }>
  | Readonly<{ kind: 'interface'; hash: Hex; interface_id: Hex }>

/** `GET /v1/permissions`: `record_resource`; `argument` when one argument authorizes several setters. */
export type RecordResource =
  | RecordResourceSelector
  | Readonly<{
      kind: 'argument'
      hash: Hex
      selectors: readonly RecordResourceSelector[]
    }>

/**
 * `GET /v1/permissions?include=lineage`: bounded lineage summary. Only loosely described
 * (api-v1-routes.md:2029-2041: allowlisted fields `kind`, `registration_id`, `resolver`,
 * `powers`, `relation`), so each object is typed as an open record.
 */
export type PermissionLineage = Readonly<{
  grant: Readonly<Record<string, unknown>>
  revocation?: Readonly<Record<string, unknown>>
  inheritance_path?: Readonly<Record<string, unknown>>
  transfer_behavior?: Readonly<Record<string, unknown>>
}>

/** `GET /v1/permissions`: one permission row. */
export type PermissionRow = Readonly<{
  address: Address
  /** `operator` on effective registry-operator rows; omitted on direct rows. */
  grant_relation?: GrantRelation
  grant_scope: GrantScope
  powers: readonly Power[]
  registration_id: RegistrationId
  /** ENSv2 record-ID resolver grants only. */
  record_resource?: RecordResource
  name?: string
  authority_context: AuthorityContext
  /** Present exactly when `wrapper_fuses` is present (current ENSv1 wrapper registrations). */
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  /** `include=lineage` only. */
  lineage?: PermissionLineage
}>

/** `GET /v1/permissions`: response; `restrictions` sits beside `data` on resource-bound reads. */
export type PermissionsResponse = Envelope<readonly PermissionRow[]> &
  Readonly<{
    restrictions?: Restrictions
  }>

// ---------------------------------------------------------------------------
// 11. POST /v1/lookup
// ---------------------------------------------------------------------------

/** `POST /v1/lookup`: field budget; `feed` is the latency path. Defaults to `detail`. */
export type LookupProfile = 'feed' | 'detail'

/** `POST /v1/lookup`: a forward name input. */
export type LookupNameInput = Readonly<{
  /** Caller correlation, echoed back when supplied. */
  id?: string
  name: string
}>

/** `POST /v1/lookup`: a reverse address input (`coin_type` defaults to 60; numeric only). */
export type LookupAddressInput = Readonly<{
  id?: string
  address: Address
  coin_type?: number
  relation?: RelationFilter
  page_size?: number
  cursor?: Cursor
}>

/** `POST /v1/lookup`: one input, discriminated by the presence of `name` or `address`. */
export type LookupInput = LookupNameInput | LookupAddressInput

/** `POST /v1/lookup`: request body (batch limit 1000; `include` requires `profile=detail`). */
export type LookupRequest = Readonly<{
  inputs: readonly LookupInput[]
  profile?: LookupProfile
  namespace?: Namespace
  include?: 'inventory'
}>

/** `POST /v1/lookup`: name-normalization result for an input. */
export type LookupNormalization = Readonly<{
  changed: boolean
  input_name: string
  reason: string
}>

/** `POST /v1/lookup`: the common record shape for `record` and `records` rows (feed is a subset). */
export type LookupRecord = Readonly<{
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
  registration_id?: RegistrationId
  token_id?: string
  owner?: Address
  manager?: Address
  registrant?: Address
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  registration_status?: RegistrationStatus
  lapsed_registration?: LapsedRegistration
  resolver?: ResolverRef
  subregistry?: RegistryRef
  addresses?: Readonly<Record<string, Hex>>
  text_records?: Readonly<Record<string, string>>
  content_hash?: Hex
  /** `profile=detail` name results with `include=inventory` only. */
  inventory?: RecordInventory
  primary_name?: string
  primary_address?: Hex
  chain_id?: number
  network?: string
  /** Reverse rows only. */
  is_primary?: boolean
  /** Reverse rows only; omitted when empty. */
  relations?: readonly Relation[]
  /** `relation=resolves_to` reverse rows only. */
  resolution?: AddressNameResolution
  authority?: Authority
  migrated_at?: Timestamp
  status: ResultStatus
  unsupported_reason?: string
  failure_reason?: string
  /** Omitted when empty. */
  unsupported_fields?: readonly string[]
}>

/** `POST /v1/lookup`: one result per input, in caller order; `input` echoes the request input. */
export type LookupResult = Readonly<{
  input: LookupInput
  kind: 'name' | 'address'
  status: ResultStatus
  unsupported_reason?: string
  failure_reason?: string
  normalization?: LookupNormalization
  /** Name results. */
  record?: LookupRecord
  /** Reverse results; empty array on a miss. */
  records?: readonly LookupRecord[]
  /** Reverse results only. */
  page?: Page
}>

/** `POST /v1/lookup`: response (`data` is the results array; no top-level `page`). */
export type LookupResponse = Envelope<readonly LookupResult[]>
