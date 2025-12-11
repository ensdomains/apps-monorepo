import * as Apollo from '@apollo/client'
import type { DocumentNode } from 'graphql'
export type Maybe<T> = T | null
export type InputMaybe<T> = Maybe<T>
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>
}
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>
}
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never }
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never
    }
const defaultOptions = {} as const
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
}

export type Account = {
  __typename?: 'Account'
  domains: Array<Domain>
  id: Scalars['String']['output']
  registrations: Array<Registration>
}

export type Domain = {
  __typename?: 'Domain'
  canonicalId?: Maybe<Scalars['String']['output']>
  createdAt: Scalars['Int']['output']
  events: Array<Event>
  expiryDate?: Maybe<Scalars['Int']['output']>
  id: Scalars['String']['output']
  isMigrated: Scalars['Boolean']['output']
  isNormalized: Scalars['Boolean']['output']
  labelName?: Maybe<Scalars['String']['output']>
  labelhash?: Maybe<Scalars['String']['output']>
  name?: Maybe<Scalars['String']['output']>
  normalizedName?: Maybe<Scalars['String']['output']>
  owner: Account
  parent?: Maybe<Domain>
  registrant?: Maybe<Account>
  resolvedAddress?: Maybe<Account>
  resolver?: Maybe<Resolver>
  subdomains: Array<Domain>
  tokenId?: Maybe<Scalars['String']['output']>
  tokenVersion?: Maybe<Scalars['Int']['output']>
  ttl?: Maybe<Scalars['Int']['output']>
}

export type DomainEventsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>
}

export type DomainConnection = {
  __typename?: 'DomainConnection'
  edges: Array<DomainEdge>
  pageInfo: PageInfo
  totalCount?: Maybe<Scalars['Int']['output']>
}

export type DomainEdge = {
  __typename?: 'DomainEdge'
  cursor: Scalars['String']['output']
  node: Domain
}

export type DomainFilter = {
  hasSubdomains?: InputMaybe<Scalars['Boolean']['input']>
  name?: InputMaybe<Scalars['String']['input']>
  name_contains?: InputMaybe<Scalars['String']['input']>
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>
  name_ends_with?: InputMaybe<Scalars['String']['input']>
  name_starts_with?: InputMaybe<Scalars['String']['input']>
  owner?: InputMaybe<Scalars['String']['input']>
  owner_in?: InputMaybe<Array<Scalars['String']['input']>>
  resolvedAddress?: InputMaybe<Scalars['String']['input']>
  subdomainCount_gt?: InputMaybe<Scalars['Int']['input']>
  subdomainCount_lt?: InputMaybe<Scalars['Int']['input']>
}

export enum Domain_OrderBy {
  CreatedAt = 'createdAt',
  ExpiryDate = 'expiryDate',
  Id = 'id',
  Name = 'name',
  RegistrationDate = 'registrationDate',
}

export type EacRoleAssignment = {
  __typename?: 'EACRoleAssignment'
  account: Scalars['String']['output']
  blockNumber: Scalars['Int']['output']
  id: Scalars['String']['output']
  resource: Scalars['String']['output']
  roleBitmap: Scalars['String']['output']
  timestamp: Scalars['Int']['output']
  transactionHash: Scalars['String']['output']
}

export type Event = {
  __typename?: 'Event'
  blockNumber: Scalars['Int']['output']
  contractAddress: Scalars['String']['output']
  domain?: Maybe<Domain>
  id: Scalars['String']['output']
  name?: Maybe<Scalars['String']['output']>
  namehash?: Maybe<Scalars['String']['output']>
  timestamp: Scalars['Int']['output']
  transactionHash: Scalars['String']['output']
  type: Scalars['String']['output']
}

export type EventConnection = {
  __typename?: 'EventConnection'
  edges: Array<EventEdge>
  pageInfo: PageInfo
  totalCount?: Maybe<Scalars['Int']['output']>
}

export type EventEdge = {
  __typename?: 'EventEdge'
  cursor: Scalars['String']['output']
  node: Event
}

export type EventFilter = {
  blockNumber_gt?: InputMaybe<Scalars['Int']['input']>
  blockNumber_lt?: InputMaybe<Scalars['Int']['input']>
  contractAddress: Scalars['String']['input']
  domain?: InputMaybe<Scalars['String']['input']>
  namehash?: InputMaybe<Scalars['String']['input']>
  timestamp_gt?: InputMaybe<Scalars['Int']['input']>
  timestamp_lt?: InputMaybe<Scalars['Int']['input']>
  type?: InputMaybe<Scalars['String']['input']>
  type_in?: InputMaybe<Array<Scalars['String']['input']>>
}

