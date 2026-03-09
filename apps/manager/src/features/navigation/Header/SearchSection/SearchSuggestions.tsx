import { match } from 'ts-pattern'
import { AddressSuggestionItem, NameSuggestionItem } from './SuggestionItem'
import { useSearchSuggestions } from './useSearchSuggestions'

interface SearchSuggestionsProps {
  searchValue: string
  onNavigate?: () => void
}

export const SearchSuggestions = ({
  searchValue,
  onNavigate,
}: SearchSuggestionsProps) => {
  const suggestions = useSearchSuggestions(searchValue)

  if (suggestions.length === 0) {
    // Only show message when search is empty (no input yet)
    // If they're typing, don't show anything - results will appear as they type
    if (!searchValue.trim()) {
      return (
        <div className="px-3 py-6 text-center text-slate-500 text-sm">
          No recent searches
        </div>
      )
    }
    // If they have typed something but no suggestions, return null
    // (they're actively searching, results will appear)
    return null
  }

  return (
    <div className="">
      {suggestions.map((suggestion, index) =>
        match(suggestion)
          .with({ type: 'name' }, (name) => (
            <NameSuggestionItem
              avatarRecord={name.avatarRecord}
              isRegistered={name.isRegistered}
              key={name.value}
              name={name.value}
              onNavigate={onNavigate}
            />
          ))
          .with({ type: 'address' }, (address) => (
            <AddressSuggestionItem
              address={address.value}
              key={address.value}
              onNavigate={onNavigate}
            />
          ))
          .with({ type: 'separator' }, () => (
            <div
              className="h-px w-full bg-ens-gray-two"
              key={`separator-${
                // biome-ignore lint/suspicious/noArrayIndexKey: Doesn't need to be unique between separators
                index
              }`}
            />
          ))
          .exhaustive(),
      )}
    </div>
  )
}
