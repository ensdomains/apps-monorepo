import { match } from 'ts-pattern'
import { AddressSuggestionItem, NameSuggestionItem } from './SuggestionItem'
import { searchHistoryStore } from './useSearchHistory'
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
  const isShowingHistory = !searchValue.trim()

  if (suggestions.length === 0) {
    if (isShowingHistory) {
      return (
        <div className="px-3 py-6 text-center text-slate-500 text-sm">
          No recent searches
        </div>
      )
    }
    return null
  }

  return (
    <div>
      {isShowingHistory && (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-medium text-slate-500 text-xs">Recent</span>
          <button
            className="font-medium text-ens-blue-primary text-xs hover:underline"
            onClick={() => searchHistoryStore.trigger.clearHistory()}
            type="button"
          >
            Clear
          </button>
        </div>
      )}
      {suggestions.map((suggestion, index) =>
        match(suggestion)
          .with({ type: 'name' }, (name) => (
            <NameSuggestionItem
              isError={name.isError}
              isLoading={name.isLoading}
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
