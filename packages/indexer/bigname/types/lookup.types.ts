import type { AddressNameResolution } from './addresses.types'
import type {
  Address,
  Authority,
  Cursor,
  EnsV1Facts,
  Envelope,
  Hex,
  LapsedRegistration,
  Namespace,
  Page,
  RegistrationId,
  RegistrationStatus,
  RegistryRef,
  ResolverRef,
  ResultStatus,
  Timestamp,
} from './common.types'
import type { Relation, RelationFilter } from './permissions.types'
import type { RecordInventory } from './records.types'

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
  ens_v1?: EnsV1Facts
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
