import type { Address } from './common.types'

export type RecordKeysQuery = Readonly<{
  name: string
  /** Read the keys at this resolver instead of the name's current one. */
  resolver?: Address
}>

/** A name's record keys at its resolver, in bigname's record-key grammar (`text:<key>`, `addr:<coinType>`, `contenthash`). */
export type RecordKeys = Readonly<{
  /** The resolver read; null when the name has none. */
  resolver: Address | null
  /** Keys with a value. */
  knownKeys: readonly string[]
  /** Keys that were set and since cleared. */
  unsetKeys: readonly string[]
  /** Keys seen whose values the backend cannot serve. */
  unsupportedKeys: readonly string[]
  /** ABI content types set, ascending; null when they cannot be listed. */
  abiContentTypes: readonly bigint[] | null
}>
