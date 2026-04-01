import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { type ChangeEvent, useState } from 'react'
import { match, P } from 'ts-pattern'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import {
  AddressSuggestionCard,
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
import { useDebounce } from '@/hooks/useDebounce'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import { truncateToMaxBytes } from '@/utils/domain'
import { isFeatureEnabled } from '@/utils/feature-flags'

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
    displayState,
    pricing,
    premiumLabel,
    primaryName,
    selectedName,
    isLoading,
    error,
  } = useCheckAvailability({ inputValue, debouncedInput: debouncedValue })

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(truncateToMaxBytes(event.target.value))
  }

  // Determine which name to fetch profile data for
  const profileName = match(displayState)
    .with({ type: 'unavailable' }, () => selectedName)
    .with({ type: 'address' }, () => primaryName ?? null)
    .otherwise(() => null)

  const { data: profileRecords } = useQuery({
    ...profileRecordsQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  const avatarRecord = profileRecords?.texts.find(
    (text) => text.key === 'avatar',
  )?.value

  const themeColor = profileRecords?.texts.find(
    (text) => text.key === 'theme',
  )?.value

  const { data: profileAvatar } = useQuery({
    ...parseAvatarQuery(avatarRecord),
    enabled: !!profileName && !!avatarRecord,
  })

  const { data: profileExpiry } = useQuery({
    ...profileExpiryQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  const { data: profileRegistration } = useQuery({
    ...profileRegistrationQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  const showResults = displayState.type !== 'idle' && !error

  const blurBackdropEnabled = useFeatureFlag('SEARCH_RESULTS_BLUR_BACKDROP')

  return (
    <div className="relative flex flex-col gap-2">
      {showResults && blurBackdropEnabled && (
        <div
          aria-hidden
          className="fixed inset-x-0 top-[360px] bottom-0 z-10 bg-[#FCFBFB]/40 backdrop-blur-[2px] md:top-[380px]"
        />
      )}
      <div className="relative z-20">
        <SearchField
          className="w-full"
          isLoading={isLoading}
          onChange={handleInputChange}
          placeholder=".eth"
          value={inputValue}
        />

        <div className="absolute top-full z-10 mt-2 w-full space-y-4 drop-shadow-lg">
          <AnimatePresence mode="wait">
            {match({ error, displayState })
              .with({ error: P.nonNullable }, ({ error: err }) => (
                <motion.div key="error" {...dropdownAnimation}>
                  <Alert variant="destructive">
                    <AlertDescription>
                      {err instanceof Error ? (
                        err.message
                      ) : (
                        <Trans>An error occurred</Trans>
                      )}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              ))
              .with(
                { displayState: { type: 'not-supported' } },
                ({ displayState: state }) => (
                  <motion.div
                    key={`result-${state.domainName}`}
                    {...dropdownAnimation}
                  >
                    <div className="flex w-full items-center gap-4 rounded-sm bg-ens-white px-5 py-5 shadow-lg">
                      <img
                        alt={state.domainName}
                        className="size-12 rounded-sm object-cover"
                        src={placeholderAvatar}
                      />
                      <span className="font-medium text-ens-blue text-lg leading-tight tracking-tight">
                        {state.domainName}
                      </span>
                      <div className="ml-auto shrink-0 rounded-full bg-red-50 px-2 py-1 font-normal text-red-500 text-xs">
                        <Trans>Not supported</Trans>
                      </div>
                    </div>
                  </motion.div>
                ),
              )
              .with(
                { displayState: { type: 'address' } },
                ({ displayState: state }) => (
                  <motion.div
                    key={`result-${state.address}`}
                    {...dropdownAnimation}
                  >
                    <div className="flex flex-col gap-3">
                      <AddressSuggestionCard
                        address={state.address}
                        variant="card"
                      />
                      {primaryName && (
                        <Link params={{ name: primaryName }} to="/p/$name">
                          <DomainProfileCard
                            avatarUrl={profileAvatar}
                            clickable
                            domainName={primaryName}
                            expiryDate={
                              profileExpiry?.expiry != null
                                ? new Date(Number(profileExpiry.expiry) * 1000)
                                : null
                            }
                            registeredDate={
                              profileRegistration?.registrationDate != null
                                ? new Date(
                                    profileRegistration.registrationDate * 1000,
                                  )
                                : null
                            }
                            themeColor={themeColor}
                          />
                        </Link>
                      )}
                    </div>
                  </motion.div>
                ),
              )
              .with(
                { displayState: { type: 'searching' } },
                ({ displayState: state }) => (
                  <motion.div
                    key={`result-${state.domainName}`}
                    {...dropdownAnimation}
                  >
                    <DomainResultCard
                      domainName={state.domainName}
                      isLoading={true}
                      premiumLabel={premiumLabel}
                      price={pricing[1]?.price}
                      status="available"
                    />
                  </motion.div>
                ),
              )
              .with(
                { displayState: { type: 'available' } },
                ({ displayState: state }) => (
                  <motion.div
                    key={`result-${state.domainName}`}
                    {...dropdownAnimation}
                  >
                    <Link
                      {...(isFeatureEnabled('REGISTRATION_V2')
                        ? {
                            params: { name: state.domainName },
                            to: '/register-v2/$name',
                          }
                        : {
                            search: {
                              name: state.domainName,
                              duration: 1,
                            },
                            to: '/register',
                          })}
                    >
                      <DomainResultCard
                        clickable
                        domainName={state.domainName}
                        isLoading={false}
                        premiumLabel={premiumLabel}
                        price={pricing[1]?.price}
                        status="available"
                      />
                    </Link>
                  </motion.div>
                ),
              )
              .with(
                { displayState: { type: 'unavailable' } },
                ({ displayState: state }) => (
                  <motion.div
                    key={`result-${state.domainName}`}
                    {...dropdownAnimation}
                  >
                    <Link params={{ name: state.domainName }} to="/p/$name">
                      <DomainProfileCard
                        avatarUrl={profileAvatar}
                        clickable
                        domainName={state.domainName}
                        expiryDate={
                          profileExpiry?.expiry != null
                            ? new Date(Number(profileExpiry.expiry) * 1000)
                            : null
                        }
                        registeredDate={
                          profileRegistration?.registrationDate != null
                            ? new Date(
                                profileRegistration.registrationDate * 1000,
                              )
                            : null
                        }
                        themeColor={themeColor}
                      />
                    </Link>
                  </motion.div>
                ),
              )
              .otherwise(() => null)}
          </AnimatePresence>
        </div>
      </div>
      <p className="pl-1 font-medium font-sans text-ens-lapis-surface text-sm leading-normal tracking-wide">
        <Trans>Start typing to check if your perfect name is available</Trans>{' '}
        🕵️‍♀️
      </p>
    </div>
  )
}