export enum OrderDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export type PageInfo = {
  __typename?: 'PageInfo'
  endCursor?: Maybe<Scalars['String']['output']>
  hasNextPage: Scalars['Boolean']['output']
  hasPreviousPage: Scalars['Boolean']['output']
  startCursor?: Maybe<Scalars['String']['output']>
}

export type Query = {
  __typename?: 'Query'
  account?: Maybe<Account>
  approvals: Array<ResolverApproval>
  domain?: Maybe<Domain>
  domainConnection: DomainConnection
  domains: Array<Domain>
  eventConnection: EventConnection
  events: Array<Event>
  metadata?: Maybe<ResolverMetadata>
  registrationConnection: RegistrationConnection
  registrations: Array<Registration>
  registries: Array<RegistryInfo>
  resolvers: Array<ResolverInfo>
  roles: Array<EacRoleAssignment>
}

export type QueryAccountArgs = {
  id: Scalars['String']['input']
}

export type QueryApprovalsArgs = {
  delegate?: InputMaybe<Scalars['String']['input']>
  namehash?: InputMaybe<Scalars['String']['input']>
}

export type QueryDomainArgs = {
  id: Scalars['String']['input']
}

export type QueryDomainConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<Domain_OrderBy>
  orderDirection?: InputMaybe<OrderDirection>
  where?: InputMaybe<DomainFilter>
}

export type QueryDomainsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<Domain_OrderBy>
  orderDirection?: InputMaybe<OrderDirection>
  skip?: InputMaybe<Scalars['Int']['input']>
  where?: InputMaybe<DomainFilter>
}

export type QueryEventConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  where?: InputMaybe<EventFilter>
}

export type QueryEventsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>
  skip?: InputMaybe<Scalars['Int']['input']>
  where?: InputMaybe<EventFilter>
}

export type QueryMetadataArgs = {
  resolver: Scalars['String']['input']
}

export type QueryRegistrationConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<Registration_OrderBy>
  orderDirection?: InputMaybe<OrderDirection>
  where?: InputMaybe<RegistrationFilter>
}

export type QueryRegistrationsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<Registration_OrderBy>
  orderDirection?: InputMaybe<OrderDirection>
  skip?: InputMaybe<Scalars['Int']['input']>
  where?: InputMaybe<RegistrationFilter>
}

export type QueryRegistriesArgs = {
  owner: Scalars['String']['input']
}

export type QueryResolversArgs = {
  account: Scalars['String']['input']
}

export type QueryRolesArgs = {
  account?: InputMaybe<Scalars['String']['input']>
  resource?: InputMaybe<Scalars['String']['input']>
}

export type Registration = {
  __typename?: 'Registration'
  domain: Domain
  expiryDate: Scalars['Int']['output']
  id: Scalars['String']['output']
  name: Scalars['String']['output']
  registrant: Account
  registrationDate: Scalars['Int']['output']
}

export type RegistrationConnection = {
  __typename?: 'RegistrationConnection'
  edges: Array<RegistrationEdge>
  pageInfo: PageInfo
  totalCount?: Maybe<Scalars['Int']['output']>
}

export type RegistrationEdge = {
  __typename?: 'RegistrationEdge'
  cursor: Scalars['String']['output']
  node: Registration
}

export type RegistrationFilter = {
  expiryDate_gt?: InputMaybe<Scalars['Int']['input']>
  expiryDate_gte?: InputMaybe<Scalars['Int']['input']>
  expiryDate_lt?: InputMaybe<Scalars['Int']['input']>
  expiryDate_lte?: InputMaybe<Scalars['Int']['input']>
  registrant?: InputMaybe<Scalars['String']['input']>
  registrant_in?: InputMaybe<Array<Scalars['String']['input']>>
}

export enum Registration_OrderBy {
  ExpiryDate = 'expiryDate',
  Id = 'id',
  Name = 'name',
  RegistrationDate = 'registrationDate',
}

export type RegistryInfo = {
  __typename?: 'RegistryInfo'
  address: Scalars['String']['output']
  createdAt: Scalars['Int']['output']
  createdBlock: Scalars['Int']['output']
  name: Scalars['String']['output']
  namehash: Scalars['String']['output']
  parentRegistry: Scalars['String']['output']
}

export type Resolver = {
  __typename?: 'Resolver'
  addr?: Maybe<Scalars['String']['output']>
  address: Scalars['String']['output']
  contentHash?: Maybe<Scalars['String']['output']>
  id: Scalars['String']['output']
  text?: Maybe<Scalars['String']['output']>
  texts?: Maybe<Array<Scalars['String']['output']>>
}

