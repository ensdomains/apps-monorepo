import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import { MSymbol } from '@/components/ui/material-symbol'
import { BulkRenewDialog, type BulkRenewName } from '@/features/bulk-renew'
import { isBackendAuthed } from '@/utils/backend-client'
import {
  selectionKey,
  toBulkRenewName,
  toSelectableDomain,
} from '../bulkRenewSelection'
import {
  getMergedNamesCount,
  type SortDir,
  type SortField,
} from '../mergedNames'
import {
  type InterpretNameSearchResult,
  interpretNameSearch,
} from '../service/interpretNameSearch'
import { looksLikeJevNameSearchRequest } from '../service/jevNameSearch'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import {
  buildDashboardSearchResults,
  hasSmartFilters,
  isSmartFilterAvailable,
  removeSmartFilter,
  SMART_FILTER_KEYS,
  type SmartNameFilterKey,
  type SmartNameFilters,
} from '../smartNameSearch'
import { useDashboardV1Names } from '../useDashboardV1Names'
import { useOwnedDomains } from '../useOwnedDomains'
import {
  FavoritesList,
  type FavoritesSort,
  type FavoritesSortField,
} from './FavoritesList'
import { type FilterChipDef, FilterChips } from './FilterChips'
import { MyNamesList, type Sort } from './MyNamesList'
import { SelectionCheckbox } from './SelectionCheckbox'
import { SortMenu, type SortOption } from './SortMenu'

type FilterKey = 'owned' | 'favorites'
type SmartSearchMessage = 'unsupported' | 'unavailable' | 'missing-data'

interface NamesTableProps {
  readonly primaryLabel?: string | null
  readonly migrationEnabled?: boolean
}

type DirectionalSort<Field extends string> = `${Field}-${SortDir}`

const parseDirectionalSort = <Field extends string>(
  sort: DirectionalSort<Field>,
): { field: Field; dir: SortDir } => {
  const [field, dir] = sort.split('-') as [Field, SortDir]
  return { field, dir }
}

const toDirectionalSort = <Field extends string>(
  field: Field,
  dir: SortDir,
): DirectionalSort<Field> => `${field}-${dir}` as DirectionalSort<Field>

const reverseSortDir = (dir: SortDir): SortDir =>
  dir === 'asc' ? 'desc' : 'asc'

const shouldInterpretSearch = (
  event: KeyboardEvent<HTMLInputElement>,
  activeFilter: FilterKey,
  query: string,
): boolean =>
  event.key === 'Enter' &&
  import.meta.env.DEV &&
  activeFilter === 'owned' &&
  looksLikeJevNameSearchRequest(query.trim())

const SmartSearchFeedback = ({
  query,
  active,
  filters,
  message,
  pending,
}: {
  readonly query: string
  readonly active: boolean
  readonly filters: SmartNameFilters | null
  readonly message: SmartSearchMessage | null
  readonly pending: boolean
}) => (
  <>
    {import.meta.env.DEV &&
    active &&
    looksLikeJevNameSearchRequest(query) &&
    !filters &&
    !message &&
    !pending ? (
      <p className="mt-1 pl-3 font-sans text-muted-foreground text-xs">
        <Trans>Press Enter to search by status</Trans>
      </p>
    ) : null}
    <div
      aria-live="polite"
      className="mt-1 pl-3 font-sans text-muted-foreground text-xs"
    >
      {pending ? <Trans>Interpreting search…</Trans> : null}
      {!pending && message === 'unsupported' ? (
        <Trans>
          Could not interpret this request. Try a name or a supported status.
        </Trans>
      ) : null}
      {!pending && message === 'unavailable' ? (
        <Trans>Smart search is unavailable. Name search still works.</Trans>
      ) : null}
      {!pending && message === 'missing-data' ? (
        <Trans>
          This filter needs upgrade or favorites data that is unavailable here.
        </Trans>
      ) : null}
    </div>
  </>
)

