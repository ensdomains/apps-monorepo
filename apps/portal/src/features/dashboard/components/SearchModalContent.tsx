import { useCallback } from 'react'
import { CommandEmpty, CommandList } from '@/components/ui/command'
import { useSearchResults } from '../hooks/useSearchResults'
import type { Suggestion } from '../utils/buildSearchSuggestions'
import { SearchResultsList } from './SearchResultsList'

export type SearchModalContentProps = {
  /** Trimmed, debounced search value */
  searchValue: string
  onSelectSuggestion: (suggestion: Suggestion) => void
  onSelectAvailableName?: (name: string) => void
  onSelectOwnedName?: (name: string) => void
  navigateToName: (name: string) => void
  navigateToAddress: (address: string) => void
}

export const SearchModalContent = ({
  searchValue,
  onSelectSuggestion,
  onSelectAvailableName,
  onSelectOwnedName,
  navigateToName,
  navigateToAddress,
}: SearchModalContentProps) => {
  const {
    suggestions,
    ownerBySuggestionId,
    availableNames,
    ownedNamesFiltered,
    isTldsLoading,
    hasAnySection,
  } = useSearchResults({
    searchValue,
    navigateToName,
    navigateToAddress,
  })

  const handleSelect = useCallback(
    (value: string) => {
      if (value.startsWith('available:')) {
        onSelectAvailableName?.(value.slice('available:'.length))
        return
      }
      if (value.startsWith('owned:')) {
        onSelectOwnedName?.(value.slice('owned:'.length))
        return
      }
      const suggestion = suggestions.find((s) => s.id === value)
      if (suggestion) onSelectSuggestion(suggestion)
    },
    [suggestions, onSelectSuggestion, onSelectAvailableName, onSelectOwnedName],
  )

  return (
    <CommandList>
      <CommandEmpty>
        {searchValue
          ? 'No results found.'
          : 'Type to search for names or addresses...'}
      </CommandEmpty>
      <SearchResultsList
        suggestions={suggestions}
        ownerBySuggestionId={ownerBySuggestionId}
        availableNames={availableNames}
        ownedNamesFiltered={ownedNamesFiltered}
        onSelect={handleSelect}
        variant="command"
      />
      {searchValue && isTldsLoading && !hasAnySection && (
        <div className="py-6 text-center text-sm text-muted-foreground">
          Checking supported TLDs…
        </div>
      )}
    </CommandList>
  )
}
