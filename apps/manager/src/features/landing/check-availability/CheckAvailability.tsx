import { applyPastedNameSearch } from '@ens-apps/utils/normalizePastedNameSearch'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { PatternAvatar } from '@/components/atoms/PatternAvatar'
import {
  AddressSuggestionCard,
  DomainProfileCard,
  DomainResultCard,
  domainResultStatusFromGrace,
} from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { MSymbol } from '@/components/ui/material-symbol'
import { EXPLORER_URL } from '@/constants'
import { useCheckAvailability } from '@/features/landing/check-availability/useCheckAvailability'
import { useOpenFirstSearchResultHotkey } from '@/features/navigation/Header/search/useOpenFirstSearchResultHotkey'
import { useNameImageUrl } from '@/features/profile/hooks/useNameImageUrl'
import { buildNameAvatarUrl } from '@/features/profile/service/profileAvatar'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { truncateToMaxBytes } from '@/utils/domain'

const dropdownAnimation = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.2 },
}

const SearchStatusResult = ({
  domainName,
  badge,
  href,
}: {
  readonly domainName: string
  readonly badge: ReactNode
  /** External destination; renders the result as a link leaving Manager */
  readonly href?: string
}) => {
  const content = (
    <>
      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-ens-quartz-50">
        <PatternAvatar
          className="size-full rounded-md border-none bg-transparent p-0 shadow-none"
          name={domainName}
        />
      </div>
      <span className="font-medium text-ens-blue text-lg leading-tight tracking-tight">
        {domainName}
      </span>
      <div
        className={cn(
          'ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-normal text-xs',
          href
            ? 'bg-ens-lapis-100 text-ens-lapis-500'
            : 'bg-red-50 text-red-500',
        )}
      >
        {badge}
      </div>
    </>
  )
  const className =
    'flex w-full items-center gap-4 rounded-sm bg-ens-white px-5 py-5 shadow-lg'

  return (
    <motion.div {...dropdownAnimation}>
      {href ? (
        <a
          className={cn(className, 'hover:bg-slate-50')}
          href={href}
          rel="noopener noreferrer"
          target="_blank"
        >
          {content}
        </a>
      ) : (
        <div className={className}>{content}</div>
      )}
    </motion.div>
  )
}

export type CheckAvailabilityProps = {
  onRegistrationComplete?: (name: string) => void
}

export const CheckAvailability = ({
  onRegistrationComplete: _onRegistrationComplete,
}: CheckAvailabilityProps) => {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)

  const { debouncedValue } = useDebounce(inputValue, { delay: 500 })

  const {
    displayState,
    pricing,
    premiumLabel,
    isInCooldown,
    primaryName,
    isLoading,
  } = useCheckAvailability({ inputValue, debouncedInput: debouncedValue })

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setInputValue(truncateToMaxBytes(event.target.value))
  }

  useOpenFirstSearchResultHotkey({
    enabled: debouncedValue === inputValue,
    resultsContainer: resultsContainerRef,
    target: inputRef,
  })

  // Determine which name to fetch profile data for
  const profileName = match(displayState)
    .with({ type: 'unavailable' }, ({ domainName }) => domainName)
    .with({ type: 'address' }, () => primaryName ?? null)
    .otherwise(() => null)

  const { data: profileRecords } = useQuery({
    ...profileRecordsQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  const themeColor = profileRecords?.texts.find(
    (text) => text.key === 'theme',
  )?.value

  const profileAvatar = useNameImageUrl({
    name: profileName ?? undefined,
    kind: 'avatar',
    fallbackUrl: profileName ? buildNameAvatarUrl(profileName) : undefined,
  })

  const { data: profileExpiry } = useQuery({
    ...profileExpiryQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  const { data: profileRegistration } = useQuery({
    ...profileRegistrationQuery(profileName ?? ''),
    enabled: !!profileName,
  })

  return (
    <div className="relative flex flex-col gap-2">
      <div className="relative z-20">
        <SearchField
          className="w-full"
          isLoading={isLoading}
          onChange={handleInputChange}
          onPaste={(event) =>
            applyPastedNameSearch(event, setInputValue, truncateToMaxBytes)
          }
          placeholder=".eth"
          ref={inputRef}
          value={inputValue}
        />

        <div
          className="absolute top-full z-10 mt-2 w-full space-y-4 drop-shadow-lg"
          ref={resultsContainerRef}
        >
          <AnimatePresence mode="wait">
            {match(displayState)
              .with({ type: 'not-supported' }, (state) => (
                <SearchStatusResult
                  badge={<Trans>Not supported</Trans>}
                  domainName={state.domainName}
                  key={`result-${state.domainName}`}
                />
              ))
              .with({ type: 'error' }, (state) => (
                <SearchStatusResult
                  badge={<Trans>Couldn't check this name</Trans>}
                  domainName={state.domainName}
                  key={`result-${state.domainName}`}
                />
              ))
              .with({ type: 'not-found' }, (state) => (
                <SearchStatusResult
                  badge={<Trans>Name not found</Trans>}
                  domainName={state.domainName}
                  key={`result-${state.domainName}`}
                />
              ))
              .with({ type: 'not-imported' }, (state) => (
                <SearchStatusResult
                  badge={
                    <>
                      <Trans>View in Explorer</Trans>
                      <MSymbol
                        className="ms-opsz-14 ms-wght-400"
                        symbol="arrow_outward"
                      />
                    </>
                  }
                  domainName={state.domainName}
                  href={`${EXPLORER_URL}/${state.domainName}`}
                  key={`result-${state.domainName}`}
                />
              ))
              .with({ type: 'address' }, (state) => (
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
                      <Link params={{ name: primaryName }} to="/$name">
                        <DomainProfileCard
                          avatarUrl={profileAvatar}
                          clickable
                          domainName={primaryName}
                          expiryDate={
                            profileExpiry?.expiry == null
                              ? null
                              : new Date(Number(profileExpiry.expiry) * 1000)
                          }
                          registeredDate={
                            profileRegistration?.registrationDate == null
                              ? null
                              : new Date(
                                  profileRegistration.registrationDate * 1000,
                                )
                          }
                          themeColor={themeColor}
                        />
                      </Link>
                    )}
                  </div>
                </motion.div>
              ))
              .with({ type: 'searching' }, (state) => (
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
              ))
              .with({ type: 'available' }, (state) => (
                <motion.div
                  key={`result-${state.domainName}`}
                  {...dropdownAnimation}
                >
                  <Link
                    params={{ name: state.domainName }}
                    to="/register/$name"
                  >
                    <DomainResultCard
                      clickable
                      domainName={state.domainName}
                      isInCooldown={isInCooldown}
                      isLoading={false}
                      premiumLabel={premiumLabel}
                      price={pricing[1]?.price}
                      status="available"
                    />
                  </Link>
                </motion.div>
              ))
              .with({ type: 'unavailable' }, (state) => (
                <motion.div
                  key={`result-${state.domainName}`}
                  {...dropdownAnimation}
                >
                  <Link params={{ name: state.domainName }} to="/$name">
                    <DomainResultCard
                      avatarUrl={profileAvatar}
                      clickable
                      domainName={state.domainName}
                      status={domainResultStatusFromGrace(
                        getProfileExpiryResultStatus(profileExpiry).isInGrace,
                      )}
                      themeColor={themeColor}
                    />
                  </Link>
                </motion.div>
              ))
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
