import type { Address } from 'viem'
import { isAddress } from 'viem'
import type { SearchHistoryItem } from './useSearchHistory'

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

export type SuggestionItem = Suggestion | Separator

export type ParsedInput =
  | { type: 'name'; value: string }
  | { type: 'address'; value: Address }
  | { type: 'error' }

export const parseSearchInput = (input: string): ParsedInput => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return { type: 'error' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed }
  }

  const parts = trimmed.split('.').filter(Boolean)
  const value = parts.length === 1 ? `${trimmed}.eth` : trimmed

  return { type: 'name', value }
}

type IndexerDomain = {
  name?: string | null
  normalizedName?: string | null
}

type BuildSuggestionsParams = {
  parsedInput: ParsedInput
  primaryName?: string | null
  indexerDomains: IndexerDomain[]
  indexerFetched: boolean
  indexerLoading: boolean
  indexerError: boolean
  history: SearchHistoryItem[]
}

const MAX_SUGGESTIONS = 6

export const buildSuggestions = ({
  parsedInput,
  primaryName,
  indexerDomains,
  indexerFetched,
  indexerLoading,
  indexerError,
  history,
}: BuildSuggestionsParams): SuggestionItem[] => {
  const suggestions: SuggestionItem[] = []
  const addedNames = new Set<string>()

  if (parsedInput.type === 'address') {
    suggestions.push({
      type: 'address',
      value: parsedInput.value,
    })
    if (primaryName) {
      addedNames.add(primaryName.toLowerCase())
      suggestions.push(
        { type: 'name', value: primaryName },
        { type: 'separator' },
      )
    }
  }

  if (parsedInput.type === 'name') {
    const exactMatch = indexerDomains.find(
      (d) =>
        d.name?.toLowerCase() === parsedInput.value.toLowerCase() ||
        d.normalizedName?.toLowerCase() === parsedInput.value.toLowerCase(),
    )

    addedNames.add(parsedInput.value.toLowerCase())
    suggestions.push({
      type: 'name',
      value: parsedInput.value,
      isRegistered: indexerFetched ? !!exactMatch : undefined,
      isLoading: indexerLoading,
      isError: indexerError,
    })

    for (const domain of indexerDomains) {
      const name = domain.normalizedName ?? domain.name
      if (!name) continue
      const lowered = name.toLowerCase()
      if (addedNames.has(lowered)) continue
      addedNames.add(lowered)
      suggestions.push({
        type: 'name',
        value: name,
        isRegistered: true,
      })
    }
  }

  if (parsedInput.type === 'error') {
    for (const item of history) {
      if (item.kind === 'name') {
        suggestions.push({ type: 'name', value: item.value })
      } else if (item.kind === 'address') {
        suggestions.push({ type: 'address', value: item.value })
      }
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
