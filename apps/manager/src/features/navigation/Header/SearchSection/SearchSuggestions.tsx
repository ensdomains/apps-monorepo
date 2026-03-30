import { Trans } from '@lingui/react/macro'
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
          <Trans>No recent searches</Trans>
        </div>
      )
    }
    return null
  }

  return (
    <div>
      {isShowingHistory && (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-medium text-slate-500 text-xs">
            <Trans>Recent</Trans>
          </span>
          <button
            className="font-medium text-ens-blue-primary text-xs hover:underline"
            onClick={() => searchHistoryStore.trigger.clearHistory()}
            type="button"
          >
            <Trans>Clear</Trans>
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
              isSupported={name.isSupported}
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
