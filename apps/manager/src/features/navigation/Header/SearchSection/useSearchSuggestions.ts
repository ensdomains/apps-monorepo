import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useMemo } from 'react'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { buildSuggestions, parseSearchInput } from './searchSuggestions.utils'
import { searchHistoryStore } from './useSearchHistory'

export const useSearchSuggestions = (searchValue: string) => {
  const parsedInput = parseSearchInput(searchValue)

  const primaryNameQuery = useQuery({
    ...profileReverseNameQuery(
      parsedInput.type === 'address' ? parsedInput.value : undefined,
    ),
    enabled: parsedInput.type === 'address',
  })

  const rawInput = searchValue.trim().toLowerCase()
  const searchLabel = rawInput.endsWith('.eth')
    ? rawInput.slice(0, -4)
    : rawInput
  const indexerQuery = useQuery(
    getDomainsQuery(
      searchLabel && [...searchLabel].length >= 3 && parsedInput.type === 'name'
        ? {
            where: { name_contains_nocase: searchLabel },
            first: 5,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
  )

  const history = useSelector(
    searchHistoryStore,
    (state) => state.context.history,
  )

  const suggestions = useMemo(
    () =>
      buildSuggestions({
        parsedInput,
        primaryName: primaryNameQuery.data,
        indexerDomains: indexerQuery.data?.domains ?? [],
        history,
      }),
    [parsedInput, primaryNameQuery.data, indexerQuery.data, history],
  )

  return suggestions
}
