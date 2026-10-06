/**
 * Wire types for the bigname `/v1` REST contract, targeting the planned
 * merged `main` + `next` release including PR #1094.
 *
 * Written from bigname's `docs/api-v1.md` (envelope, naming dictionary,
 * status vocabulary, powers vocabulary), `docs/api-v1-routes.md` (per-route
 * shapes) and the generated `apps/api/openapi.json` (also served at
 * `/openapi.json`). Field names are snake_case exactly as served. Optional
 * (`?`) means the server omits the field when it has no backed value; bigname
 * does not serialize `null` placeholders unless the contract says a field is
 * nullable (`| null`).
 */

/** Lowercase `0x`-prefixed hex string (addresses, hashes, record values). */
export type Hex = `0x${string}`

/**
 * Every public timestamp: a decimal string of Unix seconds, e.g.
 * `"1803965433"`. Expiry values are exact and can exceed `2^53`, so compare
 * them with `timestampToBigInt`; `parseTimestamp` turns one into a `Date`.
 */
export type Timestamp = string

/** Public namespace slug. Name-shaped routes infer it; `base.eth` is `basenames`. */
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
 * The registry generation that owns the node. `ens_v0` is an ENSv1 name whose
 * record is still read from the 2017 registry.
 */
export type Authority = 'ens_v0' | 'ens_v1' | 'ens_v2'

export type RegistrationStatus =
  | 'active'
  | 'wrapped'
  | 'registered'
  | 'released'
  | 'unregistered'

export type WrapperState = 'wrapped' | 'emancipated' | 'locked'

/** Why a registration's `expires_at` (and `grace_ends_at`) is `null`. */
export type ExpiryReason = 'no_expiry' | 'not_set' | 'released'

/** The protocol generation `.eth` resolution follows on a network. */
export type ResolutionProtocol = 'ens_v1' | 'ens_v2'

/**
 * Authority relations between an address and a name (filter values).
 * `owner` is the token holder (else the registry owner), `manager` the account
 * that can change the registry record, `role_holder` an ENSv2 registry role
 * holder on the current registration. `registrant` was removed in v0.3.0.
 */
export type AuthorityRelation = 'owner' | 'manager' | 'role_holder'

/**
 * Relations a row reports in `relations`. `resolves_to` only on
 * `relation=resolves_to` reads; `former_owner` only on `relation=former_owner`.
 */
export type AddressRelation = AuthorityRelation | 'resolves_to' | 'former_owner'

export type NameMatch = 'prefix' | 'contains'

/** A contract pointer: resolver, subregistry, registry. */
export interface ContractRef {
  readonly chain_id: number
  readonly address: Hex
}

/** Name identity fields shared by every name-shaped row. */
export interface NameIdentity {
  /** ENSIP-15 normalized name (subname rows may carry a non-name form). */
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

/** A chain in the request scope that was suppressed from `meta.as_of`. */
export interface AsOfCompleteness {
  readonly completeness: Completeness
  readonly unsupported_reason: string
}

/** Per-chain capability summary on the namespace route. */
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
  readonly as_of_completeness?: Readonly<Record<string, AsOfCompleteness>>
  /** Opaque snapshot token; pass back as `at`. Single-resource reads only. */
  readonly as_of_token?: string
  /** Present only when the read is not clean. */
  readonly completeness?: Completeness
  readonly unsupported_fields?: readonly string[]
  readonly unsupported_reason?: string
  /**
   * Permission reads: surfaces whose holders the rows do not list. A
   * `registry` read of a discovered (not manifest-declared) registry reports
   * `['ens_v2_registry_operators']` with `completeness: 'partial'` and
   * `unsupported_reason: 'permissions_partially_listed'`, on an empty page too.
   */
  readonly unlisted_permission_surfaces?: readonly PermissionSurface[]
  /** Present on routes that accept `source`. */
  readonly source?: 'indexed' | 'verified'
}

