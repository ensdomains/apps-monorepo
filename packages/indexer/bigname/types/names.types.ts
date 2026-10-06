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
  WrapperFuses,
  WrapperState,
} from './common.types'

/** `GET /v1/names`: an expiry window; `expires_after` is inclusive, `expires_before` exclusive. */
export type ExpiryWindow =
  | Readonly<{ expires_after: Timestamp; expires_before?: Timestamp }>
  | Readonly<{ expires_after?: Timestamp; expires_before: Timestamp }>

/** `GET /v1/names`: query; one expiry bound is required. */
export type NamesQuery = ExpiryWindow &
  Readonly<{
    namespace: Namespace
    /** Direct children of this parent only, e.g. `eth` excludes subnames. */
    parent?: string
    authority?: Authority | readonly Authority[]
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
  authority: Authority
  owner?: Address
  manager?: Address
  registrant?: Address
  registration_status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  /** End of the registrar grace period, already adjusted for the authority. */
  grace_ends_at?: Timestamp
  /** Replaces `owner` once the registration has been released. */
  lapsed_registration?: LapsedRegistration
  /** The lease that decides an ENSv1 name, which a reserved name's `expires_at` does not show. */
  ens_v1?: EnsV1Facts
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
  expires_at?: Timestamp
  registration_status?: RegistrationStatus
  /** Present exactly when `wrapper_fuses` is present. */
  wrapper_state?: WrapperState
  wrapper_fuses?: WrapperFuses
  authority?: Authority
  /** Only while `registration_status` is `released`. */
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
