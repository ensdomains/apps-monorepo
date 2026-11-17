// ENSNode `/subgraph` rows: ids are lower-cased hex, times unix seconds as decimal strings.

export type AccountRef = Readonly<{ id: string }>

export type V1Domain = Readonly<{
  id: string
  name: string | null
  labelName: string | null
  labelhash: string | null
  /** The ENSv1 registry owner: the manager, or the NameWrapper when wrapped. */
  owner: AccountRef
  /** The BaseRegistrar token holder of a `.eth` 2LD. */
  registrant: AccountRef | null
  /** The NameWrapper token holder. */
  wrappedOwner: AccountRef | null
  resolver: Readonly<{ address: string }> | null
  resolvedAddress: AccountRef | null
  /** For a `.eth` 2LD, the lease plus the 90-day grace (subgraph semantics). */
  expiryDate: string | null
  createdAt: string
  subdomainCount: number
  parent: Readonly<{ id: string; name: string | null }> | null
  registration: Readonly<{
    registrationDate: string
    /** The bare lease, without grace. */
    expiryDate: string
  }> | null
  wrappedDomain: Readonly<{ expiryDate: string; fuses: number }> | null
}>

export type V1Resolver = Readonly<{
  address: string
  texts: readonly string[] | null
  coinTypes: readonly string[] | null
  contentHash: string | null
}>

export type V1Event = Readonly<{
  __typename: string
  id: string
  blockNumber: number
  transactionID: string
  /** Fields of the concrete event type, by name. */
  [field: string]: unknown
}>
