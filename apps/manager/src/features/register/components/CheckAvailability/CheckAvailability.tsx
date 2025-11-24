import { useQuery } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  DomainProfileCard,
  DomainResultCard,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { getErrorMessage } from '../../utils'

export type CheckAvailabilityProps = {
  onRegistrationComplete?: (name: string) => void
}

export const CheckAvailability = ({
  onRegistrationComplete,
}: CheckAvailabilityProps) => {
  const {
    context,
    isSearching,
    hasError,
    hasValidationError,
    searchName,
    resetSearch,
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

    if (newValue.trim() === '') {
      resetSearch()
    }

    if (hasValidationError) {
      clearValidationError()
    }
  }

  const handleSearch = (value: string) => {
    searchName(value)
  }

  const errorMessage = hasValidationError
    ? (context.validationError?.message ?? null)
    : hasError && context.error
      ? String(getErrorMessage(context.error))
      : null

  // Display logic
  const hasInput = inputValue.trim().length > 0
  const isResultMatch =
    context.selectedName &&
    inputValue.trim().toLowerCase() ===
      context.selectedName.trim().toLowerCase()

  const showAvailableCard =
    !isSearching &&
    context.isAvailable &&
    isResultMatch &&
    !hasError &&
    !hasValidationError
  const showUnavailableCard =
    !isSearching &&
    !context.isAvailable &&
    isResultMatch &&
    !hasError &&
    !hasValidationError
  const showResultCard = (isSearching && hasInput) || showAvailableCard

  const { data: unavailableMetadata } = useQuery({
    ...profileMetadataQuery(context.selectedName),
    enabled: !!(showUnavailableCard && context.selectedName),
  })

  return (
    <div className="relative space-y-4">
      <div className="flex flex-col gap-2">
        <SearchField
          placeholder="Search for a name"
          value={inputValue}
          onChange={handleInputChange}
          onSearch={handleSearch}
          disabled={isSearching}
          className="w-full"
        />
        {!showResultCard &&
          !showUnavailableCard &&
          !hasValidationError &&
          !hasError &&
          !isSearching && (
            <p className="pl-1 font-medium font-sans text-ens-lapis-surface text-xs leading-normal tracking-wide">
              Start typing to check if your perfect name is available 🕵️‍♀️
            </p>
          )}
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {showResultCard && (
        <DomainResultCard
          domainName={isSearching ? inputValue : context.selectedName || ''}
          status="available"
          premiumLabel={context.premiumLabel}
          price={context.pricing[1]?.price}
          isLoading={isSearching}
          link={
            !isSearching && context.selectedName
              ? `/register?name=${encodeURIComponent(context.selectedName)}&duration=1`
              : undefined
          }
        />
      )}

      {showUnavailableCard && (
        <DomainProfileCard
          domainName={context.selectedName}
          avatarUrl={unavailableMetadata?.avatarUrl}
          registeredDate={unavailableMetadata?.registeredDate}
          expiryDate={unavailableMetadata?.expiryDate}
          link={{
            to: '/p/$name',
            params: { name: context.selectedName },
          }}
        />
      )}
    </div>
  )
}
