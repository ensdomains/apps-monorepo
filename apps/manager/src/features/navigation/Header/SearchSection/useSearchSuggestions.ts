import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useMemo } from 'react'
import { type Address, isAddress } from 'viem'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { searchHistoryStore } from './useSearchHistory'

type NameSuggestion = {
  type: 'name'
  value: string
  isRegistered?: boolean
  isLoading?: boolean
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

type SuggestionItem = Suggestion | Separator

const parseInput = (
  input: string,
):
  | { type: 'name'; value: string }
  | { type: 'address'; value: Address }
  | { type: 'error' } => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return { type: 'error' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed }
  }

  const parts = trimmed.split('.').filter(Boolean)
  const value = parts.length === 1 ? `${trimmed}.eth` : trimmed

  return { type: 'name', value }
}

export const useSearchSuggestions = (searchValue: string) => {
  const parsedInput = parseInput(searchValue)

  const primaryNameQuery = useQuery({
    ...profileReverseNameQuery(
      parsedInput.type === 'address' ? parsedInput.value : undefined,
    ),
    enabled: parsedInput.type === 'address',
  })

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

      const exactMatch = indexerDomains.find(
        (d) =>
          d.name?.toLowerCase() === parsedInput.value.toLowerCase() ||
          d.normalizedName?.toLowerCase() === parsedInput.value.toLowerCase(),
      )

      addedNames.add(parsedInput.value.toLowerCase())
      newSuggestions.push({
        type: 'name',
        value: parsedInput.value,
        isRegistered: indexerQuery.isFetched ? !!exactMatch : undefined,
        isLoading: indexerQuery.isLoading,
        isError: indexerQuery.isError,
      })

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
    }

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
