import { Trans } from '@lingui/react/macro'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Mountain } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import { profileAvatarRecordsQuery } from '@/features/profile/service/profileAvatarRecords'
import { profileOwnerQuery } from '@/features/profile/service/profileOwner'
import type { ProfileRecordsResult } from '@/features/profile/service/profileRecords'
import { getV1RenewableQueryOptions } from '@/features/renew/data/queries/v1Renewable.query'
import type { NameVersion, SortDir } from '../mergedNames'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import {
  canRenewFavorite,
  type FavoriteMetadata,
  filterFavoritesBySearch,
  filterFavoritesByVersion,
  getFavoriteLookupBatches,
  getFavoriteMetadata,
  getFavoriteResolutionState,
  getFavoriteVersionFallbacks,
  getFavoriteVersions,
  paginateFavorites,
  shouldCheckFavoriteV1Renewal,
  sortFavorites,
  toLocalEntry,
} from '../service/queries/favorites.helpers'
import {
  favoriteReadOptions,
  getFavoriteDetailsQueryOptions,
} from '../service/queries/getFavoriteDetails'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { DashboardPagination } from './DashboardPagination'
import { NameRow } from './NameRow'
import { getNameRowProfilePreview } from './nameRowProfileRecords'

export type FavoritesSortField = 'name' | 'addedAt'
export type FavoritesSort = `${FavoritesSortField}-${'asc' | 'desc'}`

interface FavoritesListProps {
  readonly searchQuery?: string
  readonly version?: NameVersion | null
  readonly sort: FavoritesSort
  readonly isAuthenticated: boolean
}

const PAGE_SIZE = 5

const NameRowSkeleton = () => (
  <div className="flex items-center gap-4">
    <div className="size-6.5 shrink-0 animate-pulse rounded bg-gray-200" />
    <div className="size-8.5 shrink-0 animate-pulse rounded-sm bg-gray-200" />
    <div className="h-7 w-37.5 animate-pulse rounded-xs bg-gray-200" />
  </div>
)

const parseSort = (
  sort: FavoritesSort,
): { field: FavoritesSortField; direction: SortDir } => {
  const [field, direction] = sort.split('-') as [FavoritesSortField, SortDir]
  return { field, direction }
}

const FavoriteNameRow = ({
  label,
  metadata,
  protocol,
  profileRecords,
  isProfileRecordsLoading,
  onToggleFavorite,
}: {
  readonly label: string
  readonly protocol?: NameVersion
  readonly metadata?: FavoriteMetadata
  readonly profileRecords?: Pick<ProfileRecordsResult, 'texts'> | null
  readonly isProfileRecordsLoading: boolean
  readonly onToggleFavorite: () => void
}) => {
  const preview = getNameRowProfilePreview({
    label,
    records: profileRecords,
    isLoading: isProfileRecordsLoading,
  })

  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  useQuery({
    ...profileOwnerQuery(label),
    ...favoriteReadOptions,
    enabled: isOptionsOpen && protocol === undefined,
  })
  const v1Renewable = useQuery({
    ...getV1RenewableQueryOptions(label),
    ...favoriteReadOptions,
    enabled: isOptionsOpen && shouldCheckFavoriteV1Renewal(label, protocol),
  })

  return (
    <NameRow
      avatarPending={preview.isAvatarPending}
      avatarRecord={preview.avatarRecord}
      canRenew={canRenewFavorite(
        label,
        protocol,
        metadata?.expiryDate,
        v1Renewable.data === true,
        new Date(),
      )}
      expiryLabel={metadata?.expiryLabel}
      isAuthenticated
      isFavorite
      isInGrace={metadata?.isInGrace}
      label={label}
      onOptionsOpenChange={setIsOptionsOpen}
      onToggleFavorite={onToggleFavorite}
      renewalProtocol={protocol}
      showFavoriteButton
      status={protocol === 'v1' ? 'ensv1' : null}
      themeColor={preview.themeColor}
    />
  )
}

