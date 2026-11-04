import {
  type LookupResult,
  toDate,
  toProtocol,
} from '@ens-apps/indexer/bigname'
import { match, P } from 'ts-pattern'
import { getServedExpiryStatus } from '@/features/grace/utils/gracePeriod'
import {
  canRenewV2Name,
  resolveRenewalLabel,
} from '@/features/renew/utils/renewableName'
import type { NameVersion, SortDir } from '../../mergedNames'
import { formatDashboardDate, NON_EXPIRING_DATE_LABEL } from '../../utils'
import type { FavoriteEntry as ApiFavoriteEntry } from './getFavorites'

export type FavoriteEntry = {
  readonly label: string
  readonly addedAt: number
}

export const toLocalEntry = (entry: ApiFavoriteEntry): FavoriteEntry => ({
  label: entry.name,
  addedAt: new Date(entry.created_at).getTime(),
})

export const filterFavoritesBySearch = (
  favorites: readonly FavoriteEntry[],
  searchQuery?: string,
): readonly FavoriteEntry[] => {
  if (!searchQuery) return favorites

  const lowerQuery = searchQuery.toLowerCase()
  return favorites.filter((fav) => fav.label.toLowerCase().includes(lowerQuery))
}

export const sortFavorites = (
  favorites: readonly FavoriteEntry[],
  sortField: 'name' | 'addedAt',
  sortDirection: SortDir,
): readonly FavoriteEntry[] => {
  return [...favorites].sort((a, b) => {
    if (sortField === 'name') {
      const comparison = a.label.localeCompare(b.label)
      return sortDirection === 'asc' ? comparison : -comparison
    }
    const comparison = a.addedAt - b.addedAt
    return sortDirection === 'asc' ? comparison : -comparison
  })
}

export type PaginatedFavorites = {
  readonly favorites: readonly FavoriteEntry[]
  readonly totalCount: number
  readonly totalPages: number
  readonly hasNextPage: boolean
  readonly hasPrevPage: boolean
  readonly startIndex: number
  readonly endIndex: number
}

export const paginateFavorites = (
  favorites: readonly FavoriteEntry[],
  page: number,
  pageSize: number,
): PaginatedFavorites => {
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedFavorites = favorites.slice(startIndex, endIndex)
  const totalPages = Math.ceil(favorites.length / pageSize)

  return {
    favorites: paginatedFavorites,
    totalCount: favorites.length,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    startIndex: startIndex + 1,
    endIndex: Math.min(endIndex, favorites.length),
  }
}

export const filterFavoritesByVersion = (
  favorites: readonly FavoriteEntry[],
  version: NameVersion | null,
  versions: ReadonlyMap<string, NameVersion | null | undefined>,
): readonly FavoriteEntry[] =>
  version === null
    ? favorites
    : favorites.filter(({ label }) => versions.get(label) === version)

export type FavoriteMetadata = {
  readonly protocol: NameVersion | null
  readonly expiryDate: Date | null
  readonly expiryLabel: string | null
  readonly isInGrace: boolean
}

export const getFavoriteMetadata = (
  results: readonly LookupResult[],
  now: Date,
): ReadonlyMap<string, FavoriteMetadata> =>
  new Map(
    results.flatMap((result) => {
      if (
        !('name' in result.input) ||
        result.status !== 'ok' ||
        !result.record ||
        result.record.read_status !== 'ok'
      )
        return []
      const record = result.record
      // A V1 reservation's top-level expiry belongs to V2; show its V1 lease.
      const expiry = toDate(record.ens_v1?.expires_at ?? record.expires_at)
      const { displayExpiryDate, isInGrace } = getServedExpiryStatus(
        expiry,
        toDate(record.grace_ends_at),
        now,
      )
      return [
        [
          result.input.name,
          {
            protocol: toProtocol(record.authority),
            expiryDate: expiry,
            expiryLabel: match({
              displayExpiryDate,
              reason: record.expires_at_reason,
            })
              .with(
                { displayExpiryDate: P.instanceOf(Date) },
                ({ displayExpiryDate }) =>
                  formatDashboardDate(displayExpiryDate),
              )
              .with({ reason: 'no_expiry' }, () => NON_EXPIRING_DATE_LABEL)
              .otherwise(() => null),
            isInGrace,
          },
        ] as const,
      ]
    }),
  )

export const getFavoriteVersionFallbacks = (
  favorites: readonly FavoriteEntry[],
  metadata: ReadonlyMap<string, FavoriteMetadata>,
  pendingNames: ReadonlySet<string>,
): readonly FavoriteEntry[] =>
  favorites.filter(
    ({ label }) => !pendingNames.has(label) && !metadata.get(label)?.protocol,
  )

export const getFavoriteVersions = (
  metadata: ReadonlyMap<string, FavoriteMetadata>,
  fallbacks: readonly {
    readonly name: string
    readonly protocol?: NameVersion
  }[],
): ReadonlyMap<string, NameVersion | undefined> =>
  new Map([
    ...fallbacks.map(({ name, protocol }) => [name, protocol] as const),
    ...[...metadata].flatMap(([name, { protocol }]) =>
      protocol ? [[name, protocol] as const] : [],
    ),
  ])

const LOOKUP_BATCH_SIZE = 1000

export const getFavoriteLookupBatches = (
  names: readonly string[],
): readonly (readonly string[])[] =>
  Array.from(
    { length: Math.ceil(names.length / LOOKUP_BATCH_SIZE) },
    (_, index) =>
      names.slice(index * LOOKUP_BATCH_SIZE, (index + 1) * LOOKUP_BATCH_SIZE),
  )

export const shouldCheckFavoriteV1Renewal = (
  name: string,
  protocol: NameVersion | undefined,
): boolean => protocol === 'v1' && resolveRenewalLabel(name).isOk()

export const canRenewFavorite = (
  name: string,
  protocol: NameVersion | undefined,
  expiryDate: Date | null | undefined,
  isV1Renewable: boolean,
  now: Date,
): boolean =>
  match(protocol)
    .with(
      'v1',
      () => shouldCheckFavoriteV1Renewal(name, protocol) && isV1Renewable,
    )
    .with('v2', () => canRenewV2Name(name, expiryDate, now))
    .otherwise(() => false)

export const getFavoriteResolutionState = (
  favorites: readonly FavoriteEntry[],
  pendingNames: ReadonlySet<string>,
  fallbacks: readonly {
    readonly name: string
    readonly isPending: boolean
    readonly isError: boolean
  }[],
): { readonly isPending: boolean; readonly isError: boolean } => {
  const reads = new Map(fallbacks.map((read) => [read.name, read]))
  return {
    isPending: favorites.some(
      ({ label }) => pendingNames.has(label) || reads.get(label)?.isPending,
    ),
    isError: favorites.some(({ label }) => reads.get(label)?.isError),
  }
}
