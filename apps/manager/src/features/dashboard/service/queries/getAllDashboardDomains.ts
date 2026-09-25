import type {
  Domain_OrderBy,
  DomainFilter,
  DomainFragment,
  DomainsQueryVariables,
  OrderDirection,
} from '@ens-apps/indexer'
import indexerClient, { graphqlRequest } from '@ens-apps/indexer/urql'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { infiniteQueryOptions } from '@tanstack/react-query'
import {
  GetDomainsError,
  ListDomainsDocument,
  type ListDomainsQuery,
  toListDomain,
} from './getDashboardDomains'

const PAGE_SIZE = 200

type DashboardDomainsQueryVariables = {
  readonly where: DomainFilter
  readonly orderBy: Domain_OrderBy
  readonly orderDirection: OrderDirection
}

type DashboardDomainsPage = {
  readonly domains: DomainFragment[]
  readonly nextSkip: number | undefined
}

const fetchDomainsPage = async ({
  where,
  orderBy,
  orderDirection,
  skip,
  signal,
}: DashboardDomainsQueryVariables & {
  readonly skip: number
  readonly signal?: AbortSignal
}): Promise<DashboardDomainsPage> => {
  try {
    const data = await graphqlRequest<ListDomainsQuery, DomainsQueryVariables>(
      indexerClient,
      ListDomainsDocument,
      { where, first: PAGE_SIZE, skip, orderBy, orderDirection },
      signal,
    )

    const domains = data.domains.map(toListDomain)
    return {
      domains,
      nextSkip: domains.length < PAGE_SIZE ? undefined : skip + PAGE_SIZE,
    }
  } catch (error) {
    throw new GetDomainsError({ cause: error })
  }
}

export const getAllDomainsInfiniteQuery = (
  variables: DashboardDomainsQueryVariables | undefined,
) =>
  infiniteQueryOptions({
    queryKey: qk('dashboard', 'all_domains', variables ?? {}),
    enabled: variables !== undefined,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: ({ pageParam, signal }) => {
      if (!variables)
        return Promise.resolve({ domains: [], nextSkip: undefined })
      return fetchDomainsPage({
        ...variables,
        skip: pageParam as number,
        signal,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextSkip,
    select: (data) => data.pages.flatMap((page) => page.domains),
  })
