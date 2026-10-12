import type {
  Address,
  Cursor,
  Envelope,
  Hex,
  Namespace,
  RegistrationStatus,
  RegistryRef,
  SortOrder,
  Timestamp,
} from './common.types'

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
  status: RegistrationStatus
  registered_at?: Timestamp
  created_at?: Timestamp
  expires_at?: Timestamp
  subregistry?: RegistryRef
  /** `include=counts` only. */
  subname_count?: number
}>

/** `GET /v1/names/{name}/subnames`: response. */
export type SubnamesResponse = Envelope<readonly Subname[]>