export type ResolverTextArgs = {
  key: Scalars['String']['input']
}

export type ResolverApproval = {
  __typename?: 'ResolverApproval'
  approved: Scalars['Boolean']['output']
  blockNumber: Scalars['Int']['output']
  context?: Maybe<Scalars['String']['output']>
  delegate: Scalars['String']['output']
  id: Scalars['String']['output']
  logIndex: Scalars['Int']['output']
  namehash: Scalars['String']['output']
  resolver: Scalars['String']['output']
  timestamp: Scalars['Int']['output']
  transactionHash: Scalars['String']['output']
}

export type ResolverInfo = {
  __typename?: 'ResolverInfo'
  address: Scalars['String']['output']
  name: Scalars['String']['output']
  namehash: Scalars['String']['output']
  setAt: Scalars['Int']['output']
  setBlock: Scalars['Int']['output']
}

export type ResolverMetadata = {
  __typename?: 'ResolverMetadata'
  blockNumber: Scalars['Int']['output']
  graphqlUrl: Scalars['String']['output']
  id: Scalars['String']['output']
  resolver: Scalars['String']['output']
  timestamp: Scalars['Int']['output']
  transactionHash: Scalars['String']['output']
}

export type AccountFragment = { __typename?: 'Account'; id: string }

export type DomainFragment = {
  __typename?: 'Domain'
  id: string
  name?: string | null
  normalizedName?: string | null
  tokenId?: string | null
  createdAt: number
  expiryDate?: number | null
  resolver?: ({ __typename?: 'Resolver' } & ResolverFragment) | null
  owner: { __typename?: 'Account' } & AccountFragment
}

export type ResolverFragment = {
  __typename?: 'Resolver'
  id: string
  address: string
  avatar?: string | null
  description?: string | null
  header?: string | null
  url?: string | null
  email?: string | null
  location?: string | null
  phone?: string | null
  mail?: string | null
  timezone?: string | null
  twitter?: string | null
  telegram?: string | null
  farcaster?: string | null
  instagram?: string | null
  discord?: string | null
  github?: string | null
  linkedin?: string | null
  youtube?: string | null
  reddit?: string | null
  tiktok?: string | null
  twitch?: string | null
  mastodon?: string | null
}

export type DomainsQueryVariables = Exact<{
  where: DomainFilter
  first?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<Domain_OrderBy>
  orderDirection?: InputMaybe<OrderDirection>
}>

export type DomainsQuery = {
  __typename?: 'Query'
  domains: Array<{ __typename?: 'Domain' } & DomainFragment>
}