export const NamesTable = ({
  migrationEnabled = false,
  primaryLabel,
}: NamesTableProps) => {
  const { t } = useLingui()
  const [filter, setFilter] = useState<FilterKey>('owned')
  const [searchQuery, setSearchQuery] = useState('')
  const [smartFilters, setSmartFilters] = useState<SmartNameFilters | null>(
    null,
  )
  const [smartMessage, setSmartMessage] = useState<SmartSearchMessage | null>(
    null,
  )
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const requestId = useRef(0)
  const interpretMutation = useMutation({
    mutationFn: (query: string) => interpretNameSearch({ data: { query } }),
  })
  const [ownedSort, setOwnedSort] = useState<Sort>('name-asc')
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSort>('name-asc')
  const effectiveOwnedSort = smartFilters?.sort ?? ownedSort
  const ownedSortState = parseDirectionalSort<SortField>(effectiveOwnedSort)
  const favoritesSortState =
    parseDirectionalSort<FavoritesSortField>(favoritesSort)
  const shouldReduceMotion = useReducedMotion()
  const isAuthed = useAtom(isBackendAuthed)
  const activeFilter = !isAuthed && filter === 'favorites' ? 'owned' : filter

  const { v2Names } = useOwnedDomains()
  const { data: favorites = [] } = useQuery({
    ...favoritesQueryOptions,
    enabled: isAuthed,
  })

  const { v1Names, isError: isV1Error } = useDashboardV1Names({
    migrationEnabled,
  })

  const favoritesCount = favorites.length
  const ownedCount = isV1Error
    ? undefined
    : getMergedNamesCount({ v2Names, v1Classified: v1Names })

  const favoriteLabels = useMemo(
    () => new Set(favorites.map((entry) => entry.name.toLowerCase())),
    [favorites],
  )

  const clearSmartSearch = () => {
    requestId.current += 1
    setSmartFilters(null)
    setSmartMessage(null)
    setPendingQuery(null)
  }

  const onSearchChange = (value: string) => {
    clearSmartSearch()
    setSearchQuery(value)
  }

  const applyInterpretationResult = (result: InterpretNameSearchResult) => {
    if (result.status !== 'ok') {
      setSmartMessage(result.status)
      return
    }
    if (
      !isSmartFilterAvailable(result.filters, {
        migrationEnabled,
        isAuthenticated: isAuthed,
      })
    ) {
      setSmartMessage('missing-data')
      return
    }
    setSmartFilters(result.filters)
  }

  const onSearchKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (!shouldInterpretSearch(event, activeFilter, searchQuery)) return
    const query = searchQuery.trim()
    event.preventDefault()
    clearSmartSearch()
    if (query.length < 2 || query.length > 160) {
      setSmartMessage('unsupported')
      return
    }
    const currentRequest = ++requestId.current
    setPendingQuery(query)
    try {
      const result = await interpretMutation.mutateAsync(query)
      if (currentRequest !== requestId.current) return
      applyInterpretationResult(result)
    } catch {
      if (currentRequest === requestId.current) setSmartMessage('unavailable')
    } finally {
      if (currentRequest === requestId.current) setPendingQuery(null)
    }
  }

  const removeChip = (key: SmartNameFilterKey) => {
    if (!smartFilters) return
    const next = removeSmartFilter(smartFilters, key)
    if (hasSmartFilters(next)) {
      setSmartFilters(next)
    } else {
      clearSmartSearch()
      setSearchQuery('')
    }
  }

  const expiryChipLabel = (): string => {
    switch (smartFilters?.expiry) {
      case 'expiring':
        return t`Expires within ${smartFilters.withinDays ?? 30} days`
      case 'active':
        return t`Active`
      case 'expired':
        return t`Expired`
      case 'in-grace':
        return t`In grace period`
      case 'past-grace':
        return t`Past grace period`
      case 'non-expiring':
        return t`Does not expire`
    }
    return ''
  }

  const sortChipLabel = (): string => {
    switch (smartFilters?.sort) {
      case 'name-asc':
        return t`Name A to Z`
      case 'name-desc':
        return t`Name Z to A`
      case 'created-asc':
        return t`Oldest first`
      case 'created-desc':
        return t`Newest first`
      case 'expiry-asc':
        return t`Soonest expiry first`
      case 'expiry-desc':
        return t`Latest expiry first`
    }
    return ''
  }

  const smartChipLabel = (key: SmartNameFilterKey): string => {
    if (!smartFilters) return ''
    const labels: Record<SmartNameFilterKey, string> = {
      expiry: expiryChipLabel(),
      role: smartFilters.role === 'owner' ? t`Owner` : t`Manager`,
      version: smartFilters.version === 'v1' ? t`ENSv1` : t`ENSv2`,
      upgrade:
        smartFilters.upgrade === 'eligible'
          ? t`Eligible for upgrade`
          : t`Not eligible for upgrade`,
      favorite:
        smartFilters.favorite === 'yes' ? t`Favorites` : t`Not favorites`,
      primary:
        smartFilters.primary === 'yes' ? t`Primary name` : t`Not primary`,
      sort: sortChipLabel(),
    }
    return labels[key]
  }

  const [selectedLabels, setSelectedLabels] = useState<ReadonlySet<string>>(
    new Set(),
  )

  // Only renewable v2 2LD .eth names are selectable — v1 names and subnames are
  // ignored for selection/renewal (subnames have no renewal price).
  const allOwnedLabels = useMemo(
    () =>
      buildDashboardSearchResults({
        v2Names,
        v1Classified: [],
        searchQuery,
        sortField: ownedSortState.field,
        sortDir: ownedSortState.dir,
        smartFilters,
        primaryLabel,
        favoriteLabels,
      }).flatMap((item) =>
        item.kind === 'v2' &&
        toBulkRenewName(toSelectableDomain(item.domain)) !== null
          ? [selectionKey(item.domain)]
          : [],
      ),
    [
      v2Names,
      searchQuery,
      ownedSortState.field,
      ownedSortState.dir,
      smartFilters,
      primaryLabel,
      favoriteLabels,
    ],
  )

  const [isRenewOpen, setIsRenewOpen] = useState(false)

  const selectedCount = selectedLabels.size
  const allSelected =
    allOwnedLabels.length > 0 &&
    allOwnedLabels.every((label) => selectedLabels.has(label))
  const someSelected = selectedCount > 0

  const selectedNames = useMemo<BulkRenewName[]>(
    () =>
      v2Names
        .filter((domain) => selectedLabels.has(selectionKey(domain)))
        .map((domain) => toBulkRenewName(toSelectableDomain(domain)))
        .filter((name): name is BulkRenewName => name !== null),
    [v2Names, selectedLabels],
  )

  const onToggleSelect = (label: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  // Toggle only the currently-visible names, preserving any selections made
  // under a different search/filter.
  const onToggleSelectAll = () => {
    setSelectedLabels((prev) => {
      const allIn =
        allOwnedLabels.length > 0 &&
        allOwnedLabels.every((label) => prev.has(label))
      const next = new Set(prev)
      for (const label of allOwnedLabels) {
        if (allIn) next.delete(label)
        else next.add(label)
      }
      return next
    })
  }

  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)
  const onToggleFavorite = (label: string) => {
    if (favoriteLabels.has(label.toLowerCase())) {
      removeMutation.mutate({ name: label })
    } else {
      addMutation.mutate({ name: label })
    }
  }

  const ownedSortOptions: SortOption<SortField>[] = [
    { value: 'name', label: t`Name` },
    { value: 'created', label: t`Created` },
    { value: 'expiry', label: t`Expiry Date` },
  ]

  const favoritesSortOptions: SortOption<FavoritesSortField>[] = [
    { value: 'name', label: t`Name` },
    { value: 'addedAt', label: t`Created` },
  ]

  const chips: FilterChipDef<FilterKey>[] = [
    {
      value: 'owned',
      label: t`Owned`,
      count: ownedCount,
      activeClassName:
        'bg-ens-lapis-100 text-ens-lapis-500 shadow-[inset_0px_0px_1px_0px_rgba(0,130,187,0.25)]',
      activeCountClassName: 'bg-ens-lapis-tint text-ens-lapis-900',
    },
    {
      value: 'favorites',
      label: t`Favorites`,
      count: favoritesCount,
      disabled: !isAuthed,
      activeClassName:
        'bg-ens-garnet-100 text-ens-garnet-500 shadow-[inset_0px_0px_1px_0px_rgba(255,110,158,0.25)]',
      activeCountClassName: 'bg-[#fffafc] text-ens-garnet-900',
    },
  ]

  return (
    <div className="w-full">
      <div className="mb-5 flex w-full flex-col items-start gap-5 md:mb-4">
        <div className="flex w-full flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <h2 className="font-sans text-[#232222] text-[16px] leading-[0.96] tracking-[0.16px] md:text-[28px] md:tracking-[0.28px]">
            <Trans>My Names</Trans>
          </h2>
          <div className="w-full md:w-88">
            <Input
              className="h-10 rounded-full border-none bg-ens-white pl-10 text-base text-foreground tracking-[-0.32px] shadow-none placeholder:text-ens-quartz-350 focus-visible:ring-0"
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => void onSearchKeyDown(event)}
              placeholder={t`Search my names`}
              startIcon={
                <Search className="-ml-1 size-4.5 text-ens-quartz-350" />
              }
              value={searchQuery}
            />
            <SmartSearchFeedback
              active={activeFilter === 'owned'}
              filters={smartFilters}
              message={smartMessage}
              pending={pendingQuery !== null}
              query={searchQuery}
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
          {activeFilter === 'owned' ? (
            <SortMenu
              direction={ownedSortState.dir}
              onChange={(field) => {
                if (smartFilters?.sort) removeChip('sort')
                setOwnedSort(toDirectionalSort(field, ownedSortState.dir))
              }}
              onToggleDirection={() => {
                if (smartFilters?.sort) removeChip('sort')
                setOwnedSort((current) => {
                  const { field, dir } = parseDirectionalSort<SortField>(
                    smartFilters?.sort ?? current,
                  )
                  return toDirectionalSort(field, reverseSortDir(dir))
                })
              }}
              options={ownedSortOptions}
              value={ownedSortState.field}
            />
          ) : (
            <SortMenu
              direction={favoritesSortState.dir}
              onChange={(field) =>
                setFavoritesSort(
                  toDirectionalSort(field, favoritesSortState.dir),
                )
              }
              onToggleDirection={() =>
                setFavoritesSort((current) => {
                  const { field, dir } =
                    parseDirectionalSort<FavoritesSortField>(current)
                  return toDirectionalSort(field, reverseSortDir(dir))
                })
              }
              options={favoritesSortOptions}
              value={favoritesSortState.field}
            />
          )}
          <FilterChips
            chips={chips}
            onChange={(next) => {
              setFilter(next)
              setSearchQuery('')
              clearSmartSearch()
            }}
            value={activeFilter}
          />
        </div>

        {smartFilters && activeFilter === 'owned' ? (
          <fieldset
            aria-label={t`Applied search filters`}
            className="flex flex-wrap gap-2"
          >
            {SMART_FILTER_KEYS.filter(
              (key) => smartFilters[key] !== undefined,
            ).map((key) => {
              const label = smartChipLabel(key)
              return (
                <button
                  aria-label={t`Remove ${label} filter`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ens-lapis-500/30 bg-ens-lapis-100 px-2.5 py-1 font-sans text-ens-lapis-900 text-xs transition-colors hover:bg-ens-lapis-100/60 focus-visible:outline-2 focus-visible:outline-ens-lapis-500"
                  key={key}
                  onClick={() => removeChip(key)}
                  type="button"
                >
                  {label}
                  <X aria-hidden="true" className="size-3" />
                </button>
              )
            })}
          </fieldset>
        ) : null}

        {activeFilter === 'owned' && allOwnedLabels.length > 0 && (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SelectionCheckbox
                ariaLabel={
                  allSelected ? t`Deselect all names` : t`Select all names`
                }
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onToggle={onToggleSelectAll}
              />
              <span className="font-sans text-[#232222] text-sm tracking-[0.28px]">
                {selectedCount > 0 ? (
                  <Trans>{selectedCount} selected</Trans>
                ) : (
                  <Trans>Select all</Trans>
                )}
              </span>
            </div>
            {someSelected && (
              <button
                className="flex h-8.5 items-center gap-1.5 rounded-sm border border-ens-lapis-500 px-2 py-1.5 font-normal font-semi-mono text-base text-ens-lapis-500 uppercase leading-none tracking-[-0.16px] hover:opacity-80"
                onClick={() => setIsRenewOpen(true)}
                type="button"
              >
                <Trans>Renew</Trans>
                <MSymbol
                  aria-hidden="true"
                  className="text-base leading-none"
                  symbol="double_arrow"
                />
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {match(activeFilter)
          .with('owned', () => (
            <motion.div
              key="owned"
              {...(shouldReduceMotion
                ? {}
                : {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0 },
                    transition: {
                      duration: 0.15,
                      ease: [0.25, 0.46, 0.45, 0.94] as const,
                    },
                  })}
            >
              <MyNamesList
                favoriteLabels={favoriteLabels}
                isAuthenticated={isAuthed}
                migrationEnabled={migrationEnabled}
                onToggleFavorite={onToggleFavorite}
                onToggleSelect={onToggleSelect}
                primaryLabel={primaryLabel}
                searchQuery={searchQuery}
                selectedLabels={selectedLabels}
                smartFilters={smartFilters}
                sort={ownedSort}
              />
            </motion.div>
          ))
          .with('favorites', () => (
            <motion.div
              key="favorites"
              {...(shouldReduceMotion
                ? {}
                : {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0 },
                    transition: {
                      duration: 0.15,
                      ease: [0.25, 0.46, 0.45, 0.94] as const,
                    },
                  })}
            >
              <FavoritesList
                isAuthenticated={isAuthed}
                searchQuery={searchQuery}
                sort={favoritesSort}
              />
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>

      <BulkRenewDialog
        names={selectedNames}
        onOpenChange={setIsRenewOpen}
        onRenewed={() => setSelectedLabels(new Set())}
        open={isRenewOpen}
      />
    </div>
  )
}
