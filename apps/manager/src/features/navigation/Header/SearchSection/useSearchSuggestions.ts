import { useQuery } from '@tanstack/react-query'
import { useSelector } from '@xstate/store-react'
import { useMemo } from 'react'
import { type Address, isAddress } from 'viem'
import { profileReverseNameQuery } from '@/features/profile/service/profileReverseName'
import { searchHistoryStore } from './useSearchHistory'

type Suggestion =
  | {
      type: 'name'
      value: string
      isEth?: boolean
      isSubname?: boolean
    }
  | {
      type: 'address'
      value: Address
    }

type Separator = {
  type: 'separator'
}

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

  const history = useSelector(
    searchHistoryStore,
    (state) => state.context.history,
  )

  const suggestions = useMemo(() => {
    const newSuggestions: (Suggestion | Separator)[] = []

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
      newSuggestions.push(
        {
          type: 'name',
          value: parsedInput.value,
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
  }, [parsedInput, primaryNameQuery.data, history])

  return suggestions
}
