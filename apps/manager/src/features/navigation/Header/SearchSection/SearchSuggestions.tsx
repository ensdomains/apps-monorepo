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

  return (
    <div className="">
      {suggestions.map((suggestion) =>
        match(suggestion)
          .with({ type: 'name' }, (name) => (
            <NameSuggestionItem name={name.value} onNavigate={onNavigate} />
          ))
          .with({ type: 'address' }, (address) => (
            <AddressSuggestionItem
              address={address.value}
              onNavigate={onNavigate}
            />
          ))
          .with({ type: 'separator' }, () => (
            <div className="h-px w-full bg-ens-gray-two" />
          ))
          .exhaustive(),
      )}
    </div>
  )
}
