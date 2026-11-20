import type {
  Address,
  AuditedPage,
  EventPosition,
  Hex,
  Page,
  PageQuery,
} from './common.types'

/** A name's identity, as nested lists give it. */
export type NameRef = Readonly<{ name: string; namehash: Hex }>

export type RegistryQuery = PageQuery &
  Readonly<{
    /** `cursor` and `pageSize` page `referencedBy`. */
    address: Address
  }>

/** One ENSv2 registry. */
export type Registry = Readonly<{
  address: Address
  /** The earliest name pointing at the registry; null when none does. */
  name: NameRef | null
  createdBlock: number
  createdAt: Date | null
  /** Null when the backend does not keep it. */
  createdTransactionHash: Hex | null
  /** Null when the backend cannot count. */
  labelCount: number | null
  /** The names whose subregistry is this one. */
  referencedBy: Page<NameRef>
}>

export type RegistryLabelsQuery = PageQuery &
  Readonly<{
    address: Address
    /** Only labels this address owns. */
    owner?: Address
    /** Every label this address does not own, ownerless ones included. */
    excludeOwner?: Address
    includeCounts?: boolean
  }>

export type RegistryLabel = Readonly<{
  name: string
  displayName: string
  namehash: Hex
  labelhash: Hex | null
  owner: Address | null
  expiresAt: Date | null
  /** Only with `includeCounts`: distinct accounts holding a role on the label. */
  roleHolderCount?: number
}>

export type ResolverQuery = PageQuery &
  Readonly<{
    /** `cursor` and `pageSize` page `boundNames`. */
    address: Address
  }>

export type BoundName = Readonly<{
  name: string
  namehash: Hex
  owner: Address | null
}>

/** A resolver contract and the names currently pointing at it. */
export type ResolverOverview = Readonly<{
  address: Address
  /** The registry a declared ENSv1 mirror resolver follows; null otherwise. */
  mirrorRegistry: Address | null
  boundNames: Page<BoundName>
}>

export type ResolverCollectionQuery = PageQuery & Readonly<{ address: Address }>

/** A node bound to a record on a record-model resolver. */
export type ResolverLink = Readonly<{
  /** Decimal. */
  recordId: string
  namehash: Hex
  /** The empty-name node whose record answers every unlinked node. */
  isDefault: boolean
  name: string | null
}>

/** One setter argument a resolver grant is scoped to. */
export type RecordResource =
  | Readonly<{ kind: 'address'; hash: Hex; coinType: bigint | null }>
  | Readonly<{ kind: 'text' | 'data'; hash: Hex; key: string | null }>
  | Readonly<{ kind: 'abi'; hash: Hex; contentType: bigint | null }>
  | Readonly<{ kind: 'interface'; hash: Hex; interfaceId: Hex }>

/** One holder's current powers on a resolver. */
export type ResolverRoleGrant = Readonly<{
  account: Address
  /** The registration or EAC resource the grant targets. */
  registrationId: string | null
  /** In bigname's power vocabulary, e.g. `set_text`, `admin_set_text`. */
  powers: readonly string[]
  /** Decimal EAC resource. */
  eacResource: string | null
  /** Set when the grant covers one record argument only. */
  recordResource: RecordResource | null
  name: string | null
  grantedAt: EventPosition | null
}>

export type PermissionsQuery = PageQuery &
  Readonly<{
    /** The registry whose root role holders are read. */
    registry: Address
  }>

/** One account's powers on a registry's root resource. */
export type RootRoleGrant = Readonly<{
  account: Address
  powers: readonly string[]
}>

export type RootRoleGrants = AuditedPage<RootRoleGrant> &
  Readonly<{
    /** True when registry-wide operators hold powers the rows do not list. */
    hasUnlistedOperators: boolean
  }>

/** How far the backend has indexed the chain. */
export type SyncStatus = Readonly<{
  /** Every block up to this one is indexed; null when unknown. */
  indexedBlock: number | null
}>
