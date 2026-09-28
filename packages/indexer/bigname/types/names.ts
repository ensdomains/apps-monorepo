import type {
  Address,
  Authority,
  Cursor,
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
} from './common'

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
