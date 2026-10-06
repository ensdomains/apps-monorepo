// Hand-written types for the bigname `/v1` API.
// Sources: bigname/docs/api-v1.md (envelope, dictionary, status, errors, cursors),
// bigname/docs/api-v1-routes.md (per-route reference), DTOs under apps/api/src/v2/.
// Optional fields are omitted on the wire unless typed `| null` here.
// Unknown query parameters are rejected with `400 invalid_input`; the `*Query`
// types below list exactly the parameters each route accepts.

/** Lower-cased `0x`-prefixed 20-byte EVM address. */
export type Address = `0x${string}`
/** Lower-cased `0x`-prefixed hex string (hashes, contenthash, multicoin address bytes). */
export type Hex = `0x${string}`
/**
 * A point in time. The docs promise RFC 3339 with a `Z` suffix, but every
 * route currently answers with unix seconds as a decimal string. Parse with
 * `toDate`/`toUnixSeconds`, never `new Date(value)`.
 */
export type Timestamp = string
/** Opaque, versioned pagination cursor. */
export type Cursor = string
/** Public namespace slug (`ens`, `basenames`). */
export type Namespace = string
/** Opaque stable handle of one registration lifecycle. */
export type RegistrationId = string

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

/** Name-shaped rows: the ENSv1 registrar lease and NameWrapper state behind a name. */
export type EnsV1Facts = Readonly<{
  /** The BaseRegistrar lease; null on a subname. */
  expires_at?: Timestamp | null
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  /** Null when the wrapper never set one. */
  wrapper_expires_at?: Timestamp | null
}>

/** `GET /v1/names/{name}`, detail lookup: the holder a released ENSv1 lease had when it lapsed. */
export type LapsedRegistration = Readonly<{
  /** Who held the registration when it lapsed. */
  owner?: Address
  released_at?: Timestamp
  release_kind?: string
}>
