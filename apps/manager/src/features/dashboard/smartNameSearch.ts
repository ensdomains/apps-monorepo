import {
  getNameExpiryStatus,
  MS_PER_DAY,
} from '@/features/grace/utils/gracePeriod'
import {
  buildMergedNamesList,
  type DashboardV1Name,
  type DashboardV2Name,
  type MergedItem,
  type SortDir,
  type SortField,
} from './mergedNames'

export type SmartNameFilters = {
  readonly expiry?:
    | 'expiring'
    | 'active'
    | 'expired'
    | 'in-grace'
    | 'past-grace'
    | 'non-expiring'
  readonly withinDays?: number
  readonly role?: 'owner' | 'manager'
  readonly version?: 'v1' | 'v2'
  readonly upgrade?: 'eligible' | 'ineligible'
  readonly favorite?: 'yes' | 'no'
  readonly primary?: 'yes' | 'no'
  readonly sort?: `${SortField}-${SortDir}`
}

export type SmartNameFilterKey = Exclude<keyof SmartNameFilters, 'withinDays'>

export const SMART_FILTER_KEYS = [
  'expiry',
  'role',
  'version',
  'upgrade',
  'favorite',
  'primary',
  'sort',
] as const satisfies readonly SmartNameFilterKey[]

export const hasSmartFilters = (filters: SmartNameFilters): boolean =>
  SMART_FILTER_KEYS.some((key) => filters[key] !== undefined)

export const removeSmartFilter = (
  filters: SmartNameFilters,
  key: SmartNameFilterKey,
): SmartNameFilters => {
  const next = { ...filters }
  delete next[key]
  if (key === 'expiry') delete next.withinDays
  return next
}

export const isSmartFilterAvailable = (
  filters: SmartNameFilters,
  options: {
    readonly migrationEnabled: boolean
    readonly isAuthenticated: boolean
  },
): boolean =>
  (filters.upgrade === undefined || options.migrationEnabled) &&
  (filters.favorite === undefined || options.isAuthenticated)

type FilterContext = {
  readonly now: Date
  readonly primaryLabel?: string | null
  readonly favoriteLabels: ReadonlySet<string>
}

const matchesExpiry = (
  item: MergedItem,
  filters: SmartNameFilters,
  now: Date,
): boolean => {
  if (!filters.expiry) return true
  if (filters.expiry === 'non-expiring') return item.sortExpiry === 0
  if (item.sortExpiry === null || item.sortExpiry <= 0) return false

  const expiryDate = new Date(item.sortExpiry * 1000)
  if (Number.isNaN(expiryDate.getTime())) return false
  const status = getNameExpiryStatus(
    expiryDate,
    item.kind === 'v1' ? 'v1' : 'v2',
    now,
  )

  switch (filters.expiry) {
    case 'expiring': {
      const daysUntil = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / MS_PER_DAY,
      )
      return daysUntil > 0 && daysUntil <= (filters.withinDays ?? 30)
    }
    case 'active':
      return expiryDate.getTime() > now.getTime()
    case 'expired':
      return expiryDate.getTime() <= now.getTime()
    case 'in-grace':
      return status.isInGrace
    case 'past-grace':
      return status.isPastGrace
  }
}

export const matchesSmartNameFilters = (
  item: MergedItem,
  filters: SmartNameFilters,
  context: FilterContext,
): boolean => {
  const roles =
    item.kind === 'v1' ? item.classified.nameRoles : item.domain.nameRoles
  const isFavorite = context.favoriteLabels.has(item.sortName.toLowerCase())
  const isPrimary =
    item.kind === 'v2' &&
    !!context.primaryLabel &&
    item.sortName.toLowerCase() === context.primaryLabel.toLowerCase()
  const matchesUpgrade =
    !filters.upgrade ||
    (item.kind === 'v1' &&
      item.classified.isMigrationEligible !== undefined &&
      item.classified.isMigrationEligible === (filters.upgrade === 'eligible'))

  return (
    (!filters.version || item.kind === filters.version) &&
    (!filters.role || !!roles?.includes(filters.role)) &&
    matchesUpgrade &&
    (!filters.favorite || isFavorite === (filters.favorite === 'yes')) &&
    (!filters.primary || isPrimary === (filters.primary === 'yes')) &&
    matchesExpiry(item, filters, context.now)
  )
}

export const buildDashboardSearchResults = (params: {
  readonly v2Names: readonly DashboardV2Name[]
  readonly v1Classified: readonly DashboardV1Name[]
  readonly searchQuery: string
  readonly sortField: SortField
  readonly sortDir: SortDir
  readonly smartFilters?: SmartNameFilters | null
  readonly primaryLabel?: string | null
  readonly favoriteLabels: ReadonlySet<string>
  readonly now?: Date
}): MergedItem[] => {
  const { smartFilters } = params
  const sort = smartFilters?.sort?.split('-') as
    | [SortField, SortDir]
    | undefined
  const items = buildMergedNamesList({
    v2Names: params.v2Names,
    v1Classified: params.v1Classified,
    searchQuery: smartFilters ? '' : params.searchQuery,
    sortField: sort?.[0] ?? params.sortField,
    sortDir: sort?.[1] ?? params.sortDir,
  })
  if (!smartFilters) return items
  const context = {
    now: params.now ?? new Date(),
    primaryLabel: params.primaryLabel,
    favoriteLabels: params.favoriteLabels,
  }
  return items.filter((item) =>
    matchesSmartNameFilters(item, smartFilters, context),
  )
}
