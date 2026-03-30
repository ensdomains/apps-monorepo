import type { Address } from 'viem'
import { isAddress } from 'viem'
import { validateENSName } from '@/features/register/utils'
import type { SearchHistoryItem } from './useSearchHistory'

/**
 * Validates a name for search context. Unlike `validateENSName` (which is for
 * registration), this allows subnames (e.g. "sub.name.eth") since they can be
 * viewed even though they can't be registered through the app.
 */
const isSearchNameSupported = (name: string): boolean => {
  const trimmed = name.trim()
  if (!trimmed) return false

  const hasEthSuffix = trimmed.toLowerCase().endsWith('.eth')
  if (!hasEthSuffix) return validateENSName(name) === null

  // For .eth names, validate each label individually
  const withoutEth = trimmed.slice(0, -4)
  const labels = withoutEth.split('.')
  return labels.every((label) => {
    const asEth = `${label}.eth`
    return validateENSName(asEth) === null
  })
}

type NameSuggestion = {
  readonly type: 'name'
  readonly value: string
  readonly isRegistered?: boolean
  readonly isLoading?: boolean
  readonly isError?: boolean
  readonly isSupported?: boolean
}

type AddressSuggestion = {
  readonly type: 'address'
  readonly value: Address
}

type Suggestion = NameSuggestion | AddressSuggestion

type Separator = {
  readonly type: 'separator'
}

export type SuggestionItem = Suggestion | Separator

export type ParsedInput =
  | { readonly type: 'name'; readonly value: string }
  | { readonly type: 'address'; readonly value: Address }
  | { readonly type: 'error' }

export const parseSearchInput = (input: string): ParsedInput => {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return { type: 'error' }

  if (isAddress(trimmed, { strict: false })) {
    return { type: 'address', value: trimmed }
  }

  const value = trimmed.endsWith('.eth') ? trimmed : `${trimmed}.eth`

  return { type: 'name', value }
}

type IndexerDomain = {
  readonly name?: string | null
  readonly normalizedName?: string | null
}

type BuildSuggestionsParams = {
  readonly parsedInput: ParsedInput
  readonly primaryName?: string | null
  readonly indexerDomains: readonly IndexerDomain[]
  readonly history: readonly SearchHistoryItem[]
}

const MAX_SUGGESTIONS = 6

export const buildSuggestions = ({
  parsedInput,
  primaryName,
  indexerDomains,
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
    const isSupported = isSearchNameSupported(parsedInput.value)

    addedNames.add(parsedInput.value.toLowerCase())
    suggestions.push({
      type: 'name',
      value: parsedInput.value,
      isSupported,
    })

    for (const domain of indexerDomains) {
      const name = domain.normalizedName ?? domain.name
      if (!name) continue
      const lowered = name.toLowerCase()
      if (addedNames.has(lowered)) {
        // Enrich existing suggestion with indexer data
        const existing = suggestions.find(
          (s) => s.type === 'name' && s.value.toLowerCase() === lowered,
        )
        if (existing && existing.type === 'name') {
          const idx = suggestions.indexOf(existing)
          suggestions[idx] = { ...existing, isRegistered: true }
        }
        continue
      }
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
        suggestions.push({
          type: 'name',
          value: item.value,
          isSupported: isSearchNameSupported(item.value),
        })
      } else if (item.kind === 'address') {
        suggestions.push({ type: 'address', value: item.value })
      }
    }
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
