import { OrderDirection } from '@ens-apps/indexer'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAtom } from '@xstate/store/react'
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
} from 'lucide-react'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
import { useWalletClient } from 'wagmi'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { isBackendAuthed } from '@/utils/backend-client'
import { useDashboardNames } from '../hooks/useDashboardNames'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { NameRow } from './NameRow'
import { PrimaryBadge } from './PrimaryBadge'

interface MyNamesListProps {
  readonly primaryLabel?: string | null
  readonly searchQuery?: string
}

type SortIndicatorProps = {
  readonly direction?: OrderDirection
  readonly isActive: boolean
}

const NameRowSkeleton = () => (
  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[12px]">
      <div className="size-[16px] shrink-0 animate-pulse rounded bg-gray-200" />
      <div className="flex items-center gap-2 md:gap-[12px]">
        <div className="size-[32px] shrink-0 animate-pulse rounded-full bg-gray-200 md:size-[36.9px]" />
        <div className="h-[24px] w-[120px] animate-pulse rounded-[2.8px] bg-gray-200 md:w-[150px]" />
      </div>
    </div>
    <div className="flex items-start gap-4 md:gap-[30px]">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:gap-[4px]">
        <div className="h-[20px] w-[80px] animate-pulse rounded bg-gray-200" />
        <div className="h-[16px] w-[50px] animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  </div>
)

