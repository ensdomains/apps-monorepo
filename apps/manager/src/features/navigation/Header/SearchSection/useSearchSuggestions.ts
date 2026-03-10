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
  /** Whether the indexer query is currently loading */
  isLoading?: boolean
  /** Whether the indexer query errored */
  isError?: boolean
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

  // Use name_contains_nocase to find matching registered names from the indexer.
  // Use the raw trimmed input (without .eth suffix) so typing "big" finds "bigint.eth", etc.
  const rawInput = searchValue.trim().toLowerCase()
  const indexerQuery = useQuery(
    getDomainsQuery(
      rawInput && parsedInput.type === 'name'
        ? {
            where: { name_contains_nocase: rawInput },
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

  const suggestions = useMemo(() => {
    const newSuggestions: SuggestionItem[] = []
    const addedNames = new Set<string>()

    if (parsedInput.type === 'address') {
      newSuggestions.push({
        type: 'address',
        value: parsedInput.value,
      })
      if (primaryNameQuery.data) {
        addedNames.add(primaryNameQuery.data.toLowerCase())
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
      const indexerDomains = indexerQuery.data?.domains ?? []

      // Check if the typed name exactly matches an indexer result
      const exactMatch = indexerDomains.find(
        (d) =>
          d.name?.toLowerCase() === parsedInput.value.toLowerCase() ||
          d.normalizedName?.toLowerCase() === parsedInput.value.toLowerCase(),
      )

      // Primary suggestion: the typed name (with .eth appended)
      addedNames.add(parsedInput.value.toLowerCase())
      newSuggestions.push({
        type: 'name',
        value: parsedInput.value,
        isRegistered: indexerQuery.isFetched ? !!exactMatch : undefined,
        isLoading: indexerQuery.isLoading,
        isError: indexerQuery.isError,
      })

      // Add matching names from the indexer (all registered)
      for (const domain of indexerDomains) {
        const name = domain.normalizedName ?? domain.name
        if (!name) continue
        const lowered = name.toLowerCase()
        if (addedNames.has(lowered)) continue
        addedNames.add(lowered)
        newSuggestions.push({
          type: 'name',
          value: name,
          isRegistered: true,
        })
      }

      newSuggestions.push({
        type: 'separator',
      })
    }

    // Only show history when there's no active search input
    if (parsedInput.type === 'error') {
      for (const item of history) {
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
    }

    return newSuggestions.slice(0, 6)
  }, [
    parsedInput,
    primaryNameQuery.data,
    indexerQuery.data,
    indexerQuery.isFetched,
    indexerQuery.isLoading,
    indexerQuery.isError,
    history,
  ])

  return suggestions
}
