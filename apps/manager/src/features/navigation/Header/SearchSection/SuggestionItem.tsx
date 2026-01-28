import { useQuery } from '@tanstack/react-query'
import { Link, linkOptions } from '@tanstack/react-router'
import { Loader2Icon, Wallet, XIcon } from 'lucide-react'
import { match, P } from 'ts-pattern'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback/ImageFallback'
import { useAvatarFromName } from '@/features/profile/service/profileAvatar'
import { getSearchNameQueryOptions } from '@/features/register/services/checkNameAvailabilityService'
import { tw } from '@/utils/tailwind'
import { searchHistoryStore } from './useSearchHistory'

const LINK_OPTIONS = {
  profile: (name: string) =>
    linkOptions({
      to: '/p/$name',
      params: { name },
    }),
  register: (name: string) =>
    linkOptions({
      to: '/register',
      search: {
        name,
      },
    }),
} as const

type NameSuggestionItemProps = {
  name: string
  onNavigate?: () => void
}

export const NameSuggestionItem = ({
  name,
  onNavigate,
}: NameSuggestionItemProps) => {
  const { data: avatarUrl } = useAvatarFromName({
    name,
  })

  // Query for name availability (only for name inputs, not addresses)
  const nameAvailabilityQuery = useQuery({
    ...getSearchNameQueryOptions(name),
    enabled: name.length >= 3,
  })

  const isAvailable = nameAvailabilityQuery.data?.isAvailable ?? false

  return (
    <Link
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50"
      onClick={() => {
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className={'truncate font-medium text-[#1D1B20] text-sm'}>
              {name}
            </span>
          </div>
        </div>
        {match({
          isLoading: nameAvailabilityQuery.isLoading,
          isError: nameAvailabilityQuery.isError,
          data: nameAvailabilityQuery.data,
        })
          .with(
            {
              isLoading: true,
            },
            () => (
              <Loader2Icon className="size-4 animate-spin text-slate-500" />
            ),
          )
          .with(
            {
              isLoading: false,
              isError: true,
            },
            () => <XIcon className="size-4 text-slate-500" />,
          )
          .with(
            {
              data: {
                isAvailable: P.boolean,
              },
            },
            ({ data }) => (
              <div
                className={tw(
                  'shrink-0 rounded-full px-1.5 py-1 font-normal text-xs',
                  data.isAvailable
                    ? 'bg-[#DEF3E4] text-ens-peridot-core'
                    : 'bg-ens-white text-ens-lapis-core',
                )}
              >
                {data.isAvailable ? 'Available' : 'Registered'}
              </div>
            ),
          )
          .otherwise(() => null)}
      </div>
    </Link>
  )
}

type AddressSuggestionItemProps = {
  address: string
  onNavigate?: () => void
}

export const AddressSuggestionItem = ({
  address,
  onNavigate,
}: AddressSuggestionItemProps) => {
  return (
    <Link
      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50"
      onClick={() => {
        searchHistoryStore.trigger.addToHistory({
          kind: 'address',
          value: address,
        })
        onNavigate?.()
      }}
      params={{ name: address }}
      to="/p/$name"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
        <Wallet className="size-4 text-slate-600" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-[#1D1B20] text-sm">
            {address}
          </span>
        </div>
      </div>
    </Link>
  )
}
