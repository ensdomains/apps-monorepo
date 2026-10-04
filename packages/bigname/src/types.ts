/**
 * Wire types for the bigname `/v1` REST contract.
 *
 * Hand-written from bigname's `docs/api-v1.md` (envelope, naming dictionary,
 * status vocabulary, powers vocabulary) and `docs/api-v1-routes.md` (per-route
 * shapes). bigname publishes no OpenAPI artifact. Field names are snake_case
 * exactly as served. Optional (`?`) means the server omits the field when it
 * has no backed value; bigname does not serialize `null` placeholders unless
 * the docs say a field is nullable (`| null`).
 */

/** Lowercase `0x`-prefixed hex string (addresses, hashes, record values). */
export type Hex = `0x${string}`

/** RFC 3339 timestamp string. Use `parseTimestamp` to turn it into a Date. */
export type Timestamp = string

/** Public namespace slug. Name-shaped routes infer it; `base.eth` is `ens`. */
export type Namespace = 'ens' | 'basenames' | (string & {})

export type Finality = 'latest' | 'safe' | 'finalized'

/** The one result vocabulary used everywhere except `/v1/status`. */
export type ResultStatus =
  | 'ok'
  | 'not_found'
  | 'invalid_name'
  | 'mismatch'
  | 'unsupported'
  | 'stale'
  | 'failed'

export type Completeness = 'full' | 'partial' | 'unsupported'

/**
 * Where the chain reads a row's current registration fields from. `ens_v0` is
 * an ENSv1 name still read from the 2017 registry (bigname #947).
 */
export type Authority = 'ens_v0' | 'ens_v1' | 'ens_v2'

export type RegistrationStatus =
  | 'active'
  | 'wrapped'
  | 'registered'
  | 'released'
  | 'unregistered'

export type WrapperState = 'wrapped' | 'emancipated' | 'locked'

/** Authority relations between an address and a name. */
export type AuthorityRelation = 'owner' | 'manager' | 'registrant'

/** Relations a row can report; `resolves_to` only on `relation=resolves_to` reads. */
export type AddressRelation = AuthorityRelation | 'resolves_to'

/** A contract pointer: resolver, subregistry, registry. */
export interface ContractRef {
  readonly chain_id: number
  readonly address: Hex
}

