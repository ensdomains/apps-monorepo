/**
 * The slice of the ENS V1 subgraph schema the apps actually query.
 *
 * Written as SDL rather than assembled in code so it can be diffed against the
 * real thing. Two shapes here are load-bearing and easy to get subtly wrong:
 *
 * - **Events are an interface hierarchy**, not a flat object with `asXxx`
 *   accessors. Every history query in both apps selects `__typename` and then
 *   `... on NameWrapped { … }`, and inline fragments cannot resolve against a
 *   flat type at all. This is the single reason the local Panoptes indexer
 *   cannot stand in for the V1 subgraph.
 * - **BigInt is serialised as a string.** `expiryDate`, `createdAt` and `cost`
 *   are parsed with `BigInt(...)` in app code, which throws on a JSON number
 *   that has lost precision.
 */

export const typeDefs = /* GraphQL */ `
  scalar BigInt
  scalar Bytes
  scalar BigDecimal

  # The apps declare variables against these by name, so they must exist with
  # these exact spellings even though this shim sorts on a subset of them.
  enum OrderDirection {
    asc
    desc
  }

  enum Domain_orderBy {
    id
    name
    labelName
    labelhash
    parent
    subdomainCount
    resolvedAddress
    resolver
    ttl
    isMigrated
    createdAt
    owner
    registrant
    wrappedOwner
    expiryDate
    registration
    wrappedDomain
  }

  # Every event collection is ordered on blockNumber, passed as an inline enum
  # value rather than as a variable.
  enum Event_orderBy {
    id
    blockNumber
    transactionID
  }

  type Account {
    id: ID!
  }

  interface DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
  }
  type Transfer implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    owner: Account!
  }
  type NewOwner implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    owner: Account!
    parentDomain: Domain
  }
  type NewResolver implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    resolver: Resolver
  }
  type NewTTL implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    ttl: BigInt!
  }
  type WrappedTransfer implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    owner: Account!
  }
  type NameWrapped implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    name: String
    fuses: Int!
    owner: Account!
    expiryDate: BigInt!
  }
  type NameUnwrapped implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    owner: Account!
  }
  type FusesSet implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    fuses: Int!
  }
  type ExpiryExtended implements DomainEvent {
    id: ID!
    domain: Domain!
    blockNumber: Int!
    transactionID: Bytes!
    expiryDate: BigInt!
  }

  interface RegistrationEvent {
    id: ID!
    registration: Registration!
    blockNumber: Int!
    transactionID: Bytes!
  }
  type NameRegistered implements RegistrationEvent {
    id: ID!
    registration: Registration!
    blockNumber: Int!
    transactionID: Bytes!
    registrant: Account!
    expiryDate: BigInt!
  }
  type NameRenewed implements RegistrationEvent {
    id: ID!
    registration: Registration!
    blockNumber: Int!
    transactionID: Bytes!
    expiryDate: BigInt!
  }
  type NameTransferred implements RegistrationEvent {
    id: ID!
    registration: Registration!
    blockNumber: Int!
    transactionID: Bytes!
    newOwner: Account!
  }

  interface ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
  }
  type AddrChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    addr: Account!
  }
  type MulticoinAddrChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    coinType: BigInt!
    addr: Bytes!
  }
  type NameChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    name: String!
  }
  type AbiChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    contentType: BigInt!
  }
  type PubkeyChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    x: Bytes!
    y: Bytes!
  }
  type TextChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    key: String!
    value: String
  }
  type ContenthashChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    hash: Bytes!
  }
  type InterfaceChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    interfaceID: Bytes!
    implementer: Bytes!
  }
  type AuthorisationChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    owner: Bytes!
    target: Bytes!
    isAuthorized: Boolean!
  }
  type VersionChanged implements ResolverEvent {
    id: ID!
    resolver: Resolver!
    blockNumber: Int!
    transactionID: Bytes!
    version: BigInt!
  }

  type Resolver {
    id: ID!
    address: Bytes!
    domain: Domain
    addr: Account
    contentHash: Bytes
    texts: [String!]
    coinTypes: [BigInt!]
    events(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [ResolverEvent!]!
    addrChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [AddrChanged!]!
    multicoinAddrChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [MulticoinAddrChanged!]!
    nameChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [NameChanged!]!
    textChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [TextChanged!]!
    abiChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [AbiChanged!]!
    contenthashChangeds(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [ContenthashChanged!]!
  }

  type Registration {
    id: ID!
    domain: Domain!
    registrationDate: BigInt!
    expiryDate: BigInt!
    cost: BigInt
    registrant: Account!
    labelName: String
    events(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [RegistrationEvent!]!
  }

  type WrappedDomain {
    id: ID!
    domain: Domain!
    expiryDate: BigInt!
    fuses: Int!
    owner: Account!
    name: String
  }

  type Domain {
    id: ID!
    name: String
    labelName: String
    labelhash: Bytes
    parent: Domain
    subdomains(first: Int, skip: Int, orderBy: Domain_orderBy, orderDirection: OrderDirection, where: Domain_filter): [Domain!]!
    subdomainCount: Int!
    resolvedAddress: Account
    resolver: Resolver
    ttl: BigInt
    isMigrated: Boolean!
    createdAt: BigInt!
    owner: Account!
    registrant: Account
    wrappedOwner: Account
    expiryDate: BigInt
    registration: Registration
    wrappedDomain: WrappedDomain
    events(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [DomainEvent!]!
  }

  input Domain_filter {
    and: [Domain_filter]
    or: [Domain_filter]
    id: ID
    id_gt: ID
    id_lt: ID
    id_in: [ID!]
    id_not: ID
    name: String
    name_in: [String!]
    name_not: String
    labelName: String
    labelName_contains: String
    parent: String
    parent_not: String
    parent_in: [String!]
    owner: String
    owner_not: String
    owner_in: [String!]
    registrant: String
    registrant_not: String
    resolver: String
    resolver_not: String
    resolvedAddress: String
    resolvedAddress_not: String
    expiryDate: BigInt
    expiryDate_gt: BigInt
    expiryDate_lt: BigInt
    createdAt_gt: BigInt
  }

  input Resolver_filter {
    domain: String
    domain_in: [String!]
    address: Bytes
    id_in: [ID!]
  }

  type Query {
    domain(id: String!): Domain
    domains(
      first: Int
      skip: Int
      orderBy: Domain_orderBy
      orderDirection: OrderDirection
      where: Domain_filter
    ): [Domain!]!
    resolver(id: String!): Resolver
    resolvers(
      first: Int
      skip: Int
      orderBy: String
      orderDirection: OrderDirection
      where: Resolver_filter
    ): [Resolver!]!
    registration(id: String!): Registration
    registrations(first: Int, skip: Int, orderBy: Event_orderBy, orderDirection: OrderDirection): [Registration!]!
    wrappedDomain(id: String!): WrappedDomain
    _meta: _Meta_
  }

  type _Block_ {
    number: Int!
    hash: Bytes
  }
  type _Meta_ {
    block: _Block_!
    deployment: String!
    hasIndexingErrors: Boolean!
  }
`
