import { OrderDirection } from '@ens-apps/indexer'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  CircleArrowLeft,
  CircleArrowRight,
  Mountain,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
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
        <ChevronDown className="size-[8.2px] rotate-180 text-ens-gray-three" />
        <ChevronDown className="size-[8.2px] text-ens-gray-three" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <ChevronDown
        className={`size-[8.2px] rotate-180 ${direction === OrderDirection.Asc ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === OrderDirection.Desc ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
    </div>
  )
}

export const FavoritesList = ({ searchQuery = '' }: FavoritesListProps) => {
  const { t } = useLingui()
  const shouldReduceMotion = useReducedMotion()
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDirection, setSortDirection] = useState<OrderDirection | null>(
    null,
  )

  const { data: apiFavorites = [], isLoading } = useQuery(favoritesQueryOptions)
  const favorites = apiFavorites.map(toLocalEntry)
  const favoritesCount = apiFavorites.length
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const toggleFavorite = (label: string) => {
    removeMutation.mutate({ name: label })
  }

  const paginatedData = useMemo(() => {
    const filtered = filterFavoritesBySearch(favorites, searchQuery)
    const sorted = sortDirection
      ? sortFavorites(filtered, sortField, sortDirection)
      : filtered
    return paginateFavorites(sorted, page, PAGE_SIZE)
  }, [favorites, searchQuery, sortField, sortDirection, page])

  const paginatedFavorites = paginatedData.favorites
  const totalCount = paginatedData.totalCount
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
    if (sortField === field && sortDirection !== null) {
      setSortDirection((prev) =>
        prev === OrderDirection.Desc ? OrderDirection.Asc : OrderDirection.Desc,
      )
    } else {
      setSortField(field)
      setSortDirection(OrderDirection.Asc)
    }
    setPage(1)
  }

  return (
    <div className="w-full">
      {/* Mobile Sort Dropdown */}
      <div className="mb-4 flex md:hidden">
        <div className="flex h-8 items-center gap-1 rounded-full border border-border bg-white px-2">
          <span className="font-sans text-foreground text-xs tracking-[0.24px]">
            <Trans>Sort by</Trans>
          </span>
          <select
            aria-label={t`Sort favorites by`}
            className="bg-transparent font-medium font-sans text-foreground text-xs tracking-[0.24px] outline-none"
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-') as [
                SortField,
                'asc' | 'desc',
              ]
              setSortField(field)
              setSortDirection(
                direction === 'asc' ? OrderDirection.Asc : OrderDirection.Desc,
              )
              setPage(1)
            }}
            value={
              sortDirection
                ? `${sortField}-${sortDirection === OrderDirection.Asc ? 'asc' : 'desc'}`
                : 'name-asc'
            }
          >
            <option value="name-asc">
              <Trans>Name (A-Z)</Trans>
            </option>
            <option value="name-desc">
              <Trans>Name (Z-A)</Trans>
            </option>
            <option value="addedAt-asc">
              <Trans>Date added (Oldest)</Trans>
            </option>
            <option value="addedAt-desc">
              <Trans>Date added (Newest)</Trans>
            </option>
          </select>
        </div>
      </div>

      {/* Desktop Sort Header */}
      <div className="hidden w-full md:flex md:items-center md:justify-between">
        <button
          aria-label={t`Sort by name, currently ${sortDirection !== null && sortField === 'name' ? sortDirection : 'unsorted'}`}
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => handleSort('name')}
          type="button"
        >
          <span
            className={`font-sans text-[16px] tracking-[0.24px] ${sortDirection !== null && sortField === 'name' ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            <Trans>Name</Trans>
          </span>
          <SortIndicator
            direction={sortDirection ?? undefined}
            isActive={sortDirection !== null && sortField === 'name'}
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
              <Mountain
                className="size-12 text-ens-gray-three"
                strokeWidth={1}
              />
              <span className="font-sans text-muted-foreground text-sm">
                <Trans>No names to display</Trans>
              </span>
            </div>
          ))
          .with({ paginatedFavorites: P.when((f) => f.length === 0) }, () => (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain
                className="size-12 text-ens-gray-three"
                strokeWidth={1}
              />
              <span className="font-sans text-muted-foreground text-sm">
                <Trans>No names to display</Trans>
              </span>
            </div>
          ))
          .otherwise(({ paginatedFavorites }) =>
            paginatedFavorites.map((fav, index) => {
              const avatarUrl = avatarQueries[index]?.data ?? undefined

              return (
                <motion.div
                  className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
                  key={fav.label}
                  {...(shouldReduceMotion
                    ? {}
                    : {
                        initial: { opacity: 0, y: 6 },
                        animate: { opacity: 1, y: 0 },
                        transition: {
                          duration: 0.2,
                          ease: [0.25, 0.46, 0.45, 0.94] as const,
                          delay: index * 0.04,
                        },
                      })}
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
                </motion.div>
              )
            }),
          )}
      </div>

      {totalCount > 0 && (
        <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-center gap-[12px]">
            <button
              aria-label={t`Previous page`}
              className="flex size-[32px] items-center justify-center text-ens-gray-three disabled:text-border"
              disabled={isLoading || !hasPrevPage}
              onClick={handlePrev}
              type="button"
            >
              <CircleArrowLeft className="size-[32px]" strokeWidth={1} />
            </button>
            <button
              aria-label={t`Next page`}
              className="flex size-[32px] items-center justify-center text-ens-blue disabled:text-border"
              disabled={isLoading || !hasNextPage}
              onClick={handleNext}
              type="button"
            >
              <CircleArrowRight className="size-[32px]" strokeWidth={1} />
            </button>
          </div>
          <span className="font-sans text-[16px] text-muted-foreground leading-[1.2] tracking-[0.14px]">
            <Trans>
              Showing {startIndex}-{endIndex} of {totalCount}
            </Trans>
          </span>
        </div>
      )}
    </div>
  )
}