const SortIndicator = ({ direction, isActive }: SortIndicatorProps) => {
  if (!isActive) {
    return (
      <div className="flex flex-col">
        <ChevronDown className="size-[8.2px] rotate-180 text-[#d7d7d7]" />
        <ChevronDown className="size-[8.2px] text-[#d7d7d7]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <ChevronDown
        className={`size-[8.2px] rotate-180 ${direction === OrderDirection.Asc ? 'text-[#0080bc]' : 'text-[#d7d7d7]'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === OrderDirection.Desc ? 'text-[#0080bc]' : 'text-[#d7d7d7]'}`}
      />
    </div>
  )
}

export const MyNamesList = ({
  primaryLabel,
  searchQuery = '',
}: MyNamesListProps) => {
  const {
    names,
    isLoading,
    isError,
    page,
    handlePrev,
    handleNext,
    pageSize,
    sortField,
    sortDirection,
    handleSort,
  } = useDashboardNames({ searchQuery })

  const isAuthed = useAtom(isBackendAuthed)
  const { data: walletClient } = useWalletClient()
  const signIn = useMutation(signInBackendMutation)

  const { data: favorites = [] } = useQuery(favoritesQueryOptions)
  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const isFavorite = (label: string) =>
    favorites.some((entry) => entry.name.toLowerCase() === label.toLowerCase())

  const toggleFavorite = async (label: string) => {
    if (!isAuthed) {
      if (!walletClient) {
        toast.error('Please connect your wallet first')
        return
      }

      try {
        await signIn.mutateAsync({ walletClient })
      } catch (error) {
        console.error('Failed to sign in:', error)
        toast.error('Failed to sign in. Please try again.')
        return
      }
    }

    if (isFavorite(label)) {
      removeMutation.mutate({ name: label })
    } else {
      addMutation.mutate({ name: label })
    }
  }

  const avatarQueries = useQueries({
    queries: names.map((domain) =>
      parseAvatarQuery(domain.resolver?.avatar ?? undefined),
    ),
  })

  const hasNextPage = names.length === pageSize

  if (isError) {
    return (
      <div className="py-8 text-center font-sans text-red-500 text-sm">
        Error loading names
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-[16px] hidden w-full md:flex md:items-center md:justify-between">
        <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[12px]">
          <div className="size-[16px] shrink-0" />
          <div className="flex items-center gap-2 md:gap-[12px]">
            <div className="size-[32px] shrink-0 md:size-[36.9px]" />
            <div className="flex items-center gap-[8px]">
              <button
                className="flex cursor-pointer items-center gap-[8px]"
                onClick={() => handleSort('name')}
                type="button"
              >
                <span
                  className={`font-sans text-[12px] tracking-[0.24px] ${sortField === 'name' ? 'font-bold text-[#232222]' : 'text-[#7d7d7d]'}`}
                >
                  Name
                </span>
                <SortIndicator
                  direction={sortDirection}
                  isActive={sortField === 'name'}
                />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4 md:gap-[30px]">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px]">
            <div className="flex items-center gap-[8px]">
              <button
                className="flex cursor-pointer items-center gap-[8px]"
                onClick={() => handleSort('expiry')}
                type="button"
              >
                <span
                  className={`font-sans text-[12px] tracking-[0.24px] ${sortField === 'expiry' ? 'font-bold text-[#232222]' : 'text-[#7d7d7d]'}`}
                >
                  Expiry
                </span>
                <SortIndicator
                  direction={sortDirection}
                  isActive={sortField === 'expiry'}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col">
        {match({ isLoading, names })
          .with({ isLoading: true }, () => (
            <>
              <div className="border-[lightgrey] border-b-[0.41px] py-[24px]">
                <NameRowSkeleton />
              </div>
              <div className="border-[lightgrey] border-b-[0.41px] py-[24px]">
                <NameRowSkeleton />
              </div>
              <div className="py-[24px]">
                <NameRowSkeleton />
              </div>
            </>
          ))
          .with({ names: P.when((n) => n.length === 0) }, () => (
            <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
              No names found
            </div>
          ))
          .otherwise(({ names }) =>
            names.map((name, index) => {
              const label = resolveDomainLabel(name)
              const expiryDate = toDateFromSeconds(name.expiryDate ?? null)
              const daysUntilExpiry = getDaysUntil(expiryDate)
              const expiringSoon = isExpiringSoon(
                expiryDate,
                30,
                daysUntilExpiry,
              )
              const formattedExpiryDate = formatDashboardDate(expiryDate)
              const isPrimary =
                primaryLabel !== undefined &&
                label.toLowerCase() === primaryLabel?.toLowerCase()
              const avatarUrl =
                avatarQueries[index]?.data ?? name.resolver?.avatar ?? undefined
              const favorited = isFavorite(label)

              return (
                <div
                  className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
                  key={name.id}
                >
                  {isPrimary && (
                    <div className="mb-[10px] px-[24px]">
                      <PrimaryBadge />
                    </div>
                  )}

                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <NameRow
                      avatarUrl={avatarUrl}
                      isFavorite={favorited}
                      label={label}
                      onToggleFavorite={() => toggleFavorite(label)}
                    />

                    <div className="flex items-start gap-4 md:gap-[30px]">
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:gap-[4px]">
                        <div className="flex flex-col items-start">
                          <span className="font-sans text-[#515151] text-[12px] leading-[1.6] md:text-[14px] md:leading-[1.8]">
                            {formattedExpiryDate}
                          </span>
                        </div>
                        <div className="flex items-center justify-center gap-[3.28px]">
                          <Link
                            className="flex items-center gap-[4.92px] text-[#0080bc]"
                            onClick={(event) => {
                              event.preventDefault()
                              toast('Renewal coming soon')
                            }}
                            to="/auto-renewal"
                          >
                            <span className="font-sans text-[11px] leading-[1.6] md:text-[12px] md:leading-[1.8]">
                              Extend
                            </span>
                            <ArrowRight
                              className="size-[6px] md:size-[7.538px]"
                              strokeWidth={3}
                            />
                          </Link>
                        </div>
                        {expiringSoon && daysUntilExpiry !== null && (
                          <div className="flex items-center gap-[3px] rounded-[20px] bg-[#fff8f0] p-[3px] md:gap-[4px] md:p-[4px]">
                            <CircleAlert
                              className="size-[10px] text-[#e3a531] md:size-[12px]"
                              strokeWidth={2}
                            />
                            <span className="font-sans text-[#c68a1b] text-[10px] leading-[1.05] tracking-[0.2px] md:text-[12px] md:tracking-[0.24px]">
                              Expires in {daysUntilExpiry} days
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            }),
          )}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-3 md:gap-[12px]">
          <button
            className="flex items-center gap-1 rounded-[6px] border border-[#d3d3d3] px-3 py-1 text-[#7d7d7d] text-[11px] disabled:border-[#f0f0f0] disabled:text-[#d3d3d3] md:text-[12px]"
            disabled={isLoading || page === 1}
            onClick={handlePrev}
            type="button"
          >
            <ChevronLeft className="size-[14px]" />
            <span>Previous</span>
          </button>
          {hasNextPage && (
            <button
              className="flex items-center gap-1 rounded-[6px] border border-[#d3d3d3] px-3 py-1 text-[#7d7d7d] text-[11px] disabled:border-[#f0f0f0] disabled:text-[#d3d3d3] md:text-[12px]"
              disabled={isLoading}
              onClick={handleNext}
              type="button"
            >
              <span>Next</span>
              <ChevronRight className="size-[14px]" />
            </button>
          )}
        </div>
        <span className="text-center font-sans text-[#7d7d7d] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
          Showing your names
        </span>
      </div>
    </div>
  )
}