export const ResolverFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Resolver' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Resolver' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'address' } },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'avatar' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'avatar', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'description' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'description',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'header' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'header', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'url' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'url', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'email' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'email', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'location' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'location', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'phone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'phone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mail' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'mail', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'timezone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'timezone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitter' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitter',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'telegram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'org.telegram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'farcaster' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'xyz.farcaster',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'instagram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.instagram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'discord' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.discord',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'github' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.github',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'linkedin' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.linkedin',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'youtube' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.youtube',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'reddit' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.reddit',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'tiktok' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.tiktok',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitch' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitch',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mastodon' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.mastodon',
                  block: false,
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode
export const AccountFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Account' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Account' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
      },
    },
  ],
} as unknown as DocumentNode
export const DomainFragmentDoc = {
  kind: 'Document',
  definitions: [
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Domain' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Domain' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'normalizedName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'tokenId' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resolver' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Resolver' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'owner' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Account' },
                },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'expiryDate' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Account' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Account' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Resolver' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Resolver' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'address' } },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'avatar' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'avatar', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'description' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'description',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'header' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'header', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'url' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'url', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'email' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'email', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'location' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'location', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'phone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'phone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mail' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'mail', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'timezone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'timezone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitter' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitter',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'telegram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'org.telegram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'farcaster' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'xyz.farcaster',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'instagram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.instagram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'discord' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.discord',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'github' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.github',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'linkedin' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.linkedin',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'youtube' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.youtube',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'reddit' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.reddit',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'tiktok' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.tiktok',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitch' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitch',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mastodon' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.mastodon',
                  block: false,
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode
export const DomainsDocument = {
  kind: 'Document',
  definitions: [
    {
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'Domains' },
      variableDefinitions: [
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'where' },
          },
          type: {
            kind: 'NonNullType',
            type: {
              kind: 'NamedType',
              name: { kind: 'Name', value: 'DomainFilter' },
            },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'first' },
          },
          type: { kind: 'NamedType', name: { kind: 'Name', value: 'Int' } },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'orderBy' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'Domain_orderBy' },
          },
        },
        {
          kind: 'VariableDefinition',
          variable: {
            kind: 'Variable',
            name: { kind: 'Name', value: 'orderDirection' },
          },
          type: {
            kind: 'NamedType',
            name: { kind: 'Name', value: 'OrderDirection' },
          },
        },
      ],
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'domains' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'where' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'where' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'first' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'first' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderBy' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'orderBy' },
                },
              },
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'orderDirection' },
                value: {
                  kind: 'Variable',
                  name: { kind: 'Name', value: 'orderDirection' },
                },
              },
            ],
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Domain' },
                },
              ],
            },
          },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Account' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Account' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: 'id' } }],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Domain' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Domain' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'name' } },
          { kind: 'Field', name: { kind: 'Name', value: 'normalizedName' } },
          { kind: 'Field', name: { kind: 'Name', value: 'tokenId' } },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'resolver' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Resolver' },
                },
              ],
            },
          },
          {
            kind: 'Field',
            name: { kind: 'Name', value: 'owner' },
            selectionSet: {
              kind: 'SelectionSet',
              selections: [
                {
                  kind: 'FragmentSpread',
                  name: { kind: 'Name', value: 'Account' },
                },
              ],
            },
          },
          { kind: 'Field', name: { kind: 'Name', value: 'createdAt' } },
          { kind: 'Field', name: { kind: 'Name', value: 'expiryDate' } },
        ],
      },
    },
    {
      kind: 'FragmentDefinition',
      name: { kind: 'Name', value: 'Resolver' },
      typeCondition: {
        kind: 'NamedType',
        name: { kind: 'Name', value: 'Resolver' },
      },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [
          { kind: 'Field', name: { kind: 'Name', value: 'id' } },
          { kind: 'Field', name: { kind: 'Name', value: 'address' } },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'avatar' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'avatar', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'description' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'description',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'header' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'header', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'url' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'url', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'email' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'email', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'location' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'location', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'phone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'phone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mail' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'mail', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'timezone' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: { kind: 'StringValue', value: 'timezone', block: false },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitter' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitter',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'telegram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'org.telegram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'farcaster' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'xyz.farcaster',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'instagram' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.instagram',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'discord' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.discord',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'github' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.github',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'linkedin' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.linkedin',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'youtube' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.youtube',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'reddit' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.reddit',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'tiktok' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.tiktok',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'twitch' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.twitch',
                  block: false,
                },
              },
            ],
          },
          {
            kind: 'Field',
            alias: { kind: 'Name', value: 'mastodon' },
            name: { kind: 'Name', value: 'text' },
            arguments: [
              {
                kind: 'Argument',
                name: { kind: 'Name', value: 'key' },
                value: {
                  kind: 'StringValue',
                  value: 'com.mastodon',
                  block: false,
                },
              },
            ],
          },
        ],
      },
    },
  ],
} as unknown as DocumentNode
export function useDomainsQuery(
  baseOptions: Apollo.QueryHookOptions<DomainsQuery, DomainsQueryVariables> &
    ({ variables: DomainsQueryVariables; skip?: boolean } | { skip: boolean }),
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useQuery<DomainsQuery, DomainsQueryVariables>(
    DomainsDocument,
    options,
  )
}
export function useDomainsLazyQuery(
  baseOptions?: Apollo.LazyQueryHookOptions<
    DomainsQuery,
    DomainsQueryVariables
  >,
) {
  const options = { ...defaultOptions, ...baseOptions }
  return Apollo.useLazyQuery<DomainsQuery, DomainsQueryVariables>(
    DomainsDocument,
    options,
  )
}
export function useDomainsSuspenseQuery(
  baseOptions?:
    | Apollo.SkipToken
    | Apollo.SuspenseQueryHookOptions<DomainsQuery, DomainsQueryVariables>,
) {
  const options =
    baseOptions === Apollo.skipToken
      ? baseOptions
      : { ...defaultOptions, ...baseOptions }
  return Apollo.useSuspenseQuery<DomainsQuery, DomainsQueryVariables>(
    DomainsDocument,
    options,
  )
}
export type DomainsQueryHookResult = ReturnType<typeof useDomainsQuery>
export type DomainsLazyQueryHookResult = ReturnType<typeof useDomainsLazyQuery>
export type DomainsSuspenseQueryHookResult = ReturnType<
  typeof useDomainsSuspenseQuery
>
