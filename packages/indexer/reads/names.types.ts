import type { Address, PageQuery } from './common.types'
import type { NameDetail } from './nameDetail.types'

export type NamesQuery = Readonly<{
  /** At most 1000; one result per name, in this order. */
  names: readonly string[]
}>

/** `getNames`: each name's detail, null when it is not indexed. */
export type NamesResult = readonly (NameDetail | null)[]

export type GraceNamesQuery = Readonly<{
  address: Address
  /** ENSv2 `.eth` names still renewable at this instant. */
  now: Date
}>

export type SubnamesQuery = PageQuery &
  Readonly<{
    name: string
    /** List expired children too. */
    includeExpired?: boolean
    includeCounts?: boolean
  }>

/** The ENSv1 NameWrapper state of a name. */
export type WrapperState = 'unwrapped' | 'wrapped' | 'emancipated' | 'locked'

/** A direct child as the subnames lists render it, ordered by name. */
export type Subname = Readonly<{
  /** May be a bracketed labelhash form; compare rows by `labelhash`. */
  name: string
  displayName: string
  namehash: NameDetail['namehash']
  labelhash: NameDetail['namehash'] | null
  owner: Address | null
  protocol: NameDetail['protocol']
  registrationStatus: NameDetail['registrationStatus']
  expiresAt: Date | null
  /** ENSv1 only; null on an ENSv2 name. */
  wrapper: Readonly<{
    state: WrapperState
    fuses: number
    parentCannotControl: boolean
    expiresAt: Date | null
  }> | null
  /** Only with `includeCounts`. */
  subnameCount?: number
}>
