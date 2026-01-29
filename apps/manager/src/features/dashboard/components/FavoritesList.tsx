import { OrderDirection } from '@ens-apps/indexer'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronLeft, ChevronRight, Mountain } from 'lucide-react'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
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
        className={`size-[8.2px] rotate-180 ${direction === OrderDirection.Asc ? 'text-ens-blue' : 'text-[#d7d7d7]'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === OrderDirection.Desc ? 'text-ens-blue' : 'text-[#d7d7d7]'}`}
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
  const [hasInteracted, setHasInteracted] = useState(false)

  const { data: apiFavorites = [], isLoading } = useQuery(favoritesQueryOptions)
  const favorites = apiFavorites.map(toLocalEntry)
  const favoritesCount = apiFavorites.length
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const toggleFavorite = (label: string) => {
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

  const recordsQueries = useQueries({
    queries: paginatedFavorites.map((fav) => ({
      ...profileRecordsQuery(fav.label),
      select: (
        data: { texts: Array<{ key: string; value: string }> } | undefined,
      ) => data?.texts.find((text) => text.key === 'avatar')?.value,
    })),
  })

  const avatarQueries = useQueries({
    queries: recordsQueries.map((query) =>
      parseAvatarQuery(query.data ?? undefined),
    ),
  })

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
    setHasInteracted(true)
    if (sortField === field) {
      setSortDirection((prev) =>
        prev === OrderDirection.Desc ? OrderDirection.Asc : OrderDirection.Desc,
      )
    } else {
      setSortField(field)
      setSortDirection(OrderDirection.Asc)
    }
  }

  return (
    <div className="w-full">
      {/* Mobile Sort Dropdown */}
      <div className="mb-4 flex md:hidden">
        <div className="flex h-8 items-center gap-1 rounded-full border border-[#e0e0e0] bg-white px-2">
          <span className="font-sans text-[#232222] text-[12px] tracking-[0.24px]">
            Sort by
          </span>
          <select
            className="bg-transparent font-medium font-sans text-[#232222] text-[12px] tracking-[0.24px] outline-none"
            onChange={(e) => {
              setHasInteracted(true)
              const [field, direction] = e.target.value.split('-') as [
                SortField,
                'asc' | 'desc',
              ]
              setSortField(field)
              setSortDirection(
                direction === 'asc' ? OrderDirection.Asc : OrderDirection.Desc,
              )
            }}
            value={`${sortField}-${sortDirection === OrderDirection.Asc ? 'asc' : 'desc'}`}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="addedAt-asc">Date added (Oldest)</option>
            <option value="addedAt-desc">Date added (Newest)</option>
          </select>
        </div>
      </div>

      {/* Desktop Sort Header */}
      <div className="hidden w-full md:flex md:items-center md:justify-between">
        <button
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => handleSort('name')}
          type="button"
        >
          <span
            className={`font-sans text-sm tracking-[0.24px] ${hasInteracted && sortField === 'name' ? 'text-[#232222]' : 'text-[#7d7d7d]'}`}
          >
            Name
          </span>
          <SortIndicator
            direction={sortDirection}
            isActive={hasInteracted && sortField === 'name'}
          />
        </button>
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
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain className="size-12 text-[#d1d1d1]" strokeWidth={1} />
              <span className="font-sans text-[#8c8c8c] text-sm">
                No names to display
              </span>
            </div>
          ))
          .with({ paginatedFavorites: P.when((f) => f.length === 0) }, () => (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain className="size-12 text-[#d1d1d1]" strokeWidth={1} />
              <span className="font-sans text-[#8c8c8c] text-sm">
                No names to display
              </span>
            </div>
          ))
          .otherwise(({ paginatedFavorites }) =>
            paginatedFavorites.map((fav, index) => {
              const avatarUrl = avatarQueries[index]?.data ?? undefined

              return (
                <div
                  className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
                  key={fav.label}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <NameRow
                      avatarUrl={avatarUrl}
                      isFavorite={true}
                      label={fav.label}
                      onToggleFavorite={() => toggleFavorite(fav.label)}
                      showFavoriteButton={true}
                    />
                  </div>
                </div>
              )
            }),
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
                      ? 'bg-[#e5f7ff] font-medium text-ens-blue'
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
                    ? 'bg-[#e5f7ff] font-medium text-ens-blue'
                    : 'text-[#bcbcbc]'
                }`}
                type="button"
              >
                {totalPages}
              </button>
            )}

            <button
              className="flex size-[32px] items-center justify-center rounded-full text-ens-blue disabled:text-[#e0e0e0]"
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
