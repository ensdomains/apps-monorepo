import type { Address, Hex } from 'viem'

/** Which ENS deployment currently answers for a name. */
export type ProtocolVersion = 'v1' | 'v2'

/** The relation an address holds to a name. */
export type NameRelation = 'owner' | 'manager' | 'role_holder'

export type NameRegistrationStatus =
  | 'active'
  | 'expired'
  | 'released'
  | 'unregistered'

/** One page of a collection read. `totalCount` is null when the backend does not count. */
export type Page<Item> = Readonly<{
  items: readonly Item[]
  nextCursor: string | null
  totalCount: number | null
}>

/** `partial`: the backend knows of entries it did not list; `unsupported`: it cannot list them at all. */
export type Completeness = 'full' | 'partial' | 'unsupported'

/** A page from a read whose backend can say it left something out. */
export type AuditedPage<Item> = Page<Item> &
  Readonly<{ completeness: Completeness }>

/** Where and when an onchain observation was emitted. */
export type EventPosition = Readonly<{
  blockNumber: number
  timestamp: Date | null
  transactionHash: Hex | null
}>

/** Every collection read takes these; `cursor` comes from the previous page. */
export type PageQuery = Readonly<{
  pageSize?: number
  cursor?: string
}>

/** Per-read options; `signal` cancels the request in flight. */
export type ReadOptions = Readonly<{ signal?: AbortSignal }>

export type { Address, Hex }