export interface Page {
  readonly cursor: string | null
  readonly next_cursor: string | null
  readonly page_size: number
  /**
   * Exact count where the route supports it and it was asked for, else
   * `null`. Address names serve `null` for an address with more
   * than 1,000 candidate names unless `include=total_count` is sent.
   */
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
    readonly details: Readonly<Record<string, unknown>>
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

/**
 * Why a `wrapper_expires_at` is `null`: `no_expiry` is the NameWrapper
 * maximum (`type(uint64).max`), `not_set` a stored zero.
 */
export type WrapperExpiryReason = 'no_expiry' | 'not_set'

/**
 * `ens_v1_wrapper` resource restrictions. Served only for a backed wrapper
 * (one with a `wrapper_state`), unlike `ens_v1.wrapper_expires_at`.
 */
export interface WrapperRestrictions {
  readonly registration_id: string
  readonly kind: 'ens_v1_wrapper'
  readonly wrapper_state: WrapperState
  readonly wrapper_fuses: WrapperFuses
  /**
   * The NameWrapper entry's own stored expiry, exact over the full uint64
   * range, or `null` with `wrapper_expires_at_reason`. Wrapping and
   * `NameWrapper.renew` set it to the registrar expiry plus 90 days on a
   * `.eth` 2LD, but a renewal through a controller that calls only
   * `BaseRegistrar.renew` leaves it unchanged, so it can trail the lease.
   * Read it with `readWrapperExpiry`.
   */
  readonly wrapper_expires_at?: Timestamp | null
  /** Present exactly when `wrapper_expires_at` is `null`. */
  readonly wrapper_expires_at_reason?: WrapperExpiryReason
}

/** `ens_v2_registry` resource restrictions. */
export interface RegistryRestrictions {
  readonly registration_id: string
  readonly kind: 'ens_v2_registry'
  /**
   * Roles whose assignment can no longer change: no current permission row
   * on the registration or its registry root carries the admin counterpart.
   * `transfer` is the exception: it is listed whenever no row on the
   * registration itself carries `can_transfer_admin`, since that role on the
   * registry root does not count. `[]` means every
   * role can still change.
   */
  readonly locked_roles: readonly LockableRole[]
}

/** Resource restrictions of a registration (api-v1.md, Resource restrictions). */
export type Restrictions = WrapperRestrictions | RegistryRestrictions

/**
 * Scope of a grant on an ENSv2 registry's root resource, whose roles apply to
 * every resource of that registry.
 */
export interface RootGrantScope {
  readonly kind: 'root'
  readonly detail: {
    /** The registry for a root permission scope. */
    readonly registry?: ContractRef
  }
}

/** Scope of a current permission grant (permission rows, `role_summary`). */
export type GrantScope =
  | RootGrantScope
  | {
      readonly kind: 'registry' | 'registration'
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
        readonly authority_kind: 'registry' | 'registrar' | 'wrapper'
        readonly authority_contract: Hex
        readonly owner: Hex
      }
    }

/**
 * History-only scope of an admitted BaseRegistrar `ControllerAdded` /
 * `ControllerRemoved` `permission` row: registrar-wide, not a name grant.
 */
export interface RegistrarControllerScope {
  readonly kind: 'registrar_controller'
  readonly detail: { readonly registrar: ContractRef }
}

/** Scope on a `permission` history row. */
export type HistoryGrantScope = GrantScope | RegistrarControllerScope

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
  readonly kind?:
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

/** `include=lineage` on permission rows. */
export interface PermissionLineage {
  readonly grant: PermissionLineageEntry
  readonly revocation?: PermissionLineageEntry
  readonly inheritance_path?: readonly PermissionLineageEntry[]
  readonly transfer_behavior?: string | PermissionLineageEntry
}

/**
 * A registry root holder (`grant_scope.kind: 'root'`) carries its declared
 * root roles in `powers` (never empty), the root resource's id as
 * `registration_id` and `authority_context: 'resource_audit'`; it has no
 * `name`, `grant_relation`, `record_resource` or wrapper fields.
 */
export interface PermissionRow {
  readonly address: Hex
  readonly grant_relation?: GrantRelation
  readonly grant_scope: GrantScope
  readonly powers: readonly Power[]
  /** On a root row the registry root resource's id, not a name registration. */
  readonly registration_id: string
  readonly record_resource?: RecordResource
  readonly name?: string
  readonly authority_context: AuthorityContext
  /** Permission rows keep the wrapper fields top-level (name rows nest them under `ens_v1`). */
  readonly wrapper_state?: WrapperState
  readonly wrapper_fuses?: WrapperFuses
  readonly lineage?: PermissionLineage
}

