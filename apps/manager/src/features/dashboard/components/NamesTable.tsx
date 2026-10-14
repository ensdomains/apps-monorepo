import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import { MSymbol } from '@/components/ui/material-symbol'
import { BulkRenewDialog, type BulkRenewName } from '@/features/bulk-renew'
import { useDebounce } from '@/hooks/useDebounce'
import { isBackendAuthed } from '@/utils/backend-client'
import {
  selectionKey,
  toBulkRenewName,
  toSelectableDomain,
} from '../bulkRenewSelection'
import { isHeldName } from '../dashboardNames'
import { useAccountSelection } from '../hooks/useAccountSelection'
import type { NameVersion, SortDir, SortField } from '../mergedNames'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import { getRenewableDashboardNamesQueryOptions } from '../service/queries/getDashboardNames'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { useDashboardAddresses, useDashboardNames } from '../useDashboardNames'
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

export const NamesTable = ({
  migrationEnabled = false,
  primaryLabel,
}: NamesTableProps) => {
  const { t } = useLingui()
  const [filter, setFilter] = useState<FilterKey>('owned')
  const [version, setVersion] = useState<NameVersion | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [ownedSort, setOwnedSort] = useState<Sort>('name-asc')
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSort>('name-asc')
  const ownedSortState = parseDirectionalSort<SortField>(ownedSort)
  const favoritesSortState =
    parseDirectionalSort<FavoritesSortField>(favoritesSort)
  const shouldReduceMotion = useReducedMotion()
  const isAuthed = useAtom(isBackendAuthed)
  const activeFilter = !isAuthed && filter === 'favorites' ? 'owned' : filter

  // Searching reads bigname, so wait for typing to pause.
  const { debouncedValue: search } = useDebounce(searchQuery.trim(), {
    delay: 300,
  })
  const {
    total: ownedTotal,
    isError: isNamesError,
    isPending: isNamesPending,
  } = useDashboardNames({
    sortField: ownedSortState.field,
    sortDir: ownedSortState.dir,
  })
  // The chip counts do not depend on the sort, so they keep one read each.
  const v1Names = useDashboardNames({ version: 'v1' })
  const v2Names = useDashboardNames({ version: 'v2' })
  const { data: favorites = [] } = useQuery({
    ...favoritesQueryOptions,
    enabled: isAuthed,
  })

  const favoritesCount = favorites.length
  // A count is shown only once its list has been read.
  const countOf = (names: {
    readonly total: number
    readonly isPending: boolean
    readonly isError: boolean
  }) => (names.isPending || names.isError ? undefined : names.total)
  const ownedCount = countOf({
    total: ownedTotal,
    isPending: isNamesPending,
    isError: isNamesError,
  })

  const favoriteLabels = useMemo(
    () => new Set(favorites.map((entry) => entry.name.toLowerCase())),
    [favorites],
  )

  const addresses = useDashboardAddresses()
  const accountsKey = addresses.join(',')
  const {
    selected,
    labels: selectedLabels,
    toggle: onToggleSelect,
    toggleAll,
    clear: clearSelection,
  } = useAccountSelection(accountsKey)

  // Select-all covers every renewable name, not just the loaded pages, so the
  // list is read from bigname when it is first asked for.
  const queryClient = useQueryClient()
  const renewableOptions = getRenewableDashboardNamesQueryOptions(
    addresses,
    search,
  )
  const { data: renewableNames } = useQuery({
    ...renewableOptions,
    enabled: false,
  })

  const [isRenewOpen, setIsRenewOpen] = useState(false)

  const selectedCount = selected.size
  const allSelected =
    !!renewableNames &&
    renewableNames.length > 0 &&
    renewableNames.every((name) => selected.has(selectionKey(name)))
  const someSelected = selectedCount > 0

  // Only renewable v2 2LD .eth names the accounts hold are renewed here.
  const selectedNames = useMemo<BulkRenewName[]>(
    () =>
      [...selected.values()]
        .filter((name) => name.protocol === 'v2' && isHeldName(name))
        .map((name) => toBulkRenewName(toSelectableDomain(name)))
        .filter((name): name is BulkRenewName => name !== null),
    [selected],
  )

  // Toggle every renewable name under the current search, preserving any
  // selections made under a different search. A read that finishes after the
  // wallet changed is dropped.
  const selectAll = useMutation({
    mutationFn: (_forAccounts: string) =>
      queryClient.fetchQuery(renewableOptions),
    onSuccess: (names, forAccounts) => toggleAll(names, forAccounts),
  })

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

  // v1 / v2 are mutually exclusive; clicking the active one shows all again.
  // Switching drops the selection so Renew can't include a name that's hidden.
  const versionChips: FilterChipDef<NameVersion>[] = [
    {
      value: 'v1',
      label: t`V1`,
      count: countOf(v1Names),
    },
    {
      value: 'v2',
      label: t`V2`,
      count: countOf(v2Names),
    },
  ]
  const changeVersion = (next: NameVersion | null) => {
    setVersion(next)
    clearSelection()
  }

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
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t`Search my names`}
              startIcon={
                <Search className="-ml-1 size-4.5 text-ens-quartz-350" />
              }
              value={searchQuery}
            />
          </div>
        </div>

        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
          {activeFilter === 'owned' ? (
            <SortMenu
              direction={ownedSortState.dir}
              onChange={(field) =>
                setOwnedSort(toDirectionalSort(field, ownedSortState.dir))
              }
              onToggleDirection={() =>
                setOwnedSort((current) => {
                  const { field, dir } =
                    parseDirectionalSort<SortField>(current)
                  return toDirectionalSort(field, reverseSortDir(dir))
                })
              }
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
            }}
            value={activeFilter}
          />
          {activeFilter === 'owned' && (
            <FilterChips
              chips={versionChips}
              onChange={changeVersion}
              onClear={() => changeVersion(null)}
              value={version}
            />
          )}
        </div>

        {activeFilter === 'owned' && ownedTotal > 0 && version !== 'v1' && (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SelectionCheckbox
                ariaLabel={
                  allSelected ? t`Deselect all names` : t`Select all names`
                }
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onToggle={() => selectAll.mutate(accountsKey)}
              />
              <span className="font-sans text-[#232222] text-sm tracking-[0.28px]">
                {selectedCount > 0 ? (
                  <Trans>{selectedCount} selected</Trans>
                ) : (
                  <Trans>Select all</Trans>
                )}
              </span>
              {selectAll.isError && (
                <span className="font-sans text-red-600 text-sm" role="alert">
                  <Trans>Names could not be loaded</Trans>
                </span>
              )}
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
                searchQuery={search}
                selectedLabels={selectedLabels}
                sort={ownedSort}
                version={version}
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
        onRenewed={clearSelection}
        open={isRenewOpen}
      />
    </div>
  )
}
