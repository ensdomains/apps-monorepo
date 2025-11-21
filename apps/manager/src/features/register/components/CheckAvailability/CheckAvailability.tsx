import { useQuery } from '@tanstack/react-query'
import { useActor } from '@xstate/react'
import { cva } from 'class-variance-authority'
import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  DomainProfileCard,
  DomainResultCard,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import { checkAvailabilityMachine } from '../../machines/checkAvailability.machine'
import { getErrorMessage } from '../../utils'

const subtitleVariants = cva([
  'pl-1 font-medium text-xs',
  'font-sans text-brand-lapise-surface',
  'leading-normal tracking-[0.28px]',
])

export type CheckAvailabilityProps = {
  onRegistrationComplete?: (name: string) => void
}

export const CheckAvailability = ({
  onRegistrationComplete,
}: CheckAvailabilityProps) => {
  const [state, send] = useActor(checkAvailabilityMachine)

  const context = state.context
  const isSearching =
    state.matches('searching') || state.matches('fetchingPricing')
  const isPricingLoading = state.matches('fetchingPricing')
  const hasResult = Boolean(state.context.selectedName)
  const hasError = state.matches('error')
  const hasValidationError = state.matches('validationError')
  const searchName = (query: string) => send({ type: 'SEARCH', query })
  const clearValidationError = () => send({ type: 'CLEAR_VALIDATION' })

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

  const pricePerYear = context.pricing[1]?.price ?? 0

  const shouldShowResult =
    hasResult &&
    context.selectedName &&
    !hasError &&
    !hasValidationError &&
    inputValue.trim().toLowerCase() ===
      context.selectedName.trim().toLowerCase()

  // Only fetch metadata when domain is unavailable
  const { data: unavailableMetadata } = useQuery({
    ...profileMetadataQuery(context.selectedName),
    enabled: Boolean(
      shouldShowResult && !context.isAvailable && context.selectedName,
    ),
  })

  return (
    <div className="relative space-y-4">
      <div className="flex flex-col gap-2">
        <SearchField
          placeholder="Search for a name"
          value={inputValue}
          onChange={handleInputChange}
          onSearch={handleSearch}
          disabled={isPricingLoading || isSearching}
          className="w-full"
        />
        {!shouldShowResult && !hasValidationError && !hasError && (
          <p className={subtitleVariants()}>
            Start typing to check if your perfect name is available 🕵️‍♀️
          </p>
        )}
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {shouldShowResult && context.isAvailable && (
        <DomainResultCard
          domainName={context.selectedName}
          status="available"
          isPremium={context.isPremium}
          price={!isPricingLoading ? pricePerYear : undefined}
          priceLabel="USD/year"
          link={{
            to: '/register',
            search: { name: context.selectedName, duration: 1 },
          }}
        />
      )}

      {shouldShowResult && !context.isAvailable && (
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
