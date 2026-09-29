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
  sort?: 'name' | 'expiry' | 'registered'
  order?: 'asc' | 'desc'
  includeCounts?: boolean
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
  registeredAt: Date | null
  createdAt: Date | null
  /** Only with `includeCounts`. */
  subnameCount?: number
  recordCount?: number
}>

export type NamesForAddress = (
  query: NamesForAddressQuery,
) => ResultAsync<Page<NameSummary>, IndexerReadError>
