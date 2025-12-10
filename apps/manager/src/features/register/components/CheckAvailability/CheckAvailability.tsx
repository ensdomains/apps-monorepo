import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { type ChangeEvent, useState } from 'react'
import {
  DomainProfileCard,
  DomainResultCard,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { profileMetadataQuery } from '@/features/profile/service/profileMetadata'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { ValidationError } from '@/features/register/components/CheckAvailability/ValidationError'
import { useDebounce } from '@/hooks/useDebounce'

const dropdownAnimation = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.2 },
}

export type CheckAvailabilityProps = {
  onRegistrationComplete?: (name: string) => void
}

export const CheckAvailability = ({
  onRegistrationComplete: _onRegistrationComplete,
}: CheckAvailabilityProps) => {
  const [inputValue, setInputValue] = useState('')

  const { debouncedValue } = useDebounce(inputValue, { delay: 500 })

  const {
    validation,
    displayState,
    pricing,
    premiumLabel,
    selectedName,
    isLoading,
    error,
  } = useCheckAvailability({ inputValue, debouncedInput: debouncedValue })

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value)
  }

  const { data: unavailableMetadata } = useQuery({
    ...profileMetadataQuery(selectedName ?? ''),
    enabled: displayState.type === 'unavailable' && !!selectedName,
  })

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative">
        <SearchField
          placeholder=".eth"
          value={inputValue}
          onChange={handleInputChange}
          isLoading={isLoading}
          className="w-full"
        />

        <div className="absolute top-full z-10 mt-2 w-full space-y-4">
          <AnimatePresence mode="wait">
            {validation && (
              <motion.div key="validation-error" {...dropdownAnimation}>
                <ValidationError error={validation} />
              </motion.div>
            )}

            {error && !validation && (
              <motion.div key="error" {...dropdownAnimation}>
                <Alert variant="destructive">
                  <AlertDescription>
                    {error instanceof Error
                      ? error.message
                      : 'An error occurred'}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {displayState.type !== 'idle' && !validation && !error && (
              <motion.div
                key={`result-${displayState.domainName}`}
                {...dropdownAnimation}
              >
                {displayState.type === 'searching' && (
                  <DomainResultCard
                    domainName={displayState.domainName}
                    status="available"
                    premiumLabel={premiumLabel}
                    price={pricing[1]?.price}
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
                      premiumLabel={premiumLabel}
                      price={pricing[1]?.price}
                      isLoading={false}
                      clickable
                    />
                  </Link>
                )}

                {displayState.type === 'unavailable' && (
                  <Link
                    to="/p/$name"
                    params={{ name: displayState.domainName }}
                  >
                    <DomainProfileCard
                      domainName={displayState.domainName}
                      avatarUrl={unavailableMetadata?.avatarUrl}
                      registeredDate={unavailableMetadata?.registeredDate}
                      expiryDate={unavailableMetadata?.expiryDate}
                      clickable
                    />
                  </Link>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className="pl-1 font-medium font-sans text-ens-lapis-surface text-sm leading-normal tracking-wide">
        Start typing to check if your perfect name is available 🕵️‍♀️
      </p>
    </div>
  )
}
