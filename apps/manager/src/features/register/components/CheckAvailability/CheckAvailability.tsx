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
    searchName,
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
    setInputValue(event.target.value)
  }

  const handleSearch = (value: string) => {
    searchName(value)
  }

  const errorMessage =
    hasError && context.error ? String(getErrorMessage(context.error)) : null

  const successMessage =
    context.registrationSuccess && context.selectedName
      ? `${context.selectedName} has been registered successfully.`
      : null

  // Get the per-year price from pricing options (1 year base price)
  const pricePerYear = context.pricing[1]?.price ?? 0

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
        {(!hasResult || hasError) && (
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

      {hasResult && context.selectedName && !hasError && (
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

      {successMessage && (
        <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
