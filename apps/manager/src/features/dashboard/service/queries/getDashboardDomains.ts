import {
  type DomainFragment,
  DomainsDocument,
  type DomainsQuery,
  type DomainsQueryVariables,
} from '@ens-apps/indexer'
import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'

export class GetDomainsError extends TaggedError('GetDomainsError')<{
  cause: unknown
}> {}

// Keep the dashboard and address lists independent of full resolver records.
// The nullable resolver is supplied locally so existing list consumers can
// keep using DomainFragment without carrying resolver texts and addresses.
export const DOMAIN_LIST_FIELDS = /* GraphQL */ `
  id
  name
  normalizedName
  tokenId
  owner { id }
  createdAt
  registrationDate
  expiryDate
`

export type ListDomain = Omit<DomainFragment, 'resolver'>

export const toListDomain = (domain: ListDomain): DomainFragment => ({
  ...domain,
  resolver: null,
})

export type ListDomainsQuery = {
  readonly domains: readonly ListDomain[]
}

export const ListDomainsDocument = /* GraphQL */ `
  query ListDomains(
    $where: DomainFilter!
    $first: Int
    $skip: Int
    $orderBy: Domain_orderBy
    $orderDirection: OrderDirection
  ) {
    domains(
      where: $where
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      ${DOMAIN_LIST_FIELDS}
    }
  }
`

export const getListDomains = ResultFn(async function* (
  variables: DomainsQueryVariables,
  signal?: AbortSignal,
) {
  const data = yield* await ResultAsync.fromPromise(
    graphqlRequest<ListDomainsQuery, DomainsQueryVariables>(
      indexerClient,
      ListDomainsDocument,
      variables,
      signal,
    ),
    (error) => new GetDomainsError({ cause: error }),
  )

  return ok({ domains: data.domains.map(toListDomain) })
})

export const getDomains = ResultFn(async function* (
  variables: DomainsQueryVariables,
) {
  const data = yield* await ResultAsync.fromPromise(
    graphqlRequest<DomainsQuery, DomainsQueryVariables>(
      indexerClient,
      DomainsDocument,
      variables,
    ),
    (error) => new GetDomainsError({ cause: error }),
  )

  return ok(data)
})

export const getDomainsQuery = (variables: DomainsQueryVariables | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'domains', variables ?? {}),
    queryFn: variables ? () => getListDomains(variables) : skipToken,
    staleTime: 60_000,
  })
