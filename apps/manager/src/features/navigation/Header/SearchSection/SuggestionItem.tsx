import { Link, linkOptions } from '@tanstack/react-router'
import { Loader2Icon, XIcon } from 'lucide-react'
import { match } from 'ts-pattern'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import * as ImageFallback from '@/components/atoms/ImageFallback/ImageFallback'
import { AddressSuggestionCard } from '@/components/molecules/DomainResultCard'
import { getAvatarUrl } from '@/features/profile/utils/getAvatarUrl'
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
      // Hacky solution to force reset state on register page
      // TODO: Update register state logic to properly handle name input changes
      reloadDocument: location.pathname === '/register',
    }),
} as const

type NameSuggestionItemProps = {
  readonly name: string
  readonly onNavigate?: () => void
  /** Whether the name is registered (from indexer). undefined = still loading */
  readonly isRegistered?: boolean
  /** Whether the indexer query is loading */
  readonly isLoading?: boolean
  /** Whether the indexer query errored */
  readonly isError?: boolean
}

export const NameSuggestionItem = ({
  name,
  onNavigate,
  isRegistered,
  isLoading,
  isError,
}: NameSuggestionItemProps) => {
  const avatarUrl = getAvatarUrl(name)

  const isAvailable = isRegistered === false

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
            <span className={'truncate font-medium text-foreground text-sm'}>
              {name}
            </span>
          </div>
        </div>
        {match({ isLoading, isError, isRegistered })
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
              Registered
            </div>
          ))
          .with({ isRegistered: false }, () => (
            <div
              className={tw(
                'shrink-0 rounded-full px-1.5 py-1 font-normal text-xs',
                'bg-ens-peridot-bg text-ens-peridot-core',
              )}
            >
              Available
            </div>
          ))
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
