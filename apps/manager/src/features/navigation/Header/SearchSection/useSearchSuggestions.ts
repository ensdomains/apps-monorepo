import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useMemo } from 'react'
import { type Address, isAddress } from 'viem'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { searchHistoryStore } from './useSearchHistory'

export type NameSuggestion = {
  type: 'name'
  value: string
  isEth?: boolean
  isSubname?: boolean
  /** Whether the name is registered (from the indexer). undefined = still loading */
  isRegistered?: boolean
  /** Avatar record from the indexer resolver */
  avatarRecord?: string | null
}

type AddressSuggestion = {
  type: 'address'
  value: Address
}

type Suggestion = NameSuggestion | AddressSuggestion

type Separator = {
  type: 'separator'
}

export type SuggestionItem = Suggestion | Separator

const parseInput = (
  input: string,
): Suggestion | { type: 'error'; error: string } => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed)
    return {
      type: 'error',
      error: 'EMPTY_INPUT',
    }

  if (isAddress(trimmed, { strict: false })) {
    return {
      type: 'address',
      value: trimmed,
    }
  }

  const parts = trimmed.split('.').filter(Boolean)

  // If name doesn't have a tld, add .eth
  return parts.length === 1
    ? {
        type: 'name',
        value: `${trimmed}.eth`,
        isEth: true,
        isSubname: false,
      }
    : {
        type: 'name',
        value: trimmed,
        isEth: parts.at(-1) === 'eth',
        isSubname: parts.length > 2,
      }
}

export const useSearchSuggestions = (searchValue: string) => {
  const parsedInput = parseInput(searchValue)

  const primaryNameQuery = useQuery({
    ...profileReverseNameQuery(
      parsedInput.type === 'address' ? parsedInput.value : undefined,
    ),
    enabled: parsedInput.type === 'address',
  })

  // Use the GraphQL indexer to check if the searched name is registered.
  // This replaces per-item RPC calls with a single lightweight indexer query.
  const searchedName =
    parsedInput.type === 'name' ? parsedInput.value : undefined
  const indexerQuery = useQuery(
    getDomainsQuery(
      searchedName
        ? {
            where: { name: searchedName },
            first: 1,
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

  const suggestions = useMemo(() => {
    const newSuggestions: SuggestionItem[] = []

    if (parsedInput.type === 'address') {
      newSuggestions.push({
        type: 'address',
        value: parsedInput.value,
      })
      if (primaryNameQuery.data) {
        newSuggestions.push(
          {
            type: 'name',
            value: primaryNameQuery.data,
          },
          {
            type: 'separator',
          },
        )
      }
    }

    if (parsedInput.type === 'name') {
      const domain = indexerQuery.data?.domains.find(
        (d) =>
          d.name?.toLowerCase() === parsedInput.value.toLowerCase() ||
          d.normalizedName?.toLowerCase() === parsedInput.value.toLowerCase(),
      )

      newSuggestions.push(
        {
          type: 'name',
          value: parsedInput.value,
          isRegistered: indexerQuery.isFetched ? !!domain : undefined,
          avatarRecord: domain?.resolver?.avatar ?? null,
        },
        {
          type: 'separator',
        },
      )
    }

    for (const item of history) {
      if (
        parsedInput.type !== 'error' &&
        (item.value.toLowerCase() === parsedInput.value.toLowerCase() ||
          item.value.toLowerCase() === primaryNameQuery.data?.toLowerCase())
      ) {
        continue
      }

      if (item.kind === 'name') {
        newSuggestions.push({
          type: 'name',
          value: item.value,
        })
      } else if (item.kind === 'address') {
        newSuggestions.push({
          type: 'address',
          value: item.value,
        })
      }
    }

    return newSuggestions.slice(0, 6)
  }, [
    parsedInput,
    primaryNameQuery.data,
    indexerQuery.data,
    indexerQuery.isFetched,
    history,
  ])

  return suggestions
}
