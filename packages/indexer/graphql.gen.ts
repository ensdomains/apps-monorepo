import gql from 'graphql-tag';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type Account = {
  __typename?: 'Account';
  domains: Array<Domain>;
  id: Scalars['String']['output'];
  registrations: Array<Registration>;
};


export type AccountRegistrationsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
};

export type Alias = {
  __typename?: 'Alias';
  fromName: Scalars['String']['output'];
  toName: Scalars['String']['output'];
};

export type CoinAddress = {
  __typename?: 'CoinAddress';
  address: Scalars['String']['output'];
  coinType: Scalars['Int']['output'];
};

export type Domain = {
  __typename?: 'Domain';
  canonicalId?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Int']['output'];
  events: Array<Event>;
  eventsCount: Scalars['Int']['output'];
  expiryDate?: Maybe<Scalars['Int']['output']>;
  id: Scalars['String']['output'];
  isMigrated: Scalars['Boolean']['output'];
  isNormalized: Scalars['Boolean']['output'];
  labelName?: Maybe<Scalars['String']['output']>;
  labelhash?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  normalizedName?: Maybe<Scalars['String']['output']>;
  owner: Account;
  parent?: Maybe<Domain>;
  registrant?: Maybe<Account>;
  registrationDate?: Maybe<Scalars['Int']['output']>;
  resolvedAddress?: Maybe<Account>;
  resolver?: Maybe<Resolver>;
  subdomains: Array<Domain>;
  subdomainsCount: Scalars['Int']['output'];
  tokenId?: Maybe<Scalars['String']['output']>;
  tokenVersion?: Maybe<Scalars['Int']['output']>;
  ttl?: Maybe<Scalars['Int']['output']>;
};


export type DomainEventsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventFilter>;
};

export type DomainConnection = {
  __typename?: 'DomainConnection';
  edges: Array<DomainEdge>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type DomainEdge = {
  __typename?: 'DomainEdge';
  cursor: Scalars['String']['output'];
  node: Domain;
};

export type DomainFilter = {
  expiry_gt?: InputMaybe<Scalars['Int']['input']>;
  expiry_gte?: InputMaybe<Scalars['Int']['input']>;
  expiry_lt?: InputMaybe<Scalars['Int']['input']>;
  expiry_lte?: InputMaybe<Scalars['Int']['input']>;
  hasSubdomains?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['String']['input']>;
  owner_in?: InputMaybe<Array<Scalars['String']['input']>>;
  resolvedAddress?: InputMaybe<Scalars['String']['input']>;
  resolver?: InputMaybe<Scalars['String']['input']>;
  subdomainCount_gt?: InputMaybe<Scalars['Int']['input']>;
  subdomainCount_lt?: InputMaybe<Scalars['Int']['input']>;
};

export enum Domain_OrderBy {
  CreatedAt = 'createdAt',
  ExpiryDate = 'expiryDate',
  Id = 'id',
  Name = 'name',
  RegistrationDate = 'registrationDate'
}

export type EacRoleAssignment = {
  __typename?: 'EACRoleAssignment';
  account: Scalars['String']['output'];
  blockNumber: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  resource: Scalars['String']['output'];
  roleBitmap: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
};

export type EacRoleAssignmentConnection = {
  __typename?: 'EACRoleAssignmentConnection';
  edges: Array<EacRoleAssignmentEdge>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type EacRoleAssignmentEdge = {
  __typename?: 'EACRoleAssignmentEdge';
  cursor: Scalars['String']['output'];
  node: EacRoleAssignment;
};

export type Event = {
  __typename?: 'Event';
  blockNumber: Scalars['Int']['output'];
  chain: Scalars['String']['output'];
  contractAddress: Scalars['String']['output'];
  data?: Maybe<Scalars['String']['output']>;
  domain?: Maybe<Domain>;
  id: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  namehash?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type EventConnection = {
  __typename?: 'EventConnection';
  edges: Array<EventEdge>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type EventEdge = {
  __typename?: 'EventEdge';
  cursor: Scalars['String']['output'];
  node: Event;
};

export type EventFilter = {
  blockNumber_gt?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['Int']['input']>;
  contractAddress?: InputMaybe<Scalars['String']['input']>;
  domain?: InputMaybe<Scalars['String']['input']>;
  namehash?: InputMaybe<Scalars['String']['input']>;
  timestamp_gt?: InputMaybe<Scalars['Int']['input']>;
  timestamp_lt?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
  type_in?: InputMaybe<Array<Scalars['String']['input']>>;
};

export enum Event_OrderBy {
  BlockNumber = 'blockNumber',
  Name = 'name',
  Timestamp = 'timestamp'
}

export type InterfaceRecord = {
  __typename?: 'InterfaceRecord';
  implementer: Scalars['String']['output'];
  interfaceId: Scalars['String']['output'];
};

export enum OrderDirection {
  Asc = 'asc',
  Desc = 'desc'
}

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Pubkey = {
  __typename?: 'Pubkey';
  x: Scalars['String']['output'];
  y: Scalars['String']['output'];
};

export type Query = {
  __typename?: 'Query';
  account?: Maybe<Account>;
  approvals: Array<ResolverApproval>;
  domain?: Maybe<Domain>;
  domainConnection: DomainConnection;
  domains: Array<Domain>;
  eventConnection: EventConnection;
  events: Array<Event>;
  metadata?: Maybe<ResolverMetadata>;
  registrationConnection: RegistrationConnection;
  registrations: Array<Registration>;
  registries: Array<RegistryInfo>;
  resolver?: Maybe<ResolverDetail>;
  resolvers: Array<ResolverDetail>;
  roleConnection: EacRoleAssignmentConnection;
  roles: Array<EacRoleAssignment>;
};


export type QueryAccountArgs = {
  id: Scalars['String']['input'];
};


export type QueryApprovalsArgs = {
  delegate?: InputMaybe<Scalars['String']['input']>;
  namehash?: InputMaybe<Scalars['String']['input']>;
};


export type QueryDomainArgs = {
  id: Scalars['String']['input'];
};


export type QueryDomainConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Domain_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<DomainFilter>;
};


export type QueryDomainsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Domain_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<DomainFilter>;
};


export type QueryEventConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Event_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<EventFilter>;
};


export type QueryEventsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Event_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<EventFilter>;
};