/**
 * `GET /v1/permissions`: reads bound to a name or registration add top-level
 * `restrictions`; a `registry` read never does.
 */
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
  readonly network_head_status: NetworkHeadStatus
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
// Shared name-row fields
// ---------------------------------------------------------------------------

/**
 * What only ENSv1 holds about a name. Present on name-shaped rows exactly
 * while the name's `authority` is `ens_v1` or `ens_v0`.
 */
export interface EnsV1 {
  /**
   * BaseRegistrar lease expiry, or `null` when the name has no lease (every
   * subname). After the Universal Resolver cutover a `.eth` name with a live
   * ENSv2 entry serves that entry's expiry at the top level and keeps the
   * lease date here; the lease's grace ends 90 days after it. Omitted only on
   * a registry child named solely under a non-normalizable label.
   */
  readonly expires_at?: Timestamp | null
  /** Present exactly when `wrapper_fuses` is present. */
  readonly wrapper_state?: WrapperState
  readonly wrapper_fuses?: WrapperFuses
  /**
   * The NameWrapper entry's own stored expiry, exact over the
   * full uint64 range, or `null` with `wrapper_expires_at_reason`. Not the
   * lease plus 90 days: a renewal that calls only `BaseRegistrar.renew`
   * leaves it unchanged, so it can be earlier than `expires_at`. Present
   * while the name has a current NameWrapper entry: beside `wrapper_state`,
   * and alone, in the past, once an emancipated or locked wrapper has lapsed.
   * Omitted when there is no entry, once the name is unwrapped (even where
   * `wrapper_state` is still served) and on a registry child with no name
   * row, so absence does not prove the name is unwrapped. Read it with
   * `readWrapperExpiry`.
   */
  readonly wrapper_expires_at?: Timestamp | null
  /** Present exactly when `wrapper_expires_at` is `null`. */
  readonly wrapper_expires_at_reason?: WrapperExpiryReason
}

/** Holder of a released registration when it ended. Not current state. */
export interface LapsedRegistration {
  /** The name's `owner` when the registration ended. */
  readonly owner?: Hex
  /** `registry` for an ENSv2 registration. */
  readonly held_through?: 'registrar' | 'wrapper' | 'registry'
  readonly released_at?: Timestamp
  /** `unregistered` is an explicit ENSv2 unregister (served `expires_at: null`). */
  readonly release_kind?: 'expired' | 'unregistered'
}

/**
 * Expiry fields of a name-shaped row. A finite expiry is a string and omits
 * the reason; a classified absent expiry is `null` with `expires_at_reason`
 * (and a `null` `grace_ends_at`); a row with no registration context omits
 * all three.
 */
export interface ExpiryFields {
  /**
   * Served expiry. From the Universal Resolver cutover a `.eth` name with a
   * live ENSv2 entry serves that entry's (the ENSv1 lease is `ens_v1.expires_at`).
   */
  readonly expires_at?: Timestamp | null
  /** Present exactly when `expires_at` is `null`. */
  readonly expires_at_reason?: ExpiryReason
  /** End of the renewal grace of `expires_at` (+90 days ENSv1/Basenames, +28 ENSv2 `.eth`, +0 subnames). */
  readonly grace_ends_at?: Timestamp | null
  readonly ens_v1?: EnsV1
}

/**
 * Who holds and who controls a name (v0.3.0+). Released names carry neither;
 * the last holder is `lapsed_registration.owner`.
 */
export interface OwnershipFields {
  /**
   * Token holder (BaseRegistrar, NameWrapper or ENSv2 registry token), else
   * the registry owner. Omitted on released names and on expired emancipated
   * or locked wrapped names.
   */
  readonly owner?: Hex
  /**
   * Account that can change the registry record. Omitted while a wrapped
   * `.eth` 2LD is in registrar grace, on released names, and where the
   * NameWrapper state is unknown.
   */
  readonly manager?: Hex
}

/** Fields every list row of a name carries (`/v1/names`, search, subnames, labels, address names). */
export interface NameRowFields
  extends NameIdentity,
    OwnershipFields,
    ExpiryFields {
  readonly registration_status: RegistrationStatus
  readonly registered_at?: Timestamp
  /** Omitted on a registry child listed without a name row. */
  readonly created_at?: Timestamp
  /** Omitted for Basenames and ownerless registry rows. */
  readonly authority?: Authority
}

