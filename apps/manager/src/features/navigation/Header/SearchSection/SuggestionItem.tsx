import { Domain_OrderBy, OrderDirection } from '@ens-apps/indexer'
import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, linkOptions } from '@tanstack/react-router'
import { Loader2Icon, XIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback/ImageFallback'
import { AddressSuggestionCard } from '@/components/molecules/DomainResultCard'
import { getDomainsQuery } from '@/features/dashboard/service/queries/getDashboardDomains'
import { getAvatarUrl } from '@/features/profile/utils/getAvatarUrl'
import { getSearchNameQueryOptions } from '@/features/register/services/checkNameAvailabilityService'
import { isFeatureEnabled } from '@/utils/feature-flags'
import { tw } from '@/utils/tailwind'
import { searchHistoryStore } from './useSearchHistory'

const LINK_OPTIONS = {
  profile: (name: string) =>
    linkOptions({
      to: '/p/$name',
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
          // Hacky solution to force reset state on register page
          // TODO: Update register state logic to properly handle name input changes
          reloadDocument: location.pathname === '/register',
        }),
} as const

type NameSuggestionItemProps = {
  readonly name: string
  readonly onNavigate?: () => void
  readonly isRegistered?: boolean
  readonly isLoading?: boolean
  readonly isError?: boolean
  readonly isSupported?: boolean
}

export const NameSuggestionItem = ({
  name,
  onNavigate,
  isRegistered: isRegisteredProp,
  isLoading: isLoadingProp,
  isError: isErrorProp,
  isSupported = true,
}: NameSuggestionItemProps) => {
  const avatarUrl = getAvatarUrl(name)
  const isSubname = name.split('.').length > 2

  const needsSelfCheck =
    isSupported &&
    isRegisteredProp === undefined &&
    !isLoadingProp &&
    !isErrorProp

  // 2LDs use the registrar contract, subnames use the indexer
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
    .with({ isSubname: true }, ({ indexerQuery: q }) =>
      q.data ? q.data.domains.length > 0 : undefined,
    )
    .otherwise(({ registrarQuery: q }) =>
      q.data ? !q.data.isAvailable : undefined,
    )
  const isLoading = needsSelfCheck ? activeQuery.isLoading : isLoadingProp
  const isError = needsSelfCheck ? activeQuery.isError : isErrorProp
  const isAvailable = isSupported && !isSubname && isRegistered === false
  const isDisabled = !isSupported || (isSubname && isRegistered === false)

  return (
    <Link
      className={tw(
        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
        isDisabled ? 'cursor-default opacity-50' : 'hover:bg-slate-50',
      )}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault()
          return
        }
        searchHistoryStore.trigger.addToHistory({ kind: 'name', value: name })
        onNavigate?.()
      }}
      {...LINK_OPTIONS[isAvailable ? 'register' : 'profile'](name)}
    >
      <div className="relative size-8 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <ImageFallback.Root className="contents">
          <ImageFallback.Image
            alt={`${name} avatar`}
            className="size-full object-cover"
            src={avatarUrl}
          />
          <ImageFallback.Fallback>
            <img
              alt={`${name} avatar placeholder`}
              className="size-full object-cover"
              src={placeholderAvatar}
            />
          </ImageFallback.Fallback>
        </ImageFallback.Root>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-foreground text-sm">
          {name}
        </span>
        {match({ isSupported, isSubname, isLoading, isError, isRegistered })
          .with({ isSupported: false }, () => (
            <div
              className={tw(
                'shrink-0 rounded-full px-1.5 py-1 font-normal text-xs',
                'bg-red-50 text-red-500',
              )}
            >
              <Trans>Not supported</Trans>
            </div>
          ))
          .with({ isLoading: true }, () => (
            <Loader2Icon className="size-4 animate-spin text-slate-500" />
          ))
          .with({ isError: true }, () => (
            <XIcon className="size-4 text-slate-500" />
          ))
          .with({ isRegistered: true }, () => (
            <div
              className={tw(
                'shrink-0 rounded-full px-1.5 py-1 font-normal text-xs',
                'bg-ens-white text-ens-lapis-core',
              )}
            >
              <Trans>Registered</Trans>
            </div>
          ))
          .with({ isSubname: true }, () => null)
          .with({ isRegistered: false }, () => (
            <div
              className={tw(
                'shrink-0 rounded-full px-1.5 py-1 font-normal text-xs',
                'bg-ens-peridot-bg text-ens-peridot-core',
              )}
            >
              <Trans>Available</Trans>
            </div>
          ))
          .otherwise(() => null)}
      </div>
    </Link>
  )
}

type AddressSuggestionItemProps = {
  readonly address: string
  readonly onNavigate?: () => void
}

export const AddressSuggestionItem = ({
  address,
  onNavigate,
}: AddressSuggestionItemProps) => {
  return (
    <AddressSuggestionCard
      address={address}
      onClick={() => {
        searchHistoryStore.trigger.addToHistory({
          kind: 'address',
          value: address,
        })
        onNavigate?.()
      }}
      variant="compact"
    />
  )
}
