import type {
  Address,
  Authority,
  Cursor,
  EnsV1Facts,
  Envelope,
  Hex,
  LapsedRegistration,
  Namespace,
  RegistrationStatus,
  SortOrder,
  Timestamp,
} from './common.types'
import type {
  AuthorityRelation,
  Relation,
  Restrictions,
  RoleSummary,
} from './permissions.types'

/** `GET /v1/addresses/{address}/names`: query. */
export type AddressNamesQuery = Readonly<{
  namespace?: Namespace
  /** Control relations as a set, `any` for all three, or `resolves_to` or `former_owner` on its own. */
  relation?:
    | readonly AuthorityRelation[]
    | 'any'
    | 'resolves_to'
    | 'former_owner'
  /** Only with `relation=resolves_to`: decimal coin type (default 60) or `evm`. */
  coin_type?: number | 'evm'
  authority?: Authority | readonly Authority[]
  /** Direct children of this parent only, e.g. `eth` excludes subnames. */
  parent?: string
  expires_after?: Timestamp
  expires_before?: Timestamp
  /** Rejected with `relation=resolves_to`. */
  is_migrated?: 'true' | 'false'
  /** ENSIP-15 name prefix; one trailing dot marks a label boundary. */
  q?: string
  /** ENSIP-15 matching mode for `q`; `prefix` when absent. */
  match?: 'prefix' | 'contains'
  sort?: 'name' | 'expires_at' | 'registered_at' | 'created_at'
  order?: SortOrder
  dedupe?: 'name' | 'registration'
  /** `total_count` asks for an exact total, which large results otherwise omit. */
  include?: readonly ('counts' | 'role_summary' | 'total_count')[]
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
  manager?: Address
  registrant?: Address
  status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  grace_ends_at?: Timestamp
  authority?: Authority
  ens_v1?: EnsV1Facts
  migrated_at?: Timestamp
  /** Only on `released` rows. */
  lapsed_registration?: LapsedRegistration
  /** Matched subset of `owner`/`manager`/`role_holder`, or `["resolves_to"]`. */
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
