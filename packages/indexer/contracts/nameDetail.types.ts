import type { ResultAsync } from 'neverthrow'
import type {
  Address,
  Hex,
  NameRegistrationStatus,
  ProtocolVersion,
} from './common.types'
import type { IndexerReadError } from './errors'

export type NameDetailQuery = Readonly<{
  name: string
}>

/** A name as the profile pages render it. */
export type NameDetail = Readonly<{
  name: string
  namehash: Hex
  /** Null when no deployment currently answers for the name. */
  protocol: ProtocolVersion | null
  /** False when the backend knows the name but cannot serve its fields. */
  isSupported: boolean
  owner: Address | null
  manager: Address | null
  registrant: Address | null
  resolver: Address | null
  registrationStatus: NameRegistrationStatus | null
  expiresAt: Date | null
  registeredAt: Date | null
  createdAt: Date | null
  /** When the name provably moved from v1 to v2. */
  migratedAt: Date | null
}>

/** Resolves to null when the backend has not indexed the name at all. */
export type ReadNameDetail = (
  query: NameDetailQuery,
) => ResultAsync<NameDetail | null, IndexerReadError>
