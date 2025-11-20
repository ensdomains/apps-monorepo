import { useQuery } from '@tanstack/react-query'
import { cva } from 'class-variance-authority'
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  DomainProfileCard,
  DomainResultCard,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import { getErrorMessage } from '../../utils'
import { useCheckAvailability } from './hooks/useCheckAvailability'

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
        <DomainResultCardWithExpiry
          domainName={context.selectedName}
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
        <DomainProfileCardWithData domainName={context.selectedName} />
      )}
    </div>
  )
}

// Component to fetch and display expiry data for available domains
const DomainResultCardWithExpiry = ({
  domainName,
  isPremium,
  price,
  priceLabel,
  link,
}: {
  domainName: string
  isPremium: boolean
  price?: number
  priceLabel: string
  link: {
    to: string
    search: { name: string; duration: number }
  }
}) => {
  const {
    data: expiryData,
    isFetched: isExpiryFetched,
    fetchStatus,
  } = useQuery(profileExpiryQuery(domainName))

  // Track minimum loading time to prevent flash
  const [showMinimumLoading, setShowMinimumLoading] = useState(true)
  const mountTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    // Reset mount time when domain name changes
    mountTimeRef.current = Date.now()
    setShowMinimumLoading(true)
  }, [domainName])

  useEffect(() => {
    if (isExpiryFetched && showMinimumLoading) {
      const elapsed = Date.now() - mountTimeRef.current
      const minimumDisplayTime = 500 // ms
      const remainingTime = Math.max(0, minimumDisplayTime - elapsed)

      const timer = setTimeout(() => {
        setShowMinimumLoading(false)
      }, remainingTime)

      return () => clearTimeout(timer)
    }
  }, [isExpiryFetched, showMinimumLoading])

  // Extract expiry date from the result
  // expiryData is unwrapped from Result type by resultQueryOptions
  // The expiry field is a BigInt timestamp in seconds
  const expiryDate = useMemo(() => {
    if (expiryData && expiryData.status !== 'expired' && expiryData.expiry) {
      // Convert BigInt timestamp (seconds) to Date (milliseconds)
      return new Date(Number(expiryData.expiry) * 1000)
    }
    return undefined
  }, [expiryData])

  // Show loading skeleton while actively fetching or during minimum display time
  const showExpiryLoading =
    fetchStatus === 'fetching' || !isExpiryFetched || showMinimumLoading

  return (
    <DomainResultCard
      domainName={domainName}
      status="available"
      isPremium={isPremium}
      price={price}
      priceLabel={priceLabel}
      expiryDate={expiryDate}
      isExpiryLoading={showExpiryLoading}
      link={link}
    />
  )
}

// Component to fetch and display profile data for unavailable domains
const DomainProfileCardWithData = ({ domainName }: { domainName: string }) => {
  const { data: metadata } = useQuery(profileMetadataQuery(domainName))

  // Extract dates and avatar (resultQueryOptions unwraps the Result type automatically)
  const registeredDate = metadata?.registeredDate ?? undefined
  const expiryDate = metadata?.expiryDate ?? undefined
  const avatarUrl = metadata?.avatarUrl ?? undefined

  return (
    <DomainProfileCard
      domainName={domainName}
      avatarUrl={avatarUrl}
      registeredDate={registeredDate}
      expiryDate={expiryDate}
      link={{
        to: '/p/$name',
        params: { name: domainName },
      }}
    />
  )
}
