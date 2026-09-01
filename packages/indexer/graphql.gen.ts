/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type * as Types from './schema.gen';

import gql from 'graphql-tag';
export * from './schema.gen'
export type AccountFragment = { id: string };

export type DomainFragment = { id: string, name: string | null, normalizedName: string | null, tokenId: string | null, createdAt: number, expiryDate: number | null, resolver: ResolverFragment | null, owner: AccountFragment };

export type ResolverFragment = { id: string, address: string, texts: Array<string> | null, contentHash: string | null, addresses: Array<{ coinType: number, address: string }> | null };

export type DomainQueryVariables = Exact<{
  id: string;
}>;


export type DomainQuery = { domain: DomainFragment | null };

export type DomainsQueryVariables = Exact<{
  where: Types.DomainFilter;
  first?: number | null | undefined;
  skip?: number | null | undefined;
  orderBy?: Types.Domain_OrderBy | null | undefined;
  orderDirection?: Types.OrderDirection | null | undefined;
}>;


export type DomainsQuery = { domains: Array<DomainFragment> };

export type MigratedNamesCountQueryVariables = Exact<{
  where: Types.DomainFilter;
}>;


export type MigratedNamesCountQuery = { domainConnection: { totalCount: number | null } };

export type OwnedNamesCountQueryVariables = Exact<{
  where: Types.RegistrationFilter;
}>;


export type OwnedNamesCountQuery = { registrationConnection: { totalCount: number | null } };

export const ResolverFragmentDoc = gql`
    fragment Resolver on Resolver {
  id
  address
  texts
  contentHash
  addresses {
    coinType
    address
  }
}
    `;
export const AccountFragmentDoc = gql`
    fragment Account on Account {
  id
}
    `;
export const DomainFragmentDoc = gql`
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
    `;
export const DomainDocument = gql`
    query Domain($id: String!) {
  domain(id: $id) {
    ...Domain
  }
}
    ${DomainFragmentDoc}
${ResolverFragmentDoc}
${AccountFragmentDoc}`;
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
    ${DomainFragmentDoc}
${ResolverFragmentDoc}
${AccountFragmentDoc}`;
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