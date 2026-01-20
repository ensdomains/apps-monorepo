import { type DomainFragment, OrderDirection } from '@ens-apps/indexer'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions, skipToken } from '@tanstack/react-query'

/**
 * Creates a mock domain object for a given label.
 * This is temporary until the backend supports fetching favorite domains.
 */
const createMockDomain = (label: string): DomainFragment => {
  const fullName = label.endsWith('.eth') ? label : `${label}.eth`
  const now = Math.floor(Date.now() / 1000)
  const oneYear = 365 * 24 * 60 * 60

  return {
    __typename: 'Domain',
    id: `0x${Math.random().toString(16).slice(2, 10)}`,
    name: fullName,
    normalizedName: fullName.toLowerCase(),
    createdAt: now - oneYear,
    expiryDate: now + oneYear,
    owner: {
      __typename: 'Account',
      id: '0x1234567890123456789012345678901234567890',
    },
    resolver: null,
  }
}

/**
 * Fetches domain data for a list of favorite labels.
 * Currently returns mock data - will be replaced with actual indexer query.
 */
export const getFavoriteDomains = (
  labels: readonly string[],
): DomainFragment[] => {
  return labels.map((label) => createMockDomain(label))
}

export type FavoriteDomainsQueryVariables = {
  readonly labels: readonly string[]
  readonly page: number
  readonly pageSize: number
  readonly sortField: 'name' | 'addedAt'
  readonly sortDirection: OrderDirection
  readonly searchQuery?: string
}

export const getFavoriteDomainsQuery = (
  variables: FavoriteDomainsQueryVariables | undefined,
) =>
  queryOptions({
    queryKey: qk('dashboard', 'favoriteDomains', variables ?? {}),
    queryFn: variables
      ? () => {
          const {
            labels,
            page,
            pageSize,
            sortField,
            sortDirection,
            searchQuery,
          } = variables

          // Filter by search if provided
          const filteredLabels = searchQuery
            ? labels.filter((label) =>
                label.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : labels

          // Sort labels
          const sortedLabels = [...filteredLabels].sort((a, b) => {
            if (sortField === 'name') {
              const comparison = a.localeCompare(b)
              return sortDirection === OrderDirection.Asc
                ? comparison
                : -comparison
            }
            // For addedAt, we'd need the timestamps - for now just use name
            const comparison = a.localeCompare(b)
            return sortDirection === OrderDirection.Asc
              ? comparison
              : -comparison
          })

          // Paginate
          const startIndex = (page - 1) * pageSize
          const endIndex = startIndex + pageSize
          const paginatedLabels = sortedLabels.slice(startIndex, endIndex)

          // Generate domain data
          const domains = getFavoriteDomains(paginatedLabels)

          return {
            domains,
            totalCount: filteredLabels.length,
            totalPages: Math.ceil(filteredLabels.length / pageSize),
            hasNextPage: page < Math.ceil(filteredLabels.length / pageSize),
            hasPrevPage: page > 1,
            startIndex: startIndex + 1,
            endIndex: Math.min(endIndex, filteredLabels.length),
          }
        }
      : skipToken,
  })
