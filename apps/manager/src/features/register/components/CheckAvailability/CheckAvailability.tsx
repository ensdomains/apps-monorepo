import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import { DomainResultCard } from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getErrorMessage } from '../../utils'
import { useCheckAvailability } from './hooks/useCheckAvailability'

export type CheckAvailabilityProps = {
  onRegistrationComplete?: (name: string) => void
}

export const CheckAvailability = ({
  onRegistrationComplete,
}: CheckAvailabilityProps) => {
  const {
    context,
    isSearching,
    isPricingLoading,
    hasResult,
    hasError,
    hasValidationError,
    searchName,
    clearValidationError,
  } = useCheckAvailability()

  const [inputValue, setInputValue] = useState(context.searchQuery)
  const prevRegistrationState = useRef(context.registrationSuccess)

  useEffect(() => {
    setInputValue(context.searchQuery)
  }, [context.searchQuery])

  useEffect(() => {
    if (
      context.registrationSuccess &&
      !prevRegistrationState.current &&
      context.selectedName
    ) {
      onRegistrationComplete?.(context.selectedName)
    }
    prevRegistrationState.current = context.registrationSuccess
  }, [
    context.registrationSuccess,
    context.selectedName,
    onRegistrationComplete,
  ])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value
    setInputValue(newValue)
    // Clear validation error when user starts typing (but don't validate yet)
    if (hasValidationError) {
      clearValidationError()
    }
  }

  const handleSearch = (value: string) => {
    searchName(value)
  }

  // Prioritize validation errors over API errors
  const errorMessage = hasValidationError
    ? (context.validationError?.message ?? null)
    : hasError && context.error
      ? String(getErrorMessage(context.error))
      : null

  // Get the per-year price from pricing options (1 year base price)
  const pricePerYear = context.pricing[1]?.price ?? 0

  const shouldShowResult =
    hasResult &&
    context.selectedName &&
    !hasError &&
    !hasValidationError &&
    inputValue.trim().toLowerCase() ===
      context.selectedName.trim().toLowerCase()

  return (
    <div className="relative space-y-4">
      <div className="flex flex-col gap-1">
        <SearchField
          placeholder="Search for a name"
          value={inputValue}
          onChange={handleInputChange}
          onSearch={handleSearch}
          disabled={isPricingLoading || isSearching}
          className="w-full"
        />
        {!shouldShowResult && !hasValidationError && !hasError && (
          <p className="subtitle-search-field">
            Start typing to check if your perfect name is available 🕵️‍♀️
          </p>
        )}
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {shouldShowResult && (
        <DomainResultCard
          domainName={context.selectedName}
          status={context.isAvailable ? 'available' : 'unavailable'}
          isPremium={context.isPremium}
          price={
            context.isAvailable && !isPricingLoading ? pricePerYear : undefined
          }
          priceLabel="USD/year"
          link={
            context.isAvailable
              ? {
                  to: '/register',
                  search: { name: context.selectedName, duration: 1 },
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
