import type {
  Address,
  Cursor,
  Finality,
  Hex,
  Namespace,
  Page,
  RegistrationId,
  RegistryRef,
  Timestamp,
} from './common.types'
import type { NameRecord } from './names.types'
import type { Power } from './permissions.types'

/** Every resolver route: query. */
export type ResolverQuery = Readonly<{
  at?: string
  finality?: Finality
  cursor?: Cursor
  page_size?: number
}>

/** `GET /v1/resolvers/{chain_id}/{address}`: the overview and its bound names. */
export type ResolverOverview = Readonly<{
  chain_id: number
  address: Address
  /** A declared ENSv1 mirror resolver only. */
  mirror?: Readonly<{ kind: string; registry: RegistryRef }>
  /** Current bindings only; there is no top-level page. */
  bound_names: Readonly<{
    data: readonly NameRecord[]
    page: Page
  }>
}>

/** Where and when an observation was emitted. */
export type EventPosition = Readonly<{
  block_number: number
  timestamp?: Timestamp
  transaction_hash?: Hex
  log_index?: number
}>

/** `GET /v1/resolvers/{chain_id}/{address}/links`: one node bound to a record. */
export type ResolverLink = Readonly<{
  /** Decimal string. */
  record_id: string
  namehash: Hex
  /** The empty-name node whose record answers every unlinked node. */
  default: boolean
  namespace?: Namespace
  name?: string
  display_name?: string
  link_event: EventPosition
}>

/** `GET /v1/resolvers/{chain_id}/{address}/roles`: one holder and registration pair. */
export type ResolverRole = Readonly<{
  address: Address
  registration_id: RegistrationId
  /** Nonempty set of current resolver-scoped powers. */
  powers: readonly Power[]
  /** Decimal EAC resource the grant targets. */
  eac_resource?: string
  name?: string
  grant_event?: EventPosition
}>

/** `GET /v1/resolvers/{chain_id}/{address}/aliases`: a binding alias or an alias-event mapping. */
export type ResolverAlias =
  | Readonly<{
      namespace: Namespace
      name: string
      display_name: string
      namehash: Hex
    }>
  | Readonly<{
      namespace: Namespace
      from_name: string
      to_name: string
      state: string
      resolver: RegistryRef
      to_registration_id?: RegistrationId
    }>
