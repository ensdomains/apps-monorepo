// zigens rows (ensdomains/zigens `schema.graphql`): times are unix seconds, hex is lower-cased.

export type AccountRef = Readonly<{ id: string }>

export type RegistryRef = Readonly<{ address: string }>

export type V2Domain = Readonly<{
  id: string
  name: string | null
  labelName: string | null
  labelhash: string
  normalizedName: string | null
  protocol: string
  owner: AccountRef
  registrant: AccountRef | null
  resolver: Readonly<{ address: string }> | null
  resolvedAddress: AccountRef | null
  subregistry: RegistryRef | null
  expiryDate: number | null
  registrationDate: number | null
  createdAt: number
  isReachable: boolean
  isMigrated: boolean
  tokenId: string | null
  subdomainCount: number
  roleHolderCount: number
  parent: Readonly<{ subregistry: RegistryRef | null }> | null
}>

export type PageInfo = Readonly<{
  hasNextPage: boolean
  endCursor: string | null
}>

export type Connection<Node> = Readonly<{
  pageInfo: PageInfo
  edges: readonly Readonly<{ cursor: string; node: Node }>[]
  totalCount: number | null
}>

export type V2Resolver = Readonly<{
  address: string
  texts: readonly string[] | null
  coinTypes: readonly string[] | null
  contentHash: string | null
  abis: readonly number[] | null
  dataKeys: readonly string[] | null
  interfaces: readonly Readonly<{ interfaceId: string }>[] | null
}>

export type RoleAssignment = Readonly<{
  id: string
  resource: string
  account: string
  contractAddress: string
  roleBitmap: string
  permissions: readonly string[]
  blockNumber: number
  transactionHash: string
  timestamp: number
  name: string | null
}>

export type V2Event = Readonly<{
  id: string
  type: string
  blockNumber: number
  transactionHash: string
  timestamp: number
  contractAddress: string
  name: string | null
  namehash: string | null
  data: string | null
}>

export type RegistryInfo = Readonly<{
  address: string
  name: string
  namehash: string
  parentRegistry: string
  createdBlock: number
  createdAt: number
  labelCount: number
  referencedByCount: number
}>

export type RegistryRow = RegistryInfo &
  Readonly<{
    referencedByConnection: Connection<
      Readonly<{
        id: string
        name: string | null
        normalizedName: string | null
      }>
    >
  }>

export type ResolverBinding = Readonly<{
  recordId: string | null
  domain: Readonly<{
    id: string
    name: string | null
    owner: AccountRef
  }> | null
}>

export type ResolverActivity = Readonly<{
  resolver: Readonly<{
    roleHolderCount: number
    events: readonly Readonly<{ id: string }>[]
  }> | null
  resolvers: readonly Readonly<{ id: string }>[]
}>