/** Name identity fields shared by every name-shaped row. */
export interface NameIdentity {
  /** ENSIP-15 normalized name (subnames may carry a non-name form). */
  readonly name: string
  readonly display_name: string
  readonly namespace: Namespace
  readonly namehash: Hex
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface ChainPosition {
  readonly block_number: number
  readonly block_hash: Hex
  readonly timestamp: Timestamp
}

export interface ChainCompleteness {
  readonly completeness: Completeness
  readonly unsupported_reason?: string
}

export type PermissionSurface =
  | 'ens_v2_registry_operators'
  | 'registrar_approvals'
  | 'resolver_approvals'
  | 'wrapper_parent_control'

export interface Meta {
  /** Served chain positions keyed by stringified chain id (`"1"`, `"11155111"`). */
  readonly as_of?: Readonly<Record<string, ChainPosition>>
  /** Chains in the request scope that were suppressed, keyed by chain id. */
  readonly as_of_completeness?: Readonly<Record<string, ChainCompleteness>>
  /** Opaque snapshot token; pass back as `at`. Single-resource reads only. */
  readonly as_of_token?: string
  /** Present only when the read is not clean. */
  readonly completeness?: Completeness
  readonly unsupported_fields?: readonly string[]
  readonly unsupported_reason?: string
  /** Permission reads: surfaces whose holders the rows do not list. */
  readonly unlisted_permission_surfaces?: readonly PermissionSurface[]
  /** Present on routes that accept `source`. */
  readonly source?: 'indexed' | 'verified'
}

export interface Page {
  readonly cursor: string | null
  readonly next_cursor: string | null
  readonly page_size: number
  readonly total_count: number | null
  readonly has_more: boolean
}

/** Single-resource response: `{data, meta}`. */
export interface BignameResponse<TData> {
  readonly data: TData
  readonly meta: Meta
}

/** Collection response: `{data, page, meta}`. */
export interface BignamePage<TRow> {
  readonly data: readonly TRow[]
  readonly page: Page
  readonly meta: Meta
}

/** Nested collection inside a single resource (resolver `bound_names`, registry `referenced_by`). */
export interface NestedPage<TRow> {
  readonly data: readonly TRow[]
  readonly page: Page
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type BignameErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'unsupported'
  | 'stale'
  | 'conflict'
  | 'request_timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'internal_error'

export interface ErrorEnvelope {
  readonly error: {
    readonly code: BignameErrorCode
    readonly message: string
    readonly details?: Readonly<Record<string, unknown>>
  }
}

// ---------------------------------------------------------------------------
// Wrapper, restrictions, permissions
// ---------------------------------------------------------------------------

/** Typed summary of the expiry-effective NameWrapper fuse word. */
export interface WrapperFuses {
  /** Raw uint32 fuse word; zero after wrapper expiry. */
  readonly fuses: number
  readonly cannot_unwrap: boolean
  readonly cannot_burn_fuses: boolean
  readonly cannot_transfer: boolean
  readonly cannot_set_resolver: boolean
  readonly cannot_set_ttl: boolean
  readonly cannot_create_subdomain: boolean
  readonly cannot_approve: boolean
  readonly parent_cannot_control: boolean
  readonly is_dot_eth: boolean
  readonly can_extend_expiry: boolean
}

/** Complete powers vocabulary (api-v1.md, Permission powers vocabulary). */
export type Power =
  // ENSv1 / Basenames projected control
  | 'registration_control'
  | 'resolver_control'
  | 'registry_control'
  // ENSv1 NameWrapper fuse vocabulary
  | 'set_resolver'
  | 'set_ttl'
  | 'create_subnames'
  | 'create_subdomain'
  | 'transfer'
  | 'transfer_name'
  | 'unwrap'
  | 'burn_fuses'
  | 'approve'
  | 'approve_wrapper'
  | 'extend_subname_expiry'
  | 'extend_expiry'
  // ENSv2 registry roles
  | 'registrar'
  | 'register_reserved'
  | 'set_parent'
  | 'unregister'
  | 'renew'
  | 'set_subregistry'
  | 'was_reserved'
  | 'set_uri'
  | 'can_name'
  | 'upgrade'
  | 'can_transfer_admin'
  | 'admin_registrar'
  | 'admin_register_reserved'
  | 'admin_set_parent'
  | 'admin_unregister'
  | 'admin_renew'
  | 'admin_set_subregistry'
  | 'admin_set_resolver'
  | 'admin_set_uri'
  | 'admin_can_name'
  | 'admin_upgrade'
  // ENSv2 resolver roles
  | 'set_addr'
  | 'set_text'
  | 'set_contenthash'
  | 'set_pubkey'
  | 'set_abi'
  | 'set_interface'
  | 'set_name'
  | 'set_alias'
  | 'clear_records'
  | 'set_data'
  | 'link'
  | 'admin_set_addr'
  | 'admin_set_text'
  | 'admin_set_contenthash'
  | 'admin_set_pubkey'
  | 'admin_set_abi'
  | 'admin_set_interface'
  | 'admin_set_name'
  | 'admin_set_alias'
  | 'admin_clear_records'
  | 'admin_set_data'
  | 'admin_link'

/** ENSv2 token-scoped registry roles that `locked_roles` can list. */
export type LockableRole =
  | 'unregister'
  | 'renew'
  | 'set_subregistry'
  | 'set_resolver'
  | 'transfer'

/** Resource restrictions of a registration (api-v1.md, Resource restrictions). */
export type Restrictions =
  | {
      readonly registration_id: string
      readonly kind: 'ens_v1_wrapper'
      readonly wrapper_state?: WrapperState
      readonly wrapper_fuses?: WrapperFuses
      /** NameWrapper entry expiry; for a wrapped `.eth` 2LD it is registrar expiry + 90 days. */
      readonly wrapper_expires_at?: Timestamp
    }
  | {
      readonly registration_id: string
      readonly kind: 'ens_v2_registry'
      readonly locked_roles: readonly LockableRole[]
    }

export type GrantScope =
  | {
      readonly kind: 'root' | 'registry' | 'registration'
      readonly detail: Readonly<Record<string, never>>
    }
  | {
      readonly kind: 'resolver'
      readonly detail: { readonly resolver: ContractRef }
    }
  | {
      readonly kind: 'record_manager'
      readonly detail: { readonly chain_id: number; readonly manager: Hex }
    }
  | {
      readonly kind: 'account'
      readonly detail: {
        readonly chain_id: number
        readonly authority_kind: string
        readonly authority_contract: Hex
        readonly owner: Hex
      }
    }

/** `operator` marks an effective registry-operator row; direct rows omit it. */
export type GrantRelation = 'operator'

export interface Grant {
  readonly grant_relation?: GrantRelation
  readonly grant_scope: GrantScope
  readonly powers: readonly Power[]
}

/** `include=role_summary` entry: grants grouped by subject address. */
export interface RoleSummaryEntry {
  readonly address: Hex
  readonly grants: readonly Grant[]
}

/** Decoded setter argument for a grant on an ENSv2 record-ID resolver. */
export type RecordResourceReading =
  | {
      readonly kind: 'address'
      readonly hash: Hex
      readonly coin_type?: number
      /** Served instead of `coin_type` when the argument exceeds 64 bits. */
      readonly coin_type_decimal?: string
    }
  | {
      readonly kind: 'text' | 'data'
      readonly hash: Hex
      readonly key?: string
      /** Served instead of `key` for non-UTF-8, NUL-containing or blank keys. */
      readonly key_bytes?: Hex
    }
  | {
      readonly kind: 'abi'
      readonly hash: Hex
      readonly content_type?: number
      readonly content_type_decimal?: string
    }
  | {
      readonly kind: 'interface'
      readonly hash: Hex
      readonly interface_id: Hex
    }

export type RecordResource =
  | RecordResourceReading
  | {
      readonly kind: 'argument'
      readonly hash: Hex
      readonly selectors: readonly RecordResourceReading[]
    }

export type AuthorityContext = 'current_for_name' | 'resource_audit'

export interface PermissionLineageEntry {
  readonly kind:
    | 'event'
    | 'permission'
    | 'registration_authority'
    | 'registration_rebound'
    | 'ens_v1_authority'
    | 'resolver_root_fallback'
    | 'registry_root_fallback'
  readonly registration_id?: string
  readonly resolver?: ContractRef
  readonly powers?: readonly Power[]
  readonly relation?: 'holder' | 'operator' | 'token_approval'
}

/**
 * `include=lineage`. The docs list the allowlisted entry fields but not the
 * container shape of `inheritance_path`/`transfer_behavior`; typed loosely.
 */
export interface PermissionLineage {
  readonly grant: PermissionLineageEntry
  readonly revocation?: PermissionLineageEntry
  readonly inheritance_path?: unknown
  readonly transfer_behavior?: unknown
}

export interface PermissionRow {
  readonly address: Hex
  readonly grant_relation?: GrantRelation
  readonly grant_scope: GrantScope
  readonly powers: readonly Power[]
  readonly registration_id: string
  readonly record_resource?: RecordResource
  readonly name?: string
  readonly authority_context: AuthorityContext
  readonly wrapper_state?: WrapperState
  readonly wrapper_fuses?: WrapperFuses
  readonly lineage?: PermissionLineage
}

/** `GET /v1/permissions`: resource-bound reads add top-level `restrictions`. */
export interface PermissionsPage extends BignamePage<PermissionRow> {
  readonly restrictions?: Restrictions
}

// ---------------------------------------------------------------------------
// GET /v1/status
// ---------------------------------------------------------------------------

export type OpsStatus = 'ready' | 'degraded' | 'stale'

export type NetworkHeadStatus =
  | 'fresh'
  | 'stale'
  | 'unavailable'
  | 'pending'
  | 'unconfigured'
  | (string & {})

/** Per-chain readiness. Fields backed by missing head/project/lineage rows are null. */
export interface StatusChain {
  readonly latest_block: number | null
  readonly indexed_block: number | null
  readonly safe_block: number | null
  readonly finalized_block: number | null
  readonly lag_blocks: number | null
  readonly lag_seconds: number | null
  readonly network_block: number | null
  readonly network_head_observed_at: Timestamp | null
  readonly network_head_age_seconds: number | null
  readonly network_head_status: NetworkHeadStatus | null
  readonly ingestion_lag_blocks: number | null
  readonly ingestion_lag_seconds: number | null
  readonly status: OpsStatus
}

export interface Status {
  readonly status: OpsStatus
  readonly pending_invalidation_count: number
  readonly pending_invalidation_count_capped: boolean
  readonly dead_letter_count: number
  /** Keyed by stringified chain id. */
  readonly chains: Readonly<Record<string, StatusChain>>
}

// ---------------------------------------------------------------------------
// Name detail (GET /v1/names/{name}) and the flat record shape
// ---------------------------------------------------------------------------

/** Holder of a released ENSv1 lease when it lapsed. Not current state. */
export interface LapsedRegistration {
  readonly registrant?: Hex
  readonly held_through?: 'registrar' | 'wrapper'
  readonly released_at?: Timestamp
}

/**
 * Registration and control summary shared by name detail, lookup records and
 * resolver `bound_names` rows.
 */
export interface RegistrationFields {
  readonly registration_id?: string
  /** Decimal-string token id. */
  readonly token_id?: string
  /** Token/registry owner (for wrapped names the NameWrapper token holder). */
  readonly owner?: Hex
  /** Effective controller; omitted when no source can derive it. */
  readonly manager?: Hex
  readonly registrant?: Hex
  readonly registered_at?: Timestamp
  readonly created_at?: Timestamp
  /** Omitted when unknown or unrepresentable (e.g. uint64 max). */
  readonly expires_at?: Timestamp
  readonly registration_status?: RegistrationStatus
  readonly lapsed_registration?: LapsedRegistration
  /** Present exactly when `wrapper_fuses` is present. */
  readonly wrapper_state?: WrapperState
  readonly wrapper_fuses?: WrapperFuses
  /** Omitted for Basenames and ownerless registry rows. */
  readonly authority?: Authority
  /** Present only with `authority=ens_v2` after a proven ENSv1→ENSv2 migration. */
  readonly migrated_at?: Timestamp
}

/** Flat resolver-record convenience fields (name detail, lookup `profile=detail`). */
export interface FlatRecordFields {
  readonly resolver?: ContractRef
  readonly subregistry?: ContractRef
  /** Coin type (decimal string) → lowercase hex address bytes. `{}` = known empty. */
  readonly addresses?: Readonly<Record<string, Hex>>
  readonly text_records?: Readonly<Record<string, string>>
  readonly content_hash?: Hex
  readonly primary_name?: string
  readonly primary_address?: Hex
  readonly chain_id?: number
  readonly network?: string
}

/** A supported name profile. `failed`/`stale` only occur with `source=verified`. */
export interface NameProfile
  extends NameIdentity,
    RegistrationFields,
    FlatRecordFields {
  readonly status: 'ok' | 'failed' | 'stale'
  /** Set on the `current_authority_not_projected` partial serve. */
  readonly unsupported_reason?: string
  readonly failure_reason?: string
  readonly unsupported_fields?: readonly string[]
  /** `include=counts`. */
  readonly subname_count?: number
  /** `include=counts`; omitted when there is no current record inventory. */
  readonly record_count?: number
}

/** A name bigname cannot vouch for: identity only, plus the reason. */
export interface UnsupportedName extends NameIdentity {
  readonly status: 'unsupported'
  readonly unsupported_reason: string
}

/** `GET /v1/names/{name}` data: narrow on `status` before reading registration fields. */
export type NameDetail = NameProfile | UnsupportedName

// ---------------------------------------------------------------------------
// GET /v1/names/{name}/records
// ---------------------------------------------------------------------------

/** Record key grammar: `addr:<coin_type>`, `text:<key>`, `avatar`, `contenthash`. */
export type RecordKey =
  | `addr:${string}`
  | `text:${string}`
  | 'avatar'
  | 'contenthash'

export interface DerivedRecordMeta {
  readonly basis: 'derived'
  readonly rule: 'ensip19_default_address'
  readonly source_record_key: string
}

export type RecordAnswer =
  | {
      readonly status: 'ok'
      /** Text value, or lowercase hex for `addr:*` and `contenthash`. */
      readonly value: string
      readonly meta?: DerivedRecordMeta
    }
  | {
      readonly status: Exclude<ResultStatus, 'ok'>
      readonly unsupported_reason?: string
      readonly failure_reason?: string
      readonly meta?: DerivedRecordMeta
    }

export type AbiUnsupportedReason =
  | 'inventory_not_available'
  | 'inventory_not_authoritative'
  | 'abi_observations_not_supported'
  | 'abi_observations_stale'
  | 'abi_content_type_not_single_bit'
  | (string & {})

/** Record inventory container (records route `include=inventory`, lookup `include=inventory`). */
export interface RecordInventory {
  readonly known_keys: readonly RecordKey[]
  readonly unset_keys: readonly RecordKey[]
  readonly unsupported_keys: readonly RecordKey[]
  /**
   * Decimal strings, ascending, single-bit uint256 values (decode as bigint).
   * `null` means unknown, not empty: read `abi_unsupported_reason`.
   */
  readonly abi_content_types: readonly string[] | null
  readonly abi_unsupported_reason?: AbiUnsupportedReason
}

export interface NameRecords {
  readonly namespace: Namespace
  /** Exact registry resolver; null/omitted when none is served. */
  readonly resolver?: ContractRef | null
  /** Per-key answers; the only value shape on this route (#938). */
  readonly records: Readonly<Record<string, RecordAnswer>>
  readonly inventory?: RecordInventory
}

// ---------------------------------------------------------------------------
// Name rows: listing, search, subnames, registry labels
// ---------------------------------------------------------------------------

/** Row served by `GET /v1/names` (expiry sweep) and `GET /v1/search`. */
export interface NameListRow extends NameIdentity {
  readonly owner?: Hex
  readonly registrant?: Hex
  readonly registration_status?: RegistrationStatus
  readonly registered_at?: Timestamp
  readonly created_at?: Timestamp
  readonly expires_at?: Timestamp
}

/**
 * `GET /v1/names/{name}/subnames` row. `name` may be a non-name form
 * (`[<labelhash>].<parent>` or an escaped string) that must never be fed back
 * into a name-shaped route; key rows by `namehash`/`labelhash`.
 */
export interface SubnameRow extends NameListRow {
  readonly labelhash: Hex
  readonly subregistry?: ContractRef
  /** `include=counts`. */
  readonly subname_count?: number
}

/** `GET /v1/registries/{chain_id}/{address}/labels` row. */
export interface RegistryLabelRow extends SubnameRow {
  /** `include=counts`. */
  readonly role_holder_count?: number
}

// ---------------------------------------------------------------------------
// GET /v1/addresses/{address}/names
// ---------------------------------------------------------------------------

export interface Resolution {
  /** Decimal coin type the row matched. */
  readonly coin_type: number
  /** `addr:<coin_type>`, or `addr:2147483648` when the ENSIP-19 default answered. */
  readonly record_key: string
}

export interface AddressNameRow extends NameListRow {
  readonly permission_resource_id?: string
  readonly authority?: Authority
  readonly migrated_at?: Timestamp
  readonly relations: readonly AddressRelation[]
  readonly is_primary: boolean
  /** `relation=resolves_to` with one decimal `coin_type`. */
  readonly resolution?: Resolution
  /** `relation=resolves_to&coin_type=evm`: matches only, ascending, at most 100. */
  readonly resolutions?: readonly Resolution[]
  /** `include=counts`. */
  readonly subname_count?: number
  /** `include=counts` or `include=role_summary`, when record inventory exists. */
  readonly record_count?: number
  /** `include=role_summary`. Non-authoritative when meta is `partial`. */
  readonly role_summary?: readonly RoleSummaryEntry[]
  /** `include=role_summary`, when a resource-level constraint model applies. */
  readonly restrictions?: Restrictions
}

// ---------------------------------------------------------------------------
// GET /v1/addresses/{address}/primary-name
// ---------------------------------------------------------------------------

export type AnswerSource = 'indexed' | 'verified'

export interface PrimaryNameAnswer {
  readonly source: AnswerSource
  readonly status: ResultStatus
  readonly name?: string
  readonly raw_claim_name?: string
  readonly unsupported_reason?: string
  readonly failure_reason?: string
}

export interface PrimaryNameVerification {
  readonly status: ResultStatus
  readonly name?: string
  readonly unsupported_reason?: string
  readonly failure_reason?: string
}

export interface PrimaryName {
  readonly address: Hex
  readonly coin_type: number
  readonly namespace: Namespace
  readonly answers: readonly PrimaryNameAnswer[]
  readonly verification?: PrimaryNameVerification
}

// ---------------------------------------------------------------------------
// History: GET /v1/names/{name}/history, /v1/addresses/{address}/history, /v1/events
// ---------------------------------------------------------------------------

export type HistoryEventType =
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

/** Per-type `include=data` payloads. Only fields the row carries are present. */
export interface HistoryEventDataByType {
  readonly registration: {
    readonly registrant?: Hex
    readonly owner?: Hex
    readonly expires_at?: Timestamp
    readonly resolver?: ContractRef
    readonly subregistry?: ContractRef
  }
  readonly renewal: { readonly expires_at?: Timestamp }
  readonly release: { readonly expires_at?: Timestamp }
  readonly expiry: {
    readonly expires_at?: Timestamp
    /** uint32 fuse word when the change came through NameWrapper. */
    readonly fuses?: number
  }
  readonly transfer: {
    readonly from?: Hex
    readonly to?: Hex
    readonly fuses?: number
  }
  readonly authority: {
    /** New registry owner. */
    readonly owner?: Hex
    /** Previous owner, when retained. */
    readonly from?: Hex
  }
  /** `resolver` absent means the pointer was cleared. */
  readonly resolver: { readonly resolver?: ContractRef }
  readonly record: {
    /** Stored key; may be outside the record grammar (`name`, `abi:<ct>`). */
    readonly key?: string
    /** Text values are strings, other families hex. Absent when not retained. */
    readonly value?: string
    /** For `addr:<coin_type>` keys. */
    readonly coin_type?: number
  }
  readonly primary_name: {
    readonly address?: Hex
    readonly coin_type?: number
  }
  readonly permission: {
    readonly address?: Hex
    readonly powers?: readonly Power[]
    readonly fuses?: number
  }
  /** `subregistry` absent means the link was cleared. */
  readonly subregistry: { readonly subregistry?: ContractRef }
}

export interface HistoryEventBase {
  /** Opaque 64-char row identity; a merge key across feeds, not durable. */
  readonly id: string
  readonly name: string
  readonly namespace: Namespace
  readonly registration_id: string | null
  /** Null for rows with no chain position. */
  readonly block_number: number | null
  readonly timestamp: Timestamp | null
  /** Null for rows derived from interpreter state rather than one log. */
  readonly transaction_hash: Hex | null
  readonly log_index: number | null
  /** Name history with `include=child_registrations` only. */
  readonly subject?: 'name' | 'child'
  /** `include=data`: lower-cased emitting contract; null for state-derived rows. */
  readonly contract_address?: Hex | null
  /** `include=raw`: raw storage event kind, e.g. `LabelRegistered`. */
  readonly kind?: string
}

/** One history row, discriminated on `type`; `data` is present with `include=data`. */
export type HistoryEvent = {
  readonly [TType in HistoryEventType]: HistoryEventBase & {
    readonly type: TType
    readonly data?: HistoryEventDataByType[TType]
  }
}[HistoryEventType]

// ---------------------------------------------------------------------------
// POST /v1/lookup
// ---------------------------------------------------------------------------

export type LookupProfile = 'feed' | 'detail'

export interface LookupNameInput {
  readonly id?: string
  readonly name: string
}

export interface LookupAddressInput {
  readonly id?: string
  readonly address: string
  /** Numeric coin type only (no `evm`); defaults to 60. */
  readonly coin_type?: number
  /** Comma-separated relation set, `any`, or `resolves_to` alone. */
  readonly relation?: string
  readonly page_size?: number
  readonly cursor?: string
}

export type LookupInput = LookupNameInput | LookupAddressInput

export interface LookupNormalization {
  readonly changed: boolean
  readonly input_name?: string
  readonly reason?: string
}

/** Lookup record: the flat record shape; `feed` returns a subset of fields. */
export type LookupRecord =
  | (NameProfile & { readonly inventory?: RecordInventory })
  | UnsupportedName

export type LookupAddressRecord = NameProfile & {
  readonly is_primary: boolean
  readonly relations: readonly AddressRelation[]
  readonly resolution?: Resolution
}

interface LookupResultBase {
  readonly status: ResultStatus
  readonly unsupported_reason?: string
  readonly failure_reason?: string
  readonly normalization?: LookupNormalization
}

export interface LookupNameResult extends LookupResultBase {
  readonly kind: 'name'
  readonly input: LookupNameInput
  readonly record?: LookupRecord
}

export interface LookupAddressResult extends LookupResultBase {
  readonly kind: 'address'
  readonly input: LookupAddressInput
  readonly records?: readonly LookupAddressRecord[]
  readonly page?: Page
}

export type LookupResult = LookupNameResult | LookupAddressResult

// ---------------------------------------------------------------------------
// Registries and resolvers
// ---------------------------------------------------------------------------

export interface Registry {
  readonly chain_id: number
  readonly address: Hex
  /** Earliest name whose current subregistry pointer targets this contract. */
  readonly name: NameIdentity | null
  readonly parent_registry: ContractRef | null
  readonly created_block_number: number | null
  readonly created_at: Timestamp | null
  readonly created_transaction_hash: Hex | null
  readonly created_basis:
    | 'registry_created'
    | 'subregistry_pointer'
    | 'declared'
  readonly counts: {
    /** Null for a historical selection that differs from the current publication. */
    readonly labels: number | null
    /** `include=counts`. */
    readonly events?: number
    /** `include=counts`: declared role assignments, not holders. */
    readonly roles?: number
  }
  readonly referenced_by: NestedPage<NameIdentity>
}

/** `GET /v1/resolvers/{chain_id}/{address}`. No counts or samples since bigname #954. */
export interface ResolverOverview {
  readonly chain_id: number
  readonly address: Hex
  readonly mirror?: {
    readonly kind: 'ensv1_registry'
    readonly registry: ContractRef
  }
  readonly bound_names: NestedPage<NameDetail>
}

export interface EventPosition {
  readonly block_number: number
  readonly timestamp?: Timestamp
  readonly transaction_hash?: Hex
  readonly log_index?: number
}

export interface ResolverLinkRow {
  /** Decimal record id. */
  readonly record_id: string
  readonly namehash: Hex
  /** True for the empty-name node (the resolver's default record). */
  readonly default: boolean
  readonly namespace?: Namespace
  readonly name?: string
  readonly display_name?: string
  readonly link_event: EventPosition
}

export interface ResolverRoleRow {
  readonly address: Hex
  readonly registration_id: string
  readonly name?: string
  readonly powers: readonly Power[]
  readonly grant_event?: EventPosition
  readonly record_resource?: RecordResource
}

export type ResolverAliasBinding = NameIdentity

export interface ResolverAliasEvent {
  readonly namespace: Namespace
  readonly from_name: string
  /** Null when the latest alias state is `removed` or `unknown`. */
  readonly to_name: string | null
  readonly from_display_name?: string
  readonly to_display_name?: string
  readonly state: string
  readonly resolver: ContractRef
  readonly to_registration_id?: string
}

export type ResolverAliasRow = ResolverAliasBinding | ResolverAliasEvent

// ---------------------------------------------------------------------------
// GET /v1/namespaces/{namespace}
// ---------------------------------------------------------------------------

export interface NamespaceCapability {
  readonly completeness: Completeness
  readonly unsupported_reason?: string
  readonly chains?: Readonly<Record<string, ChainCompleteness>>
}

export interface NamespaceInfo {
  readonly namespace: Namespace
  readonly capabilities: Readonly<Record<string, NamespaceCapability>>
  readonly networks: readonly {
    readonly network: string
    readonly chain_id?: number
  }[]
}
