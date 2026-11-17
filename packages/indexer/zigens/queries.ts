// zigens GraphQL: lists hide unreachable and non-normalized rows by default; connections page by Relay cursor.

const DOMAIN_FIELDS = /* GraphQL */ `
  id
  name
  labelName
  labelhash
  normalizedName
  protocol
  owner { id }
  registrant { id }
  resolver { address }
  resolvedAddress { id }
  subregistry { address }
  expiryDate
  registrationDate
  createdAt
  isReachable
  isMigrated
  tokenId
  subdomainCount
  roleHolderCount
  parent { subregistry { address } }
`

const RESOLVER_RECORD_FIELDS = /* GraphQL */ `
  address
  texts
  coinTypes
  contentHash
  abis
`

const PAGE_FIELDS = /* GraphQL */ `
  pageInfo { hasNextPage endCursor }
  totalCount
`

export const DOMAINS_BY_NAMES = /* GraphQL */ `
  query DomainsByNames($names: [String!]!) {
    domains(
      first: 1000
      where: { name_in: $names, includeUnreachable: true, includeUnnormalized: true }
    ) { ${DOMAIN_FIELDS} }
  }
`

export const DOMAIN_CONNECTION = /* GraphQL */ `
  query DomainConnection(
    $where: DomainFilter!
    $first: Int!
    $after: String
    $orderBy: Domain_orderBy
    $orderDirection: OrderDirection
  ) {
    domainConnection(
      where: $where
      first: $first
      after: $after
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ${PAGE_FIELDS}
      edges { cursor node { ${DOMAIN_FIELDS} } }
    }
  }
`

const ROLE_FIELDS = /* GraphQL */ `
  id
  resource
  account
  contractAddress
  roleBitmap
  permissions
  blockNumber
  transactionHash
  timestamp
  name
`

export const ROLE_CONNECTION = /* GraphQL */ `
  query RoleConnection(
    $first: Int!
    $after: String
    $account: String
    $contract: String
    $resource: String
  ) {
    roleConnection(
      first: $first
      after: $after
      account: $account
      contract: $contract
      resource: $resource
      protocol: "v2"
    ) {
      ${PAGE_FIELDS}
      edges { cursor node { ${ROLE_FIELDS} } }
    }
  }
`

export const REGISTRY = /* GraphQL */ `
  query Registry($address: String!, $first: Int!, $after: String) {
    registry(address: $address) {
      address
      name
      namehash
      parentRegistry
      createdBlock
      createdAt
      labelCount
      referencedByCount
      referencedByConnection(first: $first, after: $after) {
        ${PAGE_FIELDS}
        edges { cursor node { id name normalizedName } }
      }
    }
  }
`

export const REGISTRY_LABELS = /* GraphQL */ `
  query RegistryLabels(
    $address: String!
    $where: DomainFilter
    $first: Int!
    $after: String
    $orderBy: Domain_orderBy
    $orderDirection: OrderDirection
  ) {
    registry(address: $address) {
      labelConnection(
        where: $where
        first: $first
        after: $after
        orderBy: $orderBy
        orderDirection: $orderDirection
      ) {
        ${PAGE_FIELDS}
        edges { cursor node { ${DOMAIN_FIELDS} } }
      }
    }
  }
`

export const RESOLVER_OF_NAME = /* GraphQL */ `
  query ResolverOfName($names: [String!]!) {
    domains(
      first: 5
      where: { name_in: $names, includeUnreachable: true, includeUnnormalized: true }
    ) {
      protocol
      owner { id }
      resolver { ${RESOLVER_RECORD_FIELDS} }
    }
  }
`

/** One name's records at one resolver contract. */
export const RESOLVER_AT = /* GraphQL */ `
  query ResolverAt($address: String!, $node: String!) {
    resolvers(first: 1, where: { address: $address, namehash: $node, protocol: "v2" }) {
      ${RESOLVER_RECORD_FIELDS}
    }
  }
`

/** Every name bound to a resolver contract, with the record it reads. */
export const RESOLVER_BINDINGS = /* GraphQL */ `
  query ResolverBindings($address: String!, $first: Int!, $skip: Int!) {
    resolvers(
      where: { address: $address, protocol: "v2" }
      first: $first
      skip: $skip
    ) {
      recordId
      domain { id name owner { id } }
    }
  }
`

/** The name a versioned token id belongs to. */
export const DOMAIN_BY_TOKEN = /* GraphQL */ `
  query DomainByToken($tokenId: String!) {
    domains(
      first: 1
      where: { tokenId: $tokenId, includeUnreachable: true, includeUnnormalized: true }
    ) { id registrationDate }
  }
`

const EVENT_FIELDS = /* GraphQL */ `
  id
  type
  blockNumber
  transactionHash
  timestamp
  contractAddress
  name
  namehash
  data
`

export const EVENT_CONNECTION = /* GraphQL */ `
  query EventConnection(
    $where: EventFilter!
    $first: Int!
    $after: String
    $orderDirection: OrderDirection
  ) {
    eventConnection(
      where: $where
      first: $first
      after: $after
      orderBy: blockNumber
      orderDirection: $orderDirection
    ) {
      ${PAGE_FIELDS}
      edges { cursor node { ${EVENT_FIELDS} } }
    }
  }
`

export const META = /* GraphQL */ `
  query Meta {
    _meta { block { number } hasIndexingErrors }
  }
`
