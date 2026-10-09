import type { ResultAsync } from 'neverthrow'
import type {
  Address,
  Hex,
  NameRegistrationStatus,
  NameRelation,
  Page,
  ProtocolVersion,
} from './common.types'
import type { IndexerReadError } from './errors'

export type NamesForAddressQuery = Readonly<{
  address: Address
  /** Defaults to every relation. */
  relations?: readonly NameRelation[]
  protocol?: ProtocolVersion
  /** Only names with a proven move from v1 to v2. */
  migratedOnly?: boolean
  /** Name prefix. */
  prefix?: string
  /** A fragment the name contains; takes precedence over `prefix`. */
  contains?: string
  /** Direct children of this parent only, e.g. `eth` excludes subnames. */
  parent?: string
  sort?: 'name' | 'expiry' | 'registered' | 'created'
  order?: 'asc' | 'desc'
  includeCounts?: boolean
  /** Count the roles `address` holds on each name. */
  includeRoles?: boolean
  /** Ask for an exact `totalCount` even above the backend's candidate cap. */
  includeTotal?: boolean
  pageSize?: number
  cursor?: string
}>

/** A name as the dashboards and address pages render it. */
export type NameSummary = Readonly<{
  name: string
  /** The name as it should be shown, per ENSIP-15. */
  displayName: string
  namehash: Hex
  /** Null when no deployment currently answers for the name. */
  protocol: ProtocolVersion | null
  relations: readonly NameRelation[]
  isPrimary: boolean
  isMigrated: boolean
  registrationStatus: NameRegistrationStatus
  /** Null when the name does not expire. */
  expiresAt: Date | null
  /**
   * The served expiry in exact unix seconds, which the backend sorts by. A
   * reserved ENSv1 name serves its ENSv2 reservation here; `expiresAt` keeps the lease.
   */
  servedExpiry: bigint | null
  registeredAt: Date | null
  createdAt: Date | null
  /** Only with `includeCounts`. */
  subnameCount?: number
  recordCount?: number
  /** Only with `includeRoles`: the distinct powers `address` holds on the name. */
  roleCount?: number
}>

export type ReadNamesForAddress = (
  query: NamesForAddressQuery,
) => ResultAsync<Page<NameSummary>, IndexerReadError>