export type QueryMetadataArgs = {
  resolver: Scalars['String']['input'];
};


export type QueryRegistrationConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Registration_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<RegistrationFilter>;
};


export type QueryRegistrationsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Registration_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  where?: InputMaybe<RegistrationFilter>;
};


export type QueryRegistriesArgs = {
  owner: Scalars['String']['input'];
};


export type QueryResolverArgs = {
  id: Scalars['String']['input'];
};


export type QueryResolversArgs = {
  account: Scalars['String']['input'];
};


export type QueryRoleConnectionArgs = {
  account?: InputMaybe<Scalars['String']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  resource?: InputMaybe<Scalars['String']['input']>;
};


export type QueryRolesArgs = {
  account?: InputMaybe<Scalars['String']['input']>;
  resource?: InputMaybe<Scalars['String']['input']>;
};

export type Registration = {
  __typename?: 'Registration';
  chain: Scalars['String']['output'];
  domain: Domain;
  expiryDate: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  registrant: Account;
  registrationDate: Scalars['Int']['output'];
};

export type RegistrationConnection = {
  __typename?: 'RegistrationConnection';
  edges: Array<RegistrationEdge>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type RegistrationEdge = {
  __typename?: 'RegistrationEdge';
  cursor: Scalars['String']['output'];
  node: Registration;
};

export type RegistrationFilter = {
  chain?: InputMaybe<Scalars['String']['input']>;
  expiryDate_gt?: InputMaybe<Scalars['Int']['input']>;
  expiryDate_gte?: InputMaybe<Scalars['Int']['input']>;
  expiryDate_lt?: InputMaybe<Scalars['Int']['input']>;
  expiryDate_lte?: InputMaybe<Scalars['Int']['input']>;
  registrant?: InputMaybe<Scalars['String']['input']>;
  registrant_in?: InputMaybe<Array<Scalars['String']['input']>>;
};

export enum Registration_OrderBy {
  ExpiryDate = 'expiryDate',
  Id = 'id',
  Name = 'name',
  RegistrationDate = 'registrationDate'
}

export type RegistryInfo = {
  __typename?: 'RegistryInfo';
  address: Scalars['String']['output'];
  createdAt: Scalars['Int']['output'];
  createdBlock: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  namehash: Scalars['String']['output'];
  parentRegistry: Scalars['String']['output'];
};

export type Resolver = {
  __typename?: 'Resolver';
  abis?: Maybe<Array<Scalars['Int']['output']>>;
  addr?: Maybe<Scalars['String']['output']>;
  address: Scalars['String']['output'];
  addresses?: Maybe<Array<CoinAddress>>;
  aliases?: Maybe<Array<Alias>>;
  contentHash?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  interfaces?: Maybe<Array<InterfaceRecord>>;
  pubkey?: Maybe<Pubkey>;
  reverseName?: Maybe<Scalars['String']['output']>;
  text?: Maybe<Scalars['String']['output']>;
  texts?: Maybe<Array<Scalars['String']['output']>>;
  version?: Maybe<Scalars['Int']['output']>;
};


export type ResolverAddrArgs = {
  coinType?: InputMaybe<Scalars['Int']['input']>;
};


export type ResolverTextArgs = {
  key: Scalars['String']['input'];
};

export type ResolverApproval = {
  __typename?: 'ResolverApproval';
  approved: Scalars['Boolean']['output'];
  blockNumber: Scalars['Int']['output'];
  context?: Maybe<Scalars['String']['output']>;
  delegate: Scalars['String']['output'];
  id: Scalars['String']['output'];
  logIndex: Scalars['Int']['output'];
  namehash: Scalars['String']['output'];
  resolver: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
};

export type ResolverDetail = {
  __typename?: 'ResolverDetail';
  address: Scalars['String']['output'];
  aliasCount: Scalars['Int']['output'];
  aliases: Array<Alias>;
  events: Array<Event>;
  id: Scalars['String']['output'];
  nodeCount: Scalars['Int']['output'];
  nodes: Array<Domain>;
  roleHolderCount: Scalars['Int']['output'];
  roles: Array<EacRoleAssignment>;
};


export type ResolverDetailEventsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type ResolverDetailNodesArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type ResolverMetadata = {
  __typename?: 'ResolverMetadata';
  blockNumber: Scalars['Int']['output'];
  graphqlUrl: Scalars['String']['output'];
  id: Scalars['String']['output'];
  resolver: Scalars['String']['output'];
  timestamp: Scalars['Int']['output'];
  transactionHash: Scalars['String']['output'];
};

export type AccountFragment = { __typename?: 'Account', id: string };

export type DomainFragment = { __typename?: 'Domain', id: string, name?: string | null, normalizedName?: string | null, tokenId?: string | null, createdAt: number, expiryDate?: number | null, resolver?: (
    { __typename?: 'Resolver' }
    & ResolverFragment
  ) | null, owner: (
    { __typename?: 'Account' }
    & AccountFragment
  ) };

export type ResolverFragment = { __typename?: 'Resolver', id: string, address: string, texts?: Array<string> | null, contentHash?: string | null, avatar?: string | null, addresses?: Array<{ __typename?: 'CoinAddress', coinType: number, address: string }> | null };

export type DomainQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type DomainQuery = { __typename?: 'Query', domain?: (
    { __typename?: 'Domain' }
    & DomainFragment
  ) | null };

export type DomainsQueryVariables = Exact<{
  where: DomainFilter;
  first?: InputMaybe<Scalars['Int']['input']>;
  skip?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Domain_OrderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
}>;


export type DomainsQuery = { __typename?: 'Query', domains: Array<(
    { __typename?: 'Domain' }
    & DomainFragment
  )> };

export type MigratedNamesCountQueryVariables = Exact<{
  where: DomainFilter;
}>;


export type MigratedNamesCountQuery = { __typename?: 'Query', domainConnection: { __typename?: 'DomainConnection', totalCount?: number | null } };

export type OwnedNamesCountQueryVariables = Exact<{
  where: RegistrationFilter;
}>;


export type OwnedNamesCountQuery = { __typename?: 'Query', registrationConnection: { __typename?: 'RegistrationConnection', totalCount?: number | null } };

export const Resolver = gql`
    fragment Resolver on Resolver {
  id
  address
  texts
  avatar: text(key: "avatar")
  contentHash
  addresses {
    coinType
    address
  }
}
    `;
export const Account = gql`
    fragment Account on Account {
  id
}
    `;
export const Domain = gql`
    fragment Domain on Domain {
  id
  name
  normalizedName
  tokenId
  resolver {
    ...Resolver
  }
  owner {
    ...Account
  }
  createdAt
  expiryDate
}
    ${Resolver}
${Account}`;
export const DomainDocument = gql`
    query Domain($id: String!) {
  domain(id: $id) {
    ...Domain
  }
}
    ${Domain}`;
export const DomainsDocument = gql`
    query Domains($where: DomainFilter!, $first: Int, $skip: Int, $orderBy: Domain_orderBy, $orderDirection: OrderDirection) {
  domains(
    where: $where
    first: $first
    skip: $skip
    orderBy: $orderBy
    orderDirection: $orderDirection
  ) {
    ...Domain
  }
}
    ${Domain}`;
export const MigratedNamesCountDocument = gql`
    query MigratedNamesCount($where: DomainFilter!) {
  domainConnection(first: 0, where: $where) {
    totalCount
  }
}
    `;
export const OwnedNamesCountDocument = gql`
    query OwnedNamesCount($where: RegistrationFilter!) {
  registrationConnection(first: 0, where: $where) {
    totalCount
  }
}
    `;