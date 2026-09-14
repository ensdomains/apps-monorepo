import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useMemo } from 'react'
import { dnsSecEnabledQuery } from '@/features/profile/service/dnsSecEnabled'
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

  const searchTld =
    parsedInput.type === 'name' && parsedInput.value.includes('.')
      ? parsedInput.value.split('.').at(-1)
      : undefined
  const tldQuery = useQuery({
    ...dnsSecEnabledQuery(searchTld ?? ''),
    enabled: Boolean(searchTld && searchTld !== 'eth'),
  })

  const tldStatus =
    !searchTld || searchTld === 'eth'
      ? 'supported'
      : tldQuery.data === true
        ? 'supported'
        : tldQuery.data === false
          ? 'unsupported'
          : 'unknown'

  const history = useSelector(
    searchHistoryStore,
    (state) => state.context.history,
  )

  return useMemo(
    () =>
      buildSuggestions({
        parsedInput,
        primaryName: primaryNameQuery.data,
        history,
        tldStatus,
      }),
    [parsedInput, primaryNameQuery.data, history, tldStatus],
  )
}
