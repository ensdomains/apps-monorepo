import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  type ChangeEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  DomainProfileCard,
  DomainResultCard,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import {
  createInitialDisplayState,
  displayStateReducer,
} from '@/features/register/components/CheckAvailability/checkAvailability.reducer'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { ValidationError } from '@/features/register/components/CheckAvailability/ValidationError'
import { getErrorMessage } from '@/features/register/utils'
import { useDebounce } from '@/hooks/useDebounce'

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

  const { cancel: cancelDebounce } = useDebounce(inputValue.trim(), {
    callback: (debouncedValue) => {
      if (debouncedValue && debouncedValue !== context.searchQuery) {
        searchName(debouncedValue)
      }
    },
    immediateCallback: () => {
      resetSearch()
    },
  })

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value
    setInputValue(newValue)
    if (hasValidationError) {
      clearValidationError()
    }
  }

  const handleSearch = (value: string) => {
    cancelDebounce()
    searchName(value)
  }

  const nonValidationErrorMessage =
    !hasValidationError && hasError && context.error
      ? String(getErrorMessage(context.error))
      : null

  // Manage display state with useReducer
  const [displayState, dispatch] = useReducer(
    displayStateReducer,
    createInitialDisplayState(),
  )

  // Update display state when inputs change
  useEffect(() => {
    dispatch({
      type: 'UPDATE_DISPLAY_INPUT',
      payload: {
        inputValue,
        selectedName: context.selectedName,
        isSearching,
        isAvailable: context.isAvailable,
        hasError,
        hasValidationError,
      },
    })
  }, [
    inputValue,
    context.selectedName,
    context.isAvailable,
    isSearching,
    hasError,
    hasValidationError,
  ])

  const { data: unavailableMetadata } = useQuery({
    ...profileMetadataQuery(context.selectedName),
    enabled: displayState.type === 'unavailable' && !!context.selectedName,
  })

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative">
        <SearchField
          placeholder=".eth"
          value={inputValue}
          onChange={handleInputChange}
          onSearch={handleSearch}
          disabled={isSearching}
          className="w-full"
        />

        <div className="absolute top-full z-10 mt-2 w-full space-y-4">
          {hasValidationError && context.validationError && (
            <ValidationError error={context.validationError} />
          )}

          {nonValidationErrorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{nonValidationErrorMessage}</AlertDescription>
            </Alert>
          )}
          {displayState.type === 'searching' && (
            <DomainResultCard
              domainName={displayState.domainName}
              status="available"
              premiumLabel={context.premiumLabel}
              price={context.pricing[1]?.price}
              isLoading={true}
            />
          )}

          {displayState.type === 'available' && (
            <Link
              to="/register"
              search={{ name: displayState.domainName, duration: 1 }}
            >
              <DomainResultCard
                domainName={displayState.domainName}
                status="available"
                premiumLabel={context.premiumLabel}
                price={context.pricing[1]?.price}
                isLoading={false}
                clickable
              />
            </Link>
          )}

          {displayState.type === 'unavailable' && (
            <Link to="/p/$name" params={{ name: displayState.domainName }}>
              <DomainProfileCard
                domainName={displayState.domainName}
                avatarUrl={unavailableMetadata?.avatarUrl}
                registeredDate={unavailableMetadata?.registeredDate}
                expiryDate={unavailableMetadata?.expiryDate}
                clickable
              />
            </Link>
          )}
        </div>
      </div>
      <p className="pl-1 font-medium font-sans text-ens-lapis-surface text-sm leading-normal tracking-wide">
        Start typing to check if your perfect name is available 🕵️‍♀️
      </p>
    </div>
  )
}