// ---------------------------------------------------------------------------
// Name detail (GET /v1/names/{name}), resolver bound names, lookup detail
// ---------------------------------------------------------------------------

/** Registration and control summary of name detail, lookup detail and resolver `bound_names`. */
export interface RegistrationFields extends OwnershipFields, ExpiryFields {
  /** Omitted when `registration_status` is `unregistered`. */
  readonly registration_id?: string
  /**
   * Decimal-string token id. For ENSv2 it is the versioned ERC-1155 token
   * recorded for the current registration (it changes when roles regenerate
   * the token, while `registration_id` stays), never the labelhash or the
   * permission resource; omitted without a current registration or recorded
   * token, so released names have none.
   */
  readonly token_id?: string
  readonly registered_at?: Timestamp
  readonly created_at?: Timestamp
  readonly registration_status?: RegistrationStatus
  readonly lapsed_registration?: LapsedRegistration
  /** Omitted for Basenames and ownerless registry rows. */
  readonly authority?: Authority
  /** Present only with `authority=ens_v2` after a proven ENSv1→ENSv2 migration. */
  readonly migrated_at?: Timestamp
}

export type AbiUnsupportedReason =
  | 'inventory_not_available'
  | 'inventory_not_authoritative'
  | 'abi_observations_not_supported'
  | 'abi_observations_stale'
  | 'abi_content_type_not_single_bit'
  | (string & {})

/**
 * Grouped resolver records on name detail and lookup `profile=detail`.
 * A `seen_*` key absent from its map has an unknown value; a key mapped to
 * `null` was cleared.
 */
export interface RecordGroups {
  /** Observed canonical decimal coin types, ascending. */
  readonly seen_addresses: readonly string[]
  readonly addresses: Readonly<Record<string, Hex | null>>
  /** Observed text keys (`avatar` included), ascending. */
  readonly seen_texts: readonly string[]
  readonly texts: Readonly<Record<string, string | null>>
  /** Single-bit ABI content types as decimal strings; omitted when not enumerable. */
  readonly seen_abis?: readonly string[]
  /** Present instead of `seen_abis`. */
  readonly abi_unsupported_reason?: AbiUnsupportedReason
  /** Always `{}`: bigname does not retain ABI bytes. */
  readonly abis: Readonly<Record<string, string | null>>
  readonly seen_singletons: readonly ('contenthash' | 'name')[]
  /** `null` when cleared or authoritatively unset, omitted when unknown. */
  readonly contenthash?: Hex | null
  /** Forward name record on the name's own node (not the primary name). */
  readonly name?: string | null
}

/** Resolver and record fields of name detail and lookup `profile=detail`. */
export interface ResolverFields {
  readonly resolver?: ContractRef
  /** Why the name resolves to nothing although it records a resolver: `no_live_ens_v2_entry`. */
  readonly unresolvable_reason?: string
  /** Omitted on every `status=unsupported` record. */
  readonly subregistry?: ContractRef
  readonly records?: RecordGroups
  readonly primary_name?: string
  readonly primary_address?: Hex
  readonly chain_id?: number
  readonly network?: string
}

/** Fields of a served (not `unsupported`) name record. */
export interface NameProfileFields
  extends NameIdentity,
    RegistrationFields,
    ResolverFields {
  /** Set on the `current_authority_not_projected` partial serve. */
  readonly unsupported_reason?: string
  readonly failure_reason?: string
  readonly unsupported_fields?: readonly string[]
}

/** A supported name profile. `failed`/`stale` only occur with `source=verified`. */
export interface NameProfile extends NameProfileFields {
  readonly status: 'ok' | 'failed' | 'stale'
  /** `include=counts`. */
  readonly subname_count?: number
  /** `include=counts`; omitted when there is no current record inventory. */
  readonly record_count?: number
}

/**
 * A name bigname cannot vouch for. Indexed reads serve identity only plus the
 * reason; a verified read may retain registration fields.
 */
export interface UnsupportedName extends NameIdentity, RegistrationFields {
  readonly status: 'unsupported'
  readonly unsupported_reason: string
  readonly unsupported_fields?: readonly string[]
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
  readonly rule: 'ensip19_default_address' | 'ensip10_extended_resolver'
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

/** Record inventory container (records route `include=inventory`). */
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
  /** Exact registry resolver; `null` when none is served. */
  readonly resolver: ContractRef | null
  /** Per-key answers; the only value shape on this route. */
  readonly records: Readonly<Record<string, RecordAnswer>>
  readonly inventory?: RecordInventory
}

