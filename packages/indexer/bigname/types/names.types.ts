import type {
  Address,
  Authority,
  Cursor,
  EnsV1Facts,
  Envelope,
  Finality,
  Hex,
  LapsedRegistration,
  Namespace,
  RegistrationId,
  RegistrationStatus,
  RegistryRef,
  ResolverRef,
  ResultStatus,
  SortOrder,
  Source,
  Timestamp,
  UnresolvableReason,
  WrapperFuses,
  WrapperState,
} from './common.types'
import type { ExpiryReason } from './history.types'
import type { RecordGroups } from './records.types'

/** `GET /v1/names`: an expiry window; `expires_after` is inclusive, `expires_before` exclusive. */
export type ExpiryWindow =
  | Readonly<{ expires_after: Timestamp; expires_before?: Timestamp }>
  | Readonly<{ expires_after?: Timestamp; expires_before: Timestamp }>

/** `GET /v1/names`: query; one expiry bound is required. */
export type NamesQuery = ExpiryWindow &
  Readonly<{
    namespace: Namespace
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
  manager?: Address
  registrant?: Address
  registration_status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  grace_ends_at?: Timestamp
  authority?: Authority
  ens_v1?: EnsV1Facts
  lapsed_registration?: LapsedRegistration
}>

/** `GET /v1/names`: response (`page.total_count` is always null). */
export type NamesResponse = Envelope<readonly NameListingRow[]>

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
  /** Null with `expires_at_reason` when the name never expires, never set one, or was released. */
  expires_at?: Timestamp | null
  expires_at_reason?: ExpiryReason
  /** When the registrar grace ends; null alongside a null expiry. */
  grace_ends_at?: Timestamp | null
  registration_status?: RegistrationStatus
  /** Present exactly when `wrapper_fuses` is present. */
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  authority?: Authority
  ens_v1?: EnsV1Facts
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
  /** Present when a current record inventory is available. */
  records?: RecordGroups
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
  /**
   * A proven absence of resolution after the Universal Resolver cutover;
   * `no_live_ens_v2_entry` means an ENSv1 name holds no ENSv2 reservation or registration.
   */
  unresolvable_reason?: UnresolvableReason
  /** Resolution could not be proven either way; not an absence claim. */
  resolution_unsupported_reason?: string
}>

/** `GET /v1/names/{name}`: response. */
export type NameRecordResponse = Envelope<NameRecord>
