import type { Address, Hex } from 'viem'

/** Which ENS deployment currently answers for a name. */
export type ProtocolVersion = 'v1' | 'v2'

/** The relation an address holds to a name. */
export type NameRelation = 'owner' | 'manager' | 'registrant'

export type NameRegistrationStatus =
  | 'active'
  | 'wrapped'
  | 'registered'
  | 'released'
  | 'unregistered'

/** One page of a collection read. `totalCount` is null when the backend does not count. */
export type Page<Item> = Readonly<{
  items: readonly Item[]
  nextCursor: string | null
  totalCount: number | null
}>

export type { Address, Hex }
