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
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { useCheckAvailability } from '@/features/register/components/CheckAvailability/useCheckAvailability'
import { ValidationError } from '@/features/register/components/CheckAvailability/ValidationError'
import { truncateToMaxBytes } from '@/features/register/components/Pricing/utils'
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
    setInputValue(truncateToMaxBytes(event.target.value))
  }

  const { data: unavailableRecords } = useQuery({
    ...profileRecordsQuery(selectedName ?? ''),
    enabled: displayState.type === 'unavailable' && !!selectedName,
  })

  const avatarRecord = unavailableRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const { data: unavailableAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled:
      displayState.type === 'unavailable' && !!selectedName && !!avatarRecord,
  })

  const { data: unavailableExpiry } = useQuery({
    ...profileExpiryQuery(selectedName ?? ''),
    enabled: displayState.type === 'unavailable' && !!selectedName,
  })

  const { data: unavailableRegistration } = useQuery({
    ...profileRegistrationQuery(selectedName ?? ''),
    enabled: displayState.type === 'unavailable' && !!selectedName,
  })

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative">
        <SearchField
          className="w-full"
          isLoading={isLoading}
          onChange={handleInputChange}
          placeholder=".eth"
          value={inputValue}
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
                    isLoading={true}
                    premiumLabel={premiumLabel}
                    price={pricing[1]?.price}
                    status="available"
                  />
                )}

                {displayState.type === 'available' && (
                  <Link
                    search={{ name: displayState.domainName, duration: 1 }}
                    to="/register"
                  >
                    <DomainResultCard
                      clickable
                      domainName={displayState.domainName}
                      isLoading={false}
                      premiumLabel={premiumLabel}
                      price={pricing[1]?.price}
                      status="available"
                    />
                  </Link>
                )}

                {displayState.type === 'unavailable' && (
                  <Link
                    params={{ name: displayState.domainName }}
                    to="/p/$name"
                  >
                    <DomainProfileCard
                      avatarUrl={unavailableAvatar}
                      clickable
                      domainName={displayState.domainName}
                      expiryDate={
                        unavailableExpiry?.expiry != null
                          ? new Date(Number(unavailableExpiry.expiry) * 1000)
                          : null
                      }
                      registeredDate={
                        unavailableRegistration?.registrationDate != null
                          ? new Date(
                              unavailableRegistration.registrationDate * 1000,
                            )
                          : null
                      }
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
