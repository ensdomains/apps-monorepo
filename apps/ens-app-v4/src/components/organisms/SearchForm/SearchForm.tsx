import { useState } from 'react'
import { Text } from '@/components/ui/text'
import { SearchField } from '../../molecules/SearchField'

export interface SearchFormProps {
  placeholder?: string
  onSearch: (query: string) => void
  loading?: boolean
  recentSearches?: string[]
  onRecentSearchSelect?: (query: string) => void
  showRecentSearches?: boolean
}

export const SearchForm = ({
  placeholder = 'Search for a domain name...',
  onSearch,
  loading = false,
  recentSearches = [],
  onRecentSearchSelect,
  showRecentSearches = true,
}: SearchFormProps) => {
  const [query, setQuery] = useState('')
  const [showRecent, setShowRecent] = useState(false)

  const handleSearch = (searchQuery: string) => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim())
      setShowRecent(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }

  const handleInputFocus = () => {
    if (showRecentSearches && recentSearches.length > 0) {
      setShowRecent(true)
    }
  }

  const handleInputBlur = () => {
    setTimeout(() => setShowRecent(false), 150)
  }

  const handleRecentSearchClick = (recentQuery: string) => {
    setQuery(recentQuery)
    onRecentSearchSelect?.(recentQuery)
    handleSearch(recentQuery)
  }

  return (
    <div className="relative w-full">
      <SearchField
        value={query}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onSearch={handleSearch}
        placeholder={placeholder}
        buttonProps={{
          loading,
          disabled: !query.trim() || loading,
        }}
        size="lg"
      />

      {showRecent && recentSearches.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-background border border-border rounded-lg mt-1 z-10 max-h-48 overflow-y-auto shadow-lg">
          <div className="px-4 py-3 border-b border-border">
            <Text variant="caption" color="secondary" weight="medium">
              Recent Searches
            </Text>
          </div>
          {recentSearches.map((recentQuery) => (
            <button
              key={recentQuery}
              type="button"
              onClick={() => handleRecentSearchClick(recentQuery)}
              className="w-full px-4 py-3 text-left hover:bg-secondary transition-colors duration-200 text-base text-foreground"
            >
              {recentQuery}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

SearchForm.displayName = 'SearchForm'
