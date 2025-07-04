import { DomainResultCard } from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { getErrorMessage } from '../utils'

type CheckAvailabilityProps = {
  inputValue: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSearch: () => void
  isSearching: boolean
  isAvailable?: boolean
  isError: boolean
  error?: unknown
  name?: string
  onContinue: () => void
}

export const CheckAvailability = ({
  inputValue,
  onChange,
  onSearch,
  isSearching,
  isAvailable,
  isError,
  error,
  name,
  onContinue,
}: CheckAvailabilityProps) => {
  return (
    <div className="space-y-4">
      {/* Search Input */}
      <SearchField
        placeholder="Search for a name"
        value={inputValue}
        onChange={onChange}
        onSearch={onSearch}
        className="w-full"
      />

      <p className="text-sm text-muted-foreground text-center">
        Enter a name to check availability and register your .eth domain
      </p>

      {/* Search Status */}
      {isSearching && (
        <div className="text-center text-muted-foreground">
          Checking availability...
        </div>
      )}

      {/* Search Results */}
      {!isSearching && name && !isError && (
        <div className="space-y-3">
          <DomainResultCard
            domainName={name}
            status={isAvailable ? 'available' : 'unavailable'}
            price={isAvailable ? 5 : undefined}
            onAction={() => isAvailable && onContinue()}
          />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <p className="text-destructive text-sm">
            {String(getErrorMessage(error))}
          </p>
        </div>
      )}
    </div>
  )
}
