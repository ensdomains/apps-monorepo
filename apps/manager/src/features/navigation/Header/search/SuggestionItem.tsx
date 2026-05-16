import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, linkOptions } from '@tanstack/react-router'
import { Loader2Icon, WalletIcon, XIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import * as ImageFallback from '@/components/atoms/ImageFallback/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { GracePeriodBadge } from '@/features/grace/components/GracePeriodBadge'
import { isInGracePeriod } from '@/features/grace/utils/gracePeriod'
import { getSearchNameQueryOptions } from '@/features/register/services/checkNameAvailabilityService'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { tw } from '@/utils/tailwind'
import { searchHistoryStore } from './useSearchHistory'

const LINK_OPTIONS = {
  profile: (name: string) =>
    linkOptions({
      to: '/$name',
      params: { name },
    }),
  register: (name: string) =>
    isFeatureEnabled('REGISTRATION_V2')
      ? linkOptions({
          to: '/register/$name',
          params: { name },
        })
      : linkOptions({
          to: '/register',
          search: {
            name,
          },
          reloadDocument: location.pathname === '/register',
        }),
} as const

type NameSuggestionItemProps = {
  readonly name: string
  readonly avatarUrl?: string
  readonly onNavigate?: () => void
  readonly isRegistered?: boolean
  readonly isLoading?: boolean
  readonly isError?: boolean
  readonly isSupported?: boolean
}

export const NameSuggestionItem = ({
  name,
  avatarUrl,
  onNavigate,
  isRegistered: isRegisteredProp,
  isLoading: isLoadingProp,
  isError: isErrorProp,
  isSupported = true,
}: NameSuggestionItemProps) => {
  const isSubname = name.split('.').length > 2
  const needsSelfCheck =
    isSupported &&
    isRegisteredProp === undefined &&
    !isLoadingProp &&
    !isErrorProp

  const registrarQuery = useQuery({
    ...getSearchNameQueryOptions(name),
    enabled: needsSelfCheck && !isSubname,
  })
  const indexerQuery = useQuery({
    ...getDomainsQuery(
      needsSelfCheck && isSubname
        ? {
            where: { name },
            first: 1,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
    enabled: needsSelfCheck && isSubname,
  })

  const activeQuery = isSubname ? indexerQuery : registrarQuery
  const isRegistered = match({
    needsSelfCheck,
    isSubname,
    indexerQuery,
    registrarQuery,
  })
    .with({ needsSelfCheck: false }, () => isRegisteredProp)
    .with({ isSubname: true }, ({ indexerQuery: query }) =>
      query.data ? query.data.domains.length > 0 : undefined,
    )
    .otherwise(({ registrarQuery: query }) =>
      query.data ? !query.data.isAvailable : undefined,
    )
  const registeredExpiryQuery = useQuery({
    ...getDomainsQuery(
      !isSubname && isRegistered === true
        ? {
            where: { name },
            first: 1,
            orderBy: Domain_OrderBy.Name,
            orderDirection: OrderDirection.Asc,
          }
        : undefined,
    ),
    enabled: !isSubname && isRegistered === true,
  })
  const expirySeconds = registeredExpiryQuery.data?.domains[0]?.expiryDate
  const isInGrace = isInGracePeriod(
    typeof expirySeconds === 'number'
      ? new Date(expirySeconds * 1000)
      : null,
    true,
  )
  const isLoading = needsSelfCheck ? activeQuery.isLoading : isLoadingProp
  const isError = needsSelfCheck ? activeQuery.isError : isErrorProp
  const isAvailable = isSupported && !isSubname && isRegistered === false
  const isDisabled = !isSupported || (isSubname && isRegistered === false)

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
        {match({ isSupported, isSubname, isLoading, isError, isRegistered })
          .with({ isSupported: false }, () => (
            <div className="shrink-0 rounded-full bg-red-50 px-1.5 py-1 font-normal text-red-500 text-xs">
              <Trans>Not supported</Trans>
            </div>
          ))
          .with({ isLoading: true }, () => (
            <Loader2Icon className="size-4 animate-spin text-slate-500" />
          ))
          .with({ isError: true }, () => (
            <XIcon className="size-4 text-slate-500" />
          ))
          .with({ isRegistered: true }, () =>
            match(isInGrace)
              .with(true, () => <GracePeriodBadge />)
              .with(false, () => (
                <div className="shrink-0 rounded-full bg-ens-white px-1.5 py-1 font-normal text-ens-lapis-core text-xs">
                  <Trans>Registered</Trans>
                </div>
              ))
              .exhaustive(),
          )
          .with({ isSubname: true }, () => null)
          .with({ isRegistered: false }, () => (
            <div className="shrink-0 rounded-full bg-ens-peridot-bg px-1.5 py-1 font-normal text-ens-peridot-core text-xs">
              <Trans>Available</Trans>
            </div>
          ))
          .otherwise(() => null)}
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
