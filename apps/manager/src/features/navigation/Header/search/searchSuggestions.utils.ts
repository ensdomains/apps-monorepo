import type { Address } from 'viem'
import { parseSearchQuery } from '@/features/search/parseSearchQuery'
import type { ParsedSearchQuery } from '@/features/search/search.types'
import type { SearchHistoryItem } from './useSearchHistory'

type NameSuggestion = {
  readonly type: 'name'
  readonly value: string
}

type AddressSuggestion = {
  readonly type: 'address'
  readonly value: Address
}

type Separator = {
  readonly type: 'separator'
}

export type SuggestionItem = NameSuggestion | AddressSuggestion | Separator

export type ParsedInput = ParsedSearchQuery

export const parseSearchInput = parseSearchQuery

type BuildSuggestionsParams = {
  readonly parsedInput: ParsedInput
  readonly primaryName?: string | null
  readonly history: readonly SearchHistoryItem[]
}

const MAX_SUGGESTIONS = 6

export const buildSuggestions = ({
  parsedInput,
  primaryName,
  history,
}: BuildSuggestionsParams): SuggestionItem[] => {
  const suggestions: SuggestionItem[] = []

  if (parsedInput.type === 'address') {
    suggestions.push({ type: 'address', value: parsedInput.value })
    if (primaryName) {
      suggestions.push(
        { type: 'name', value: primaryName },
        { type: 'separator' },
      )
    }
  }

  if (parsedInput.type === 'name') {
    suggestions.push({
      type: 'name',
      value: parsedInput.value,
    })
  }

  if (parsedInput.type === 'empty') {
    for (const item of history) {
      if (item.kind === 'name') {
        suggestions.push({
          type: 'name',
          value: item.value,
        })
      } else {
        suggestions.push({ type: 'address', value: item.value })
      }
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
