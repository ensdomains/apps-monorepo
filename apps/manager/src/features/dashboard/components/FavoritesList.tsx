import { OrderDirection } from '@ens-apps/indexer'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store/react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { match, P } from 'ts-pattern'
import { useWalletClient } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { signInBackendMutation } from '@/features/notifications/queries/auth'
import { isBackendAuthed } from '@/utils/backend-client'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import {
  filterFavoritesBySearch,
  paginateFavorites,
  sortFavorites,
  toLocalEntry,
} from '../service/queries/favorites.helpers'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { NameRow } from './NameRow'

const NameRowSkeleton = () => (
  <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[12px]">
    <div className="size-[16px] shrink-0 animate-pulse rounded bg-gray-200" />
    <div className="flex items-center gap-2 md:gap-[12px]">
      <div className="size-[32px] shrink-0 animate-pulse rounded-full bg-gray-200 md:size-[36.9px]" />
      <div className="h-[24px] w-[120px] animate-pulse rounded-[2.8px] bg-gray-200 md:w-[150px]" />
    </div>
  </div>
)

interface FavoritesListProps {
  readonly searchQuery?: string
}

type SortIndicatorProps = {
  readonly direction?: OrderDirection
  readonly isActive: boolean
}

type SortField = 'name' | 'addedAt'

const PAGE_SIZE = 5

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

export const FavoritesList = ({ searchQuery = '' }: FavoritesListProps) => {
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<OrderDirection>(
    OrderDirection.Asc,
  )

  const isAuthed = useAtom(isBackendAuthed)
  const { data: walletClient } = useWalletClient()
  const signIn = useMutation(signInBackendMutation)

  const { data: apiFavorites = [], isLoading } = useQuery(favoritesQueryOptions)
  const favorites = apiFavorites.map(toLocalEntry)
  const favoritesCount = apiFavorites.length
  const removeMutation = useMutation(removeFavoriteMutationOptions)

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

    removeMutation.mutate({ name: label })
  }

  const paginatedData = useMemo(() => {
    const filtered = filterFavoritesBySearch(favorites, searchQuery)
    const sorted = sortFavorites(filtered, sortField, sortDirection)
    return paginateFavorites(sorted, page, PAGE_SIZE)
  }, [favorites, searchQuery, sortField, sortDirection, page])

  const paginatedFavorites = paginatedData.favorites
  const totalCount = paginatedData.totalCount
  const totalPages = paginatedData.totalPages
  const hasNextPage = paginatedData.hasNextPage
  const hasPrevPage = paginatedData.hasPrevPage
  const startIndex = paginatedData.startIndex
  const endIndex = paginatedData.endIndex

  const handlePrev = () => {
    if (page > 1) {
      setPage((p) => p - 1)
    }
  }

  const handleNext = () => {
    if (hasNextPage) {
      setPage((p) => p + 1)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) =>
        prev === OrderDirection.Desc ? OrderDirection.Asc : OrderDirection.Desc,
      )
    } else {
      setSortField(field)
      setSortDirection(OrderDirection.Asc)
    }
  }

  const handleSignIn = async () => {
    if (!walletClient) {
      toast.error('Please connect your wallet first')
      return
    }

    try {
      await signIn.mutateAsync({ walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
      toast.error('Failed to sign in. Please try again.')
    }
  }

  if (!isAuthed) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="space-y-4 text-center">
            <div className="space-y-2">
              <h3 className="font-medium text-lg">Sign in to view favorites</h3>
              <p className="text-[#8c8c8c] text-sm">
                Sign in with your wallet to view and manage your favorite ENS
                names.
              </p>
            </div>

            <Button
              className="w-full max-w-[200px]"
              disabled={signIn.isPending || !walletClient}
              onClick={handleSignIn}
            >
              {signIn.isPending ? 'Signing in...' : 'Sign in'}
            </Button>

            {signIn.isError && (
              <p className="text-red-500 text-sm">
                Failed to sign in. Please try again.
              </p>
            )}
            {!walletClient && (
              <p className="text-[#8c8c8c] text-sm">
                Please connect your wallet first.
              </p>
            )}
          </div>
        </div>
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
        <div className="flex items-center gap-[6px]">
          <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
            Receive expiry notifications
          </span>
          <Switch
            checked={false}
            onCheckedChange={() => alert('Coming Soon')}
          />
        </div>
      </div>

      <div className="flex w-full flex-col">
        {match({ isLoading, paginatedFavorites, favoritesCount })
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
          .with({ favoritesCount: 0 }, () => (
            <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
              No favorites yet. Add names to your favorites from the My Names
              tab.
            </div>
          ))
          .with({ paginatedFavorites: P.when((f) => f.length === 0) }, () => (
            <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
              No favorites found
            </div>
          ))
          .otherwise(({ paginatedFavorites }) =>
            paginatedFavorites.map((fav) => (
              <div
                className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
                key={fav.label}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <NameRow
                    isFavorite={true}
                    label={fav.label}
                    onToggleFavorite={() => toggleFavorite(fav.label)}
                  />
                </div>
              </div>
            )),
          )}
      </div>

      {totalCount > 0 && (
        <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-center gap-3 md:gap-[12px]">
            <button
              className="flex size-[32px] items-center justify-center rounded-full text-[#bcbcbc] disabled:text-[#e0e0e0]"
              disabled={isLoading || !hasPrevPage}
              onClick={handlePrev}
              type="button"
            >
              <ChevronLeft className="size-[24px]" strokeWidth={1.5} />
            </button>

            {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => {
              const pageNum = i + 1
              const isActive = page === pageNum
              return (
                <button
                  className={`flex size-[32px] items-center justify-center rounded-[6px] font-sans text-[12px] ${
                    isActive
                      ? 'bg-[#e5f7ff] font-medium text-[#0080bc]'
                      : 'text-[#bcbcbc]'
                  }`}
                  key={pageNum}
                  type="button"
                >
                  {pageNum}
                </button>
              )
            })}

            {totalPages > 4 && (
              <span className="flex size-[32px] items-center justify-center font-sans text-[#bcbcbc] text-[12px]">
                ...
              </span>
            )}

            {totalPages > 3 && (
              <button
                className={`flex size-[32px] items-center justify-center rounded-[6px] font-sans text-[12px] ${
                  page === totalPages
                    ? 'bg-[#e5f7ff] font-medium text-[#0080bc]'
                    : 'text-[#bcbcbc]'
                }`}
                type="button"
              >
                {totalPages}
              </button>
            )}

            <button
              className="flex size-[32px] items-center justify-center rounded-full text-[#0080bc] disabled:text-[#e0e0e0]"
              disabled={isLoading || !hasNextPage}
              onClick={handleNext}
              type="button"
            >
              <ChevronRight className="size-[24px]" strokeWidth={1.5} />
            </button>
          </div>
          <span className="text-center font-sans text-[#7d7d7d] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
            Showing {startIndex}-{endIndex} of {totalCount}
          </span>
        </div>
      )}
    </div>
  )
}
