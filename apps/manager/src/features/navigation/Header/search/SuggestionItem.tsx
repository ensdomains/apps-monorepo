import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, linkOptions } from '@tanstack/react-router'
import { Loader2Icon, WalletIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import * as ImageFallback from '@/components/atoms/ImageFallback/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar'
import { MSymbol } from '@/components/ui/material-symbol'
import { GracePeriodBadge } from '@/features/grace/components/GracePeriodBadge'
import {
  getProfileExpiryResultStatus,
  profileExpiryQuery,
} from '@/features/profile/service/profileExpiry'
import { useNameClassification } from '@/features/search/useNameClassification'
import { getNamePricingQueryOptions } from '@/features/shared/service/checkNameAvailabilityService'
import { tw } from '@/utils/tailwind'
import { recordNameSearch } from './recordNameSearch'
import { searchHistoryStore } from './useSearchHistory'

const LINK_OPTIONS = {
  profile: (name: string) =>
    linkOptions({
      to: '/$name',
      params: { name },
    }),
  register: (name: string) =>
    linkOptions({
      to: '/register/$name',
      params: { name },
    }),
} as const

type NameSuggestionItemProps = {
  readonly name: string
  readonly avatarUrl?: string
  readonly onNavigate?: () => void
}

export const NameSuggestionItem = ({
  name,
  avatarUrl,
  onNavigate,
}: NameSuggestionItemProps) => {
  const { kind, outcome } = useNameClassification(name)
  const isEth2ld = kind.type === 'eth-2ld'
  const isAvailable = outcome.type === 'available'
  const isOwned = outcome.type === 'owned'
  const isDisabled = outcome.type === 'invalid' || outcome.type === 'not-found'

  const registeredExpiryQuery = useQuery({
    ...profileExpiryQuery(name),
    enabled: isEth2ld && isOwned,
  })
  const { isInGrace } = getProfileExpiryResultStatus(registeredExpiryQuery.data)

  const pricingQuery = useQuery({
    ...getNamePricingQueryOptions(isAvailable ? name : undefined),
    enabled: isAvailable,
  })
  const isInCooldown =
    isAvailable &&
    typeof pricingQuery.data?.usdc?.premium === 'bigint' &&
    pricingQuery.data.usdc.premium > 0n

  return (
    <Link
      className={tw(
        'flex w-full items-center gap-3 p-3 text-left transition-colors',
        isDisabled ? 'cursor-default opacity-50' : 'hover:bg-slate-50',
      )}
      onClick={(event) => {
        if (isDisabled) {
          event.preventDefault()
          return
        }
        searchHistoryStore.trigger.addToHistory({ kind: 'name', value: name })
        recordNameSearch(name)
        onNavigate?.()
      }}
      {...LINK_OPTIONS[isAvailable ? 'register' : 'profile'](name)}
    >
      <div className="relative size-8 shrink-0 overflow-hidden rounded bg-slate-100">
        <ImageFallback.Root className="contents">
          <ImageFallback.Image
            alt={`${name} avatar`}
            className="size-full object-cover"
            src={avatarUrl}
          />
          <ImageFallback.Fallback>
            <PatternAvatar className="size-full min-h-0 min-w-0" name={name} />
          </ImageFallback.Fallback>
        </ImageFallback.Root>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
          {name}
        </span>
        {isInCooldown && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ens-lapis-100 px-1.5 py-1 font-normal text-ens-lapis-500 text-xs">
            <Trans>Price Cooldown</Trans>
            <MSymbol className="ms-opsz-14 ms-wght-400" symbol="hourglass" />
          </div>
        )}
        {match(outcome)
          .with({ type: 'invalid' }, () => (
            <div className="shrink-0 rounded-full bg-red-50 px-1.5 py-1 font-normal text-red-500 text-xs">
              <Trans>Not supported</Trans>
            </div>
          ))
          .with({ type: 'loading' }, () => (
            <Loader2Icon className="size-4 animate-spin text-slate-500" />
          ))
          .with({ type: 'owned' }, () => (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="inline-flex h-5 items-center justify-center rounded-xl bg-ens-white px-2 py-1 font-sans text-ens-lapis-core text-xs leading-none">
                <Trans>Registered</Trans>
              </span>
              {isInGrace && <GracePeriodBadge />}
            </div>
          ))
          .with({ type: 'available' }, () => (
            <div className="shrink-0 rounded-full bg-ens-peridot-bg px-1.5 py-1 font-normal text-ens-peridot-core text-xs">
              <Trans>Available</Trans>
            </div>
          ))
          .with({ type: 'not-found' }, () => (
            <div className="shrink-0 rounded-full bg-red-50 px-1.5 py-1 font-normal text-red-500 text-xs">
              <Trans>Name not found</Trans>
            </div>
          ))
          .with({ type: 'unproven' }, () => null)
          .exhaustive()}
      </div>
    </Link>
  )
}

type AddressSuggestionItemProps = {
  readonly address: Address
  readonly onNavigate?: () => void
}

export const AddressSuggestionItem = ({
  address,
  onNavigate,
}: AddressSuggestionItemProps) => {
  return (
    <Link
      className={tw(
        'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-slate-50',
      )}
      onClick={() => {
        searchHistoryStore.trigger.addToHistory({
          kind: 'address',
          value: address,
        })
        onNavigate?.()
      }}
      params={{ address }}
      to="/$address"
    >
      <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
        <WalletIcon className="size-4 text-slate-600" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
          {address}
        </span>
      </div>
    </Link>
  )
}