// ---------------------------------------------------------------------------
// Name rows: listing, search, subnames, registry labels
// ---------------------------------------------------------------------------

/** Row served by `GET /v1/names` (expiry sweep) and `GET /v1/search`. */
export interface NameListRow extends NameRowFields {
  /** Matching expires_window in request order; absent on scalar reads/search. */
  readonly expires_window_index?: number
  /** Released names only: the ended registration's last holder. */
  readonly lapsed_registration?: LapsedRegistration
}

/**
 * `GET /v1/names/{name}/subnames` row. `name` may be a non-name form
 * (`[<labelhash>].<parent>` or an escaped string). The bracketed form is a
 * valid name input but addresses no row when the child has no name row; key
 * rows by `namehash`.
 */
export interface SubnameRow extends NameRowFields {
  /** Hexadecimal labelhash ("when the readable label is not known" per contract; served on every row observed live). */
  readonly labelhash?: Hex
  readonly subregistry?: ContractRef
  /** `include=counts`. */
  readonly subname_count?: number
}

/** `GET /v1/registries/{chain_id}/{address}/labels` row. */
export interface RegistryLabelRow extends SubnameRow {
  /** `include=counts`: distinct direct role holders. */
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

export interface AddressNameRow extends NameRowFields {
  /** Selects this row's permission rows via `listPermissions({ registration_id })`. */
  readonly permission_resource_id?: string
  readonly migrated_at?: Timestamp
  readonly relations: readonly AddressRelation[]
  readonly is_primary: boolean
  /** `relation=resolves_to` with one decimal `coin_type`. */
  readonly resolution?: Resolution
  /** `relation=resolves_to&coin_type=evm`: matches only, ascending, at most 100. */
  readonly resolutions?: readonly Resolution[]
  /** `relation=former_owner` rows. */
  readonly lapsed_registration?: LapsedRegistration
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
  | 'migration'

/** Raw storage kinds served with `include=raw` and accepted by the `kind` filter. */
export type HistoryEventKind =
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
  /** a role change on an ENSv2 registry's root resource. */
  | 'RootPermissionChanged'
  | 'PermissionScopeChanged'
  | 'RolesChanged'
  | 'EACRolesChanged'
  | 'SubregistryChanged'
  | 'MigrationApplied'

export type MigrationPath =
  | 'unwrapped'
  | 'unlocked_wrapped'
  | 'locked_wrapped'
  | 'locked_child'
  | 'emancipated_child'

/** Retained raw bytes of a non-text record write. */
export interface HexBytes {
  readonly encoding: 'hex'
  readonly bytes: Hex
}

/** A `record` row's `value`: text and hex strings, or one of the closed object forms. */
export type HistoryRecordValue =
  | string
  | HexBytes
  | { readonly deleted: boolean }
  | { readonly previous: HexBytes; readonly current: HexBytes }
  | { readonly indexed_data_hash: Hex }

/** Expiry payload shared by registration, renewal, release and expiry rows. */
interface HistoryExpiryData {
  readonly expires_at?: Timestamp | null
  /** Present exactly when `expires_at` is `null`. */
  readonly expires_at_reason?: ExpiryReason
}

/**
 * The ENSv2 storage key of the row's token: the event-local
 * identifier with its low 32 bits (the token version) cleared, as a decimal
 * string. Scoped by registry and chain; not the labelhash, a `token_id` or a
 * `registration_id`. Only on ENSv2 registry and registrar rows that retain
 * the evidence; never on root permission rows.
 */
interface HistoryCanonicalIdData {
  readonly canonical_id?: string
}

/**
 * Registrar payment evidence, only where the admitted event
 * retained it (Basenames rows and some Sepolia ENSv1 rows have none). Amounts
 * are unsigned decimal strings with full uint256 precision: native wei for
 * ENSv1, raw units of `payment_token` for ENSv2. An explicit zero is served.
 */
interface HistoryPaymentData {
  /** A registration's unsplit amount, or a renewal's total. */
  readonly cost?: string
  /** ENSv2 only: the ERC-20 paid in. A zero address is served as is. */
  readonly payment_token?: ContractRef
  /** The emitted bytes32 referrer, lowercase hex, zero included. */
  readonly referrer?: Hex
}

/**
 * Per-type `include=data` payloads. Only fields the row carries are present.
 * `token_id`, `canonical_id`, the payment fields and `operator` are served
 * when the admitted event carries it.
 */
export interface HistoryEventDataByType {
  readonly registration: HistoryExpiryData &
    HistoryCanonicalIdData &
    HistoryPaymentData & {
      /**
       * ENSv2 only: the versioned ERC-1155 token at this event's own position,
       * not the name's current token.
       */
      readonly token_id?: string
      /** Explicitly emitted base amount; a row with only `cost` has no split. */
      readonly base_cost?: string
      /** Explicitly emitted premium. */
      readonly premium?: string
      /** The registrant the event named (history keeps it; rows dropped it in v0.3.0). */
      readonly registrant?: Hex
      readonly owner?: Hex
      readonly resolver?: ContractRef
      readonly subregistry?: ContractRef
      /**
       * Groups the rows of one registration action. The `registered` and
       * `linked` rows of one action can both carry the same payment: one charge.
       */
      readonly action_id?: string
      readonly action_role?: 'registered' | 'linked' | 'reachable'
    }
  readonly renewal: HistoryExpiryData &
    HistoryCanonicalIdData &
    HistoryPaymentData
  readonly release: HistoryExpiryData & HistoryCanonicalIdData
  readonly expiry: HistoryExpiryData &
    HistoryCanonicalIdData & {
      /** uint32 fuse word when the change came through NameWrapper. */
      readonly fuses?: number
    }
  readonly transfer: HistoryCanonicalIdData & {
    readonly from?: Hex
    readonly to?: Hex
    readonly fuses?: number
    /**
     * The operator an ERC-1155 transfer (NameWrapper or ENSv2 registry)
     * named. ERC-721 transfers have none; never the transaction sender.
     */
    readonly operator?: Hex
    /** ENSv2 only: the versioned ERC-1155 token at this event's own position. */
    readonly token_id?: string
  }
  readonly authority: {
    /** New registry owner. */
    readonly owner?: Hex
    /** Previous owner, when retained. */
    readonly from?: Hex
  }
  /** `resolver` absent means the pointer was cleared. */
  readonly resolver: HistoryCanonicalIdData & {
    readonly resolver?: ContractRef
  }
  readonly record: {
    /** Stored key; may be outside the record grammar (`name`, `abi:<ct>`). Absent on a version reset. */
    readonly key?: string
    /** Absent when not retained and on a version reset. */
    readonly value?: HistoryRecordValue
    /** For `addr:<coin_type>` keys. */
    readonly coin_type?: number
    /** Resolver the write landed on. */
    readonly resolver?: ContractRef
    /** Node a node-keyed resolver wrote. */
    readonly node?: Hex
    /** Decimal record id a record-ID resolver wrote. */
    readonly record_id?: string
  }
  readonly primary_name: {
    readonly address?: Hex
    readonly coin_type?: number
    /** The reverse record's stored name, unnormalized; only with `name_status: 'set'`. */
    readonly name?: string
    readonly name_status?: 'set' | 'cleared' | 'unknown'
  }
  /**
   * A role change on an ENSv2 registry's root resource is a
   * `permission` row too (raw kind `RootPermissionChanged`): `grant_scope`
   * is `root` with `detail.registry`, `powers` may be `[]`, `added_powers`
   * and `removed_powers` are always present, and the row has no `name`, a
   * `null` `registration_id` and the registry as `contract_address`. It is
   * served on `/v1/events` and on the subject's address history, never on
   * name history.
   */
  readonly permission: HistoryCanonicalIdData & {
    /** The subject. */
    readonly address?: Hex
    readonly grant_scope?: HistoryGrantScope
    /** The subject's whole set under this grant after the change (before read-time masks). */
    readonly powers?: readonly Power[]
    /** Only when the log states the previous set (ENSv2 `EACRolesChanged`). */
    readonly added_powers?: readonly Power[]
    readonly removed_powers?: readonly Power[]
    /**
     * ENSv2 registry role changes on a token, never root rows: the token at
     * this event's own position, so the event that starts a regeneration
     * shows the old token. Omitted when the evidence does not prove it.
     */
    readonly token_id?: string
    /** Registrar-controller rows: `true` added, `false` removed. */
    readonly approved?: boolean
    /** uint32 word for NameWrapper fuse changes. */
    readonly fuses?: number
  }
  /** `subregistry` absent means the link was cleared. */
  readonly subregistry: HistoryCanonicalIdData & {
    readonly subregistry?: ContractRef
  }
  readonly migration: { readonly migration_path?: MigrationPath }
}

/** Fields of every row on the three history collections. */
export interface EventRowBase {
  /** Opaque 64-char row identity; a merge key across feeds, not durable. */
  readonly id: string
  /**
   * `/v1/events` and address history omit `name` on a row with no known
   * name (for example a record write keyed only by node or record id).
   */
  readonly name?: string
  readonly namespace: Namespace
  readonly registration_id: string | null
  /** Null for rows with no chain position. */
  readonly block_number: number | null
  readonly timestamp: Timestamp | null
  /** Null for rows derived from interpreter state rather than one log. */
  readonly transaction_hash: Hex | null
  readonly log_index: number | null
  /** `include=data`: lower-cased emitting contract; null for state-derived rows. */
  readonly contract_address?: Hex | null
  /** `include=raw`: raw storage event kind. */
  readonly kind?: HistoryEventKind
}

/** Name history rows always carry `name`, and `subject` with `include=child_registrations`. */
export interface HistoryEventBase extends EventRowBase {
  readonly name: string
  readonly subject?: 'name' | 'child'
}

type EventRowOf<TBase> = {
  readonly [TType in HistoryEventType]: TBase & {
    readonly type: TType
    /** `include=data`. */
    readonly data?: HistoryEventDataByType[TType]
  }
}[HistoryEventType]

/** `GET /v1/names/{name}/history` row, discriminated on `type`. */
export type HistoryEvent = EventRowOf<HistoryEventBase>

/** `GET /v1/events` and `GET /v1/addresses/{address}/history` row, discriminated on `type`. */
export type EventRow = EventRowOf<EventRowBase>

// ---------------------------------------------------------------------------
// POST /v1/lookup
// ---------------------------------------------------------------------------

export type LookupProfile = 'feed' | 'detail'

export interface LookupNameInput {
  readonly id?: string
  /** Normalized server-side; a bracketed `[<64 lowercase hex>]` label is a labelhash. */
  readonly name: string
}

/**
 * Reverse relation: `owner`, `manager`, both (`any` is `owner,manager`), or
 * `resolves_to` alone. `role_holder` and `former_owner` are not served here.
 */
export type LookupRelation =
  | 'any'
  | 'owner'
  | 'manager'
  | 'owner,manager'
  | 'resolves_to'

export interface LookupAddressInput {
  readonly id?: string
  readonly address: string
  /** Numeric coin type only (no `evm`); defaults to 60. */
  readonly coin_type?: number
  /** Omit to ask for the selected primary name. */
  readonly relation?: LookupRelation
  readonly page_size?: number
  readonly cursor?: string
}

export type LookupInput = LookupNameInput | LookupAddressInput

/** Caller input echoed on a result; reverse `relation` is normalized (`any` → `owner,manager`). */
export interface LookupResultInput {
  readonly id?: string
  /** Original caller-supplied name, before normalization. */
  readonly name?: string
  readonly address?: string
  readonly coin_type?: number
  readonly relation?: string
  readonly page_size?: number
  readonly cursor?: string
}

export interface LookupNormalization {
  readonly changed: boolean
  readonly input_name: string
  readonly reason: 'case_normalized' | 'invalid_normalized_name'
}

/** Reverse-row fields added to lookup address records. */
export interface LookupReverseFields {
  readonly is_primary: boolean
  readonly relations: readonly AddressRelation[]
  /** `resolves_to` rows. */
  readonly resolution?: Resolution
}

/**
 * `profile=feed` record: identity, chain, status, `subregistry` on name
 * results and the expiry fields with `ens_v1`. No `owner`, `manager`,
 * `authority`, `registration_status`, other registration fields, resolver
 * fields or `records`. `ens_v1` is present exactly while the detail record's
 * `authority` is `ens_v1`/`ens_v0`.
 */
export interface LookupFeedRecord extends NameIdentity, ExpiryFields {
  readonly status: ResultStatus
  readonly unsupported_reason?: string
  readonly failure_reason?: string
  readonly unsupported_fields?: readonly string[]
  readonly chain_id?: number
  readonly network?: string
  readonly subregistry?: ContractRef
}

/** A served `profile=detail` lookup record (name detail's shape, without counts). */
export interface LookupProfileRecord extends NameProfileFields {
  readonly status: Exclude<ResultStatus, 'unsupported'>
}

/** `profile=detail` name record: narrow with `isNameProfile`. */
export type LookupDetailRecord = LookupProfileRecord | UnsupportedName

/** Name-result record for a profile. */
export type LookupRecord<TProfile extends LookupProfile = 'detail'> =
  TProfile extends 'feed' ? LookupFeedRecord : LookupDetailRecord

/** Reverse-result row for a profile (unsupported rows are omitted). */
export type LookupAddressRecord<TProfile extends LookupProfile = 'detail'> =
  (TProfile extends 'feed' ? LookupFeedRecord : LookupProfileRecord) &
    LookupReverseFields

interface LookupResultBase {
  readonly status: ResultStatus
  readonly unsupported_reason?: string
  readonly failure_reason?: string
  readonly normalization?: LookupNormalization
}

export interface LookupNameResult<TProfile extends LookupProfile = 'detail'>
  extends LookupResultBase {
  readonly kind: 'name'
  readonly input: LookupResultInput & { readonly name: string }
  readonly record?: LookupRecord<TProfile>
}

export interface LookupAddressResult<TProfile extends LookupProfile = 'detail'>
  extends LookupResultBase {
  readonly kind: 'address'
  readonly input: LookupResultInput & { readonly address: string }
  readonly records?: readonly LookupAddressRecord<TProfile>[]
  readonly page?: Page
}

export type LookupResult<TProfile extends LookupProfile = 'detail'> =
  | LookupNameResult<TProfile>
  | LookupAddressResult<TProfile>

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

/** `GET /v1/resolvers/{chain_id}/{address}`. No counts or samples. */
export interface ResolverOverview {
  readonly chain_id: number
  readonly address: Hex
  /** Present only for a declared ENSv1 mirror resolver. */
  readonly mirror?: {
    readonly kind: 'ensv1_registry'
    readonly registry: ContractRef
  }
  /** `page.total_count` is null: page through it or show "N+" while `has_more`. */
  readonly bound_names: NestedPage<NameDetail>
}

/** Position of the current `Linked` observation on a resolver link. */
export interface LinkEvent {
  readonly block_number: number
  readonly timestamp: Timestamp
  readonly transaction_hash: Hex
  readonly log_index: number
}

/** Position of the earliest permission event that granted a resolver role. */
export interface GrantEvent {
  readonly block_number: number | null
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
  readonly link_event: LinkEvent
}

export interface ResolverRoleRow {
  readonly address: Hex
  readonly registration_id: string
  readonly name?: string
  readonly powers: readonly Power[]
  /** Omitted when unresolvable. */
  readonly grant_event?: GrantEvent
  readonly record_resource?: RecordResource
}

// ---------------------------------------------------------------------------
// GET /v1/namespaces/{namespace}
// ---------------------------------------------------------------------------

export interface NamespaceCapability {
  readonly completeness: Completeness
  readonly unsupported_reason?: string
  /** `verified_records` and `verified_primary_name`: per numeric chain id. */
  readonly chains?: Readonly<Record<string, ChainCompleteness>>
}

/**
 * Protocol generation `.eth` resolution follows on a network: `ens_v2` past
 * the Universal Resolver cutover. `since_block` dates the current Universal
 * Resolver implementation (`null` on a network that never upgraded).
 */
export interface NamespaceResolution {
  readonly protocol: ResolutionProtocol
  readonly since_block: number | null
}

export interface NamespaceNetwork {
  readonly network: string
  readonly chain_id?: number
  /** Absent while the network's publication is not servable (e.g. during a redo). */
  readonly resolution?: NamespaceResolution
}

export interface NamespaceInfo {
  readonly namespace: Namespace
  readonly capabilities: Readonly<Record<string, NamespaceCapability>>
  readonly networks: readonly NamespaceNetwork[]
}
