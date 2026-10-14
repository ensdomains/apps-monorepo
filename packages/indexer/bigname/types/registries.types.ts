import type {
  Address,
  Cursor,
  Finality,
  Hex,
  Namespace,
  Page,
  RegistryRef,
  Timestamp,
} from './common.types'
import type { Subname } from './subnames.types'

/** A name's identity, as nested collections list it. */
export type NameIdentity = Readonly<{
  name: string
  display_name: string
  namespace: Namespace
  namehash: Hex
}>

/** `GET /v1/registries/{chain_id}/{address}`: query. */
export type RegistryQuery = Readonly<{
  include?: readonly 'counts'[]
  at?: string
  finality?: Finality
  /** Pages the nested `referenced_by` collection. */
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/registries/{chain_id}/{address}`: one indexed ENSv2 registry. */
export type Registry = Readonly<{
  chain_id: number
  address: Address
  /** The earliest name pointing at the registry; null when none does. */
  name: NameIdentity | null
  parent_registry: RegistryRef | null
  created_block_number: number
  created_at: Timestamp | null
  /** Null for a declared registry with no creation event. */
  created_transaction_hash: Hex | null
  created_basis: 'registry_created' | 'subregistry_pointer' | 'declared'
  counts: Readonly<{
    /** Null for a historical selection different from the current publication. */
    labels: number | null
    /** `include=counts` only: declared account/resource assignments, not distinct holders. */
    roles?: number
    /** `include=counts` only. */
    events?: number
  }>
  /** `page.total_count` is null. */
  referenced_by: Readonly<{
    data: readonly NameIdentity[]
    page: Page
  }>
}>

/** `GET /v1/registries/{chain_id}/{address}/labels`: query. */
export type RegistryLabelsQuery = Readonly<{
  /** Only labels this address owns. */
  owner?: string
  /** Every label this address does not own, ownerless ones included. */
  exclude_owner?: string
  include?: readonly 'counts'[]
  finality?: 'latest'
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/registries/{chain_id}/{address}/labels`: one label, in the subnames row shape. */
export type RegistryLabel = Subname &
  Readonly<{
    /** `include=counts` only: distinct accounts with a declared assignment on the label. */
    role_holder_count?: number
  }>