export const FavoritesList = ({
  searchQuery = '',
  version = null,
  sort,
  isAuthenticated,
}: FavoritesListProps) => {
  const shouldReduceMotion = useReducedMotion()
  const [page, setPage] = useState(1)
  const { field: sortField, direction: sortDirection } = parseSort(sort)

  const filterKey = `${searchQuery} ${sort} ${version}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const { data: apiFavorites = [], isLoading } = useQuery({
    ...favoritesQueryOptions,
    enabled: isAuthenticated,
  })
  const favorites = apiFavorites.map(toLocalEntry)
  const favoritesCount = apiFavorites.length
  const removeMutation = useMutation(removeFavoriteMutationOptions)

  const toggleFavorite = (label: string) => {
    removeMutation.mutate({ name: label })
  }

  const searchedFavorites = filterFavoritesBySearch(favorites, searchQuery)
  const lookupBatches = getFavoriteLookupBatches(
    favorites.map(({ label }) => label),
  )
  const lookupQueries = useQueries({
    queries: lookupBatches.map(getFavoriteDetailsQueryOptions),
  })
  const metadata = getFavoriteMetadata(
    lookupQueries.flatMap((query) => query.data ?? []),
    new Date(),
  )
  const pendingNames = new Set(
    lookupQueries.flatMap((query, index) =>
      query.isPending ? (lookupBatches[index] ?? []) : [],
    ),
  )
  // Disabled observers retain cached versions when the filter clears.
  // Fetch missing versions only when the user filters or opens a row menu.
  const versionFallbacks = getFavoriteVersionFallbacks(
    searchedFavorites,
    metadata,
    pendingNames,
  )
  const versionQueries = useQueries({
    queries: versionFallbacks.map(({ label }) => ({
      ...profileOwnerQuery(label),
      ...favoriteReadOptions,
      enabled: version !== null,
    })),
  })
  const fallbackReads = versionFallbacks.map(({ label }, index) => ({
    name: label,
    protocol: versionQueries[index]?.data?.protocol,
    isPending: versionQueries[index]?.isPending ?? false,
    isError: versionQueries[index]?.isError ?? false,
  }))
  const resolution = getFavoriteResolutionState(
    searchedFavorites,
    pendingNames,
    fallbackReads,
  )
  const isVersionPending = version !== null && resolution.isPending
  const isVersionError = resolution.isError
  const versions = getFavoriteVersions(metadata, fallbackReads)

  const sortedFiltered = sortFavorites(
    filterFavoritesByVersion(searchedFavorites, version, versions),
    sortField,
    sortDirection,
  )

  const totalCount = sortedFiltered.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedData = paginateFavorites(
    sortedFiltered,
    currentPage,
    PAGE_SIZE,
  )
  const paginatedFavorites = paginatedData.favorites
  const pageProfileRecords = useQueries({
    queries: paginatedFavorites.map(({ label }) =>
      profileAvatarRecordsQuery(label),
    ),
    combine: (results) =>
      results.map((result) => ({
        records: result.data,
        isLoading: result.isLoading,
      })),
  })

  return (
    <div className="w-full">
      <div className="flex w-full flex-col">
        {isVersionPending && (
          <p
            className="py-4 text-center text-muted-foreground text-sm"
            role="status"
          >
            <Trans>Loading...</Trans>
          </p>
        )}
        {isVersionError && (
          <p
            className="py-4 text-center text-muted-foreground text-sm"
            role="alert"
          >
            <Trans>Some names could not be loaded</Trans>
          </p>
        )}
        {match({
          isLoading,
          isVersionPending,
          isVersionError,
          paginatedFavorites,
          favoritesCount,
        })
          .with(
            P.union(
              { isLoading: true },
              {
                isVersionPending: true,
                paginatedFavorites: P.when(
                  (favorites) => favorites.length === 0,
                ),
              },
            ),
            () => (
              <>
                <div className="border-ens-quartz-250 border-b-[0.41px] py-6">
                  <NameRowSkeleton />
                </div>
                <div className="border-ens-quartz-250 border-b-[0.41px] py-6">
                  <NameRowSkeleton />
                </div>
                <div className="py-6">
                  <NameRowSkeleton />
                </div>
              </>
            ),
          )
          .with(
            {
              isVersionError: true,
              paginatedFavorites: P.when((favorites) => favorites.length === 0),
            },
            () => null,
          )
          .with({ favoritesCount: 0 }, () => (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain
                className="size-12 text-ens-gray-three"
                strokeWidth={1}
              />
              <span className="font-sans text-muted-foreground text-sm">
                <Trans>No favorites to display</Trans>
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
                <Trans>No favorites to display</Trans>
              </span>
            </div>
          ))
          .otherwise(({ paginatedFavorites }) =>
            paginatedFavorites.map((fav, index) => (
              <motion.div
                className="border-ens-quartz-250 border-b-[0.5px] py-8 first:pt-0 last:border-none md:first:pt-8"
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
                <FavoriteNameRow
                  isProfileRecordsLoading={
                    pageProfileRecords[index]?.isLoading ?? false
                  }
                  label={fav.label}
                  metadata={metadata.get(fav.label)}
                  onToggleFavorite={() => toggleFavorite(fav.label)}
                  profileRecords={pageProfileRecords[index]?.records}
                  protocol={versions.get(fav.label)}
                />
              </motion.div>
            )),
          )}
      </div>

      {totalCount > 0 && (
        <DashboardPagination
          currentPage={currentPage}
          disabled={isLoading || isVersionPending}
          onPageChange={setPage}
          rangeEnd={paginatedData.endIndex}
          rangeStart={paginatedData.startIndex}
          total={totalCount}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
