// ENSNode `/subgraph` speaks the ENS subgraph schema: `first`/`skip` paging, no cursors or totals.

const DOMAIN_FIELDS = /* GraphQL */ `
  id
  name
  labelName
  labelhash
  owner { id }
  registrant { id }
  wrappedOwner { id }
  resolver { address }
  resolvedAddress { id }
  expiryDate
  createdAt
  subdomainCount
  parent { id name }
  registration { registrationDate expiryDate }
  wrappedDomain { expiryDate fuses }
`

export const DOMAIN_BY_NAME = /* GraphQL */ `
  query DomainByName($name: String!) {
    domains(first: 1, where: { name: $name }) { ${DOMAIN_FIELDS} }
  }
`

export const DOMAINS_BY_NAMES = /* GraphQL */ `
  query DomainsByNames($names: [String!]!) {
    domains(first: 1000, where: { name_in: $names }) { ${DOMAIN_FIELDS} }
  }
`

export const DOMAINS = /* GraphQL */ `
  query Domains(
    $where: Domain_filter!
    $first: Int!
    $skip: Int!
    $orderBy: Domain_orderBy
    $orderDirection: OrderDirection
  ) {
    domains(
      where: $where
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) { ${DOMAIN_FIELDS} }
  }
`

export const RESOLVER_OF_NAME = /* GraphQL */ `
  query ResolverOfName($name: String!) {
    domains(first: 1, where: { name: $name }) {
      resolver { address texts coinTypes contentHash }
    }
  }
`

export const META = /* GraphQL */ `
  query Meta {
    _meta { block { number } }
  }
`
const EVENT_FIELDS = `
  __typename
  id
  blockNumber
  transactionID
`

const DOMAIN_EVENT_FIELDS = /* GraphQL */ `
  ${EVENT_FIELDS}
  ... on Transfer { owner { id } }
  ... on NewOwner { owner { id } }
  ... on WrappedTransfer { owner { id } }
  ... on NewResolver { resolver { address } }
  ... on NameWrapped { owner { id } fuses expiryDate }
  ... on NameUnwrapped { owner { id } }
  ... on FusesSet { fuses }
  ... on ExpiryExtended { expiryDate }
`

const REGISTRATION_EVENT_FIELDS = /* GraphQL */ `
  ${EVENT_FIELDS}
  ... on NameRegistered { registrationId registrant { id } expiryDate }
  ... on NameRenewed { expiryDate }
  ... on NameTransferred { newOwner { id } }
`

/** A name's own events and its registration's, each list paged on its own. */
export const NAME_EVENTS = /* GraphQL */ `
  query NameEvents(
    $id: String!
    $first: Int!
    $domainSkip: Int!
    $registrationSkip: Int!
    $orderDirection: OrderDirection!
  ) {
    domain(id: $id) {
      name
      events(
        first: $first
        skip: $domainSkip
        orderBy: blockNumber
        orderDirection: $orderDirection
      ) { ${DOMAIN_EVENT_FIELDS} }
      registration {
        events(
          first: $first
          skip: $registrationSkip
          orderBy: blockNumber
          orderDirection: $orderDirection
        ) { ${REGISTRATION_EVENT_FIELDS} }
      }
    }
  }
`

/** The registrations an address made, as its ENSv1 history. */
export const REGISTRANT_EVENTS = /* GraphQL */ `
  query RegistrantEvents(
    $registrant: String!
    $first: Int!
    $skip: Int!
    $orderDirection: OrderDirection!
  ) {
    nameRegistereds(
      where: { registrant: $registrant }
      first: $first
      skip: $skip
      orderBy: blockNumber
      orderDirection: $orderDirection
    ) {
      ${EVENT_FIELDS}
      registrationId
      registrant { id }
      expiryDate
      registration { domain { name } }
    }
  }
`

/** One name's records at one resolver contract. */
export const RESOLVER_AT = /* GraphQL */ `
  query ResolverAt($address: String!, $node: String!) {
    resolvers(first: 1, where: { address: $address, domain: $node }) {
      address
      texts
      coinTypes
      contentHash
    }
  }
`

/** The names currently pointing at a resolver contract. */
export const RESOLVER_BINDINGS = /* GraphQL */ `
  query ResolverBindings($address: String!, $first: Int!, $skip: Int!) {
    resolvers(
      where: { address: $address }
      first: $first
      skip: $skip
      orderBy: id
    ) {
      domain {
        id
        name
        owner { id }
        registrant { id }
        wrappedOwner { id }
        resolver { address }
      }
    }
  }
`

/** The registrations' NameRegistered events, newest first; a re-registration reuses the registration. */
export const LATEST_REGISTRATIONS = /* GraphQL */ `
  query LatestRegistrations($ids: [String!]!) {
    nameRegistereds(
      first: 1000
      where: { registrationId_in: $ids }
      orderBy: blockNumber
      orderDirection: desc
    ) {
      id
      registrationId
      registration { registrationDate }
    }
  }
`

/** Whether the subgraph has ever seen a resolver contract. */
export const RESOLVER_EXISTS = /* GraphQL */ `
  query ResolverExists($address: String!) {
    resolvers(first: 1, where: { address: $address }) { id }
  }
`
