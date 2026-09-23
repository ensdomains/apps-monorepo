import type { Suggestion } from './buildSearchSuggestions'

/**
 * Flat item for keyboard nav and selection: suggestions, then owned names.
 */
export type SearchResultItem =
  | { type: 'suggestion'; value: string; suggestion: Suggestion }
  | { type: 'owned'; value: string; name: string }

export type BuildSearchResultItemsParams = {
  suggestions: Suggestion[]
  ownedNamesFiltered: Array<{ name: string }>
}

/**
 * Builds the flat list of search result items in display order:
 * suggestions first, then owned names.
 */
export function buildSearchResultItems({
  suggestions,
  ownedNamesFiltered,
}: BuildSearchResultItemsParams): SearchResultItem[] {
  const items: SearchResultItem[] = []
  for (const s of suggestions) {
    items.push({ type: 'suggestion', value: s.id, suggestion: s })
  }
  for (const d of ownedNamesFiltered) {
    items.push({ type: 'owned', value: `owned:${d.name}`, name: d.name })
  }
  return items
}

/**
 * Moves the suggestion for `exactMatchName` to the front, keeping the relative
 * order of the rest. The exact match is what the user typed, so it must be the
 * first item Enter selects — ahead of other TLDs or available-to-register names.
 */
export function sortExactMatchFirst(
  suggestions: Suggestion[],
  exactMatchName: string,
): Suggestion[] {
  const index = suggestions.findIndex(
    (s) => s.inputValue.trim().toLowerCase() === exactMatchName,
  )
  const exactMatch = suggestions[index]
  if (index <= 0 || !exactMatch) return suggestions
  return [
    exactMatch,
    ...suggestions.slice(0, index),
    ...suggestions.slice(index + 1),
  ]
}
