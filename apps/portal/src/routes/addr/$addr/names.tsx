import { transactionManager } from '@ens-apps/transaction-manager'
import { createFileRoute } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { FastForward, Search, XIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import {
  ListLoader,
  type ListLoaderProps,
} from '@/components/ListLoader/ListLoader'
import { useListLoader } from '@/components/ListLoader/useListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { ALL_OWNED_NAMES_QUERY_KEY } from '@/features/dashboard/hooks/ownedNamesQueryKey'
import { useOwnedNames } from '@/features/dashboard/hooks/useOwnedNames'
import { getV1NamesPagesForAddressQueryOptions } from '@/features/dashboard/hooks/useV1NamesForAddress'
import { getV2NamesPagesForAddressQueryOptions } from '@/features/dashboard/hooks/useV2NamesWithRolesForAddress'
import {
  columns,
  getNameRowId,
  type NameRow,
} from '@/features/names/components/NamesTable/columns'
import { NamesTable } from '@/features/names/components/NamesTable/NamesTable'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { MultiNameExtendModal } from '@/features/renew/components/multi-name-extension/MultiNameExtendModal'
import { useV1Renewable } from '@/features/renew/hooks/useIsRenewable'
import {
  type SelectedName,
  useRenewalTransactions,
} from '@/features/renew/hooks/useRenewalTransactions'
import {
  getNameLength,
  getNameStatus,
  getSelectedNames,
  isExtendable2LD,
  isNonCanonicalEthName,
} from '@/features/renew/utils/nameExtension'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import {
  isTransactionInFlight,
  useActiveTransactionState,
} from '@/features/transaction-manager/hooks/useActiveTransactionState'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useDebouncedValue } from '@/hooks/useDebounce'
import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { queryClient } from '@/utils/queryClient'
import type { ProtocolVersion } from '@/utils/types'

const STATUS_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'Active',
    options: [
      { label: 'Registered', value: 'registered' },
      { label: 'Expires with parent', value: 'expires-with-parent' },
      { label: 'Does not expire', value: 'no-expiry' },
    ],
  },
  {
    title: 'Expired',
    options: [
      { label: 'Expired', value: 'expired' },
      { label: 'Grace', value: 'grace' },
      { label: 'Temporary premium', value: 'premium' },
    ],
  },
]

const LENGTH_FILTER_GROUPS: FilterGroup[] = [
  {
    title: 'Name Length',
    options: [
      { label: '3 characters', value: '3' },
      { label: '4 characters', value: '4' },
      { label: '5+ characters', value: '5+' },
    ],
  },
]

const NAMES_INITIAL_COUNT = 100
const SEARCH_DEBOUNCE_MS = 300

export const Route = createFileRoute('/addr/$addr/names')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    Promise.all([
      queryClient.prefetchInfiniteQuery(
        getV1NamesPagesForAddressQueryOptions({
          address: params.addr as Address,
        }),
      ),
      queryClient.prefetchInfiniteQuery(
        getV2NamesPagesForAddressQueryOptions({
          address: params.addr as Address,
        }),
      ),
    ]),
})

/**
 * Narrows a coarse-filtered selection to names actually renewable right now.
 *
 * `isExtendable2LD` is a coarse grace-window pre-filter and is NOT authoritative
 * for v1: ETHRenewerV1 only renews reserved/in-grace names and reverts
 * otherwise. That is a check on the renewer, not on ownership: every live v1
 * name was reserved by premigration, and the rows here are already limited to
 * names the address owns. So each selected v1 name is checked against the
 * renewer's on-chain `isRenewable` (shared with the name page via
 * {@link useV1Renewable});
 * non-renewable ones are dropped so they never enter a single- or multi-renew
 * flow. v2 is fully covered by `isExtendable2LD` and passes through untouched.
 *
 * `isLoading` is true while any selected v1 name's check is still resolving —
 * callers must gate the Extend action on it so the flow opens against a
 * fully-resolved selection (otherwise a still-loading renewable v1 name would be
 * momentarily excluded, flipping the single↔multi modal choice mid-interaction).
 */
function useRenewableNames(candidates: readonly SelectedName[]): {
  readonly names: readonly SelectedName[]
  readonly isLoading: boolean
} {
  const v1Names = candidates
    .filter((name) => !name.isV2)
    .map((name) => name.name)

  const { isRenewable, isLoading } = useV1Renewable(v1Names)

  const names = candidates.filter((name) => name.isV2 || isRenewable(name.name))

  return { names, isLoading }
}

const NamesList = ({
  address,
  names,
  loader,
  search,
  onSearchChange,
  isSearching,
  isSearchPending,
  failedSearches,
}: {
  readonly address: Address
  /** The names shown so far. */
  readonly names: NameRow[]
  readonly loader: ListLoaderProps
  readonly search: string
  readonly onSearchChange: (search: string) => void
  readonly isSearching: boolean
  /** The rows are still the previous search's while the new one loads. */
  readonly isSearchPending: boolean
  /** The protocol versions whose search failed; the other's names still show. */
  readonly failedSearches: readonly ProtocolVersion[]
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [extendModalOpen, setExtendModalOpen] = useState(false)

  const {
    transactions: renewalTransactions,
    startFlow,
    startMultiFlow,
    clearIncompatibleRenewalState,
    openModal: openRenewalModal,
  } = useRenewalTransactions({
    onComplete: () => {
      setRowSelection({})
      setExtendModalOpen(false)
      void queryClient.invalidateQueries({
        queryKey: ALL_OWNED_NAMES_QUERY_KEY,
      })
    },
  })

  const activeTxState = useActiveTransactionState()
  const { isOpen: isTransactionModalOpen } = useTransactionModal()

  // Filter state
  const [expiryDateRange, setExpiryDateRange] = useState<DateRange>({})
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedLengths, setSelectedLengths] = useState<string[]>([])
  // Apply filters to data
  const filteredData = useMemo(() => {
    let filtered = names

    // Filter by expiry date range
    if (expiryDateRange.from || expiryDateRange.to) {
      filtered = filtered.filter((row) => {
        if (!row.expiryDate) return false
        if (expiryDateRange.from && row.expiryDate < expiryDateRange.from)
          return false
        if (expiryDateRange.to && row.expiryDate > expiryDateRange.to)
          return false
        return true
      })
    }

    // Filter by status
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter((row) => {
        const status = getNameStatus(
          row.expiryDate,
          row.protocolVersion === 'ENSv2',
        )
        return selectedStatuses.includes(status)
      })
    }

    // Filter by name length
    if (selectedLengths.length > 0) {
      filtered = filtered.filter((row) => {
        const length = getNameLength(row.name)
        return selectedLengths.includes(length)
      })
    }

    return filtered
  }, [names, expiryDateRange, selectedStatuses, selectedLengths])

  const table = useReactTable({
    data: filteredData,
    columns,
    getRowId: getNameRowId,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
      columnFilters,
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
  })

  const rowCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection],
  )

  // Coarse grace-window pre-filter, then narrow to names that are actually
  // renewable now (drops non-renewable v1 names — see useRenewableNames).
  const selectedNames = getSelectedNames(rowSelection, filteredData)
  const coarseExtendable = selectedNames.filter(isExtendable2LD)
  const nonCanonicalCount = selectedNames.filter((selected) =>
    isNonCanonicalEthName(selected.name),
  ).length
  const { names: extendableNames, isLoading: renewabilityLoading } =
    useRenewableNames(coarseExtendable)

  const searchNamesId = useId()

  const hasActiveFilters = Boolean(
    expiryDateRange.from ||
      expiryDateRange.to ||
      selectedStatuses.length > 0 ||
      selectedLengths.length > 0,
  )

  return (
    <>
      <header className="bg-background flex flex-col gap-4 sticky top-0 z-20">
        <div className="flex flex-row justify-between">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            {match({
              total: loader.total,
              hasActiveFilters,
              isSearching,
              isSearchPending,
            })
              .with({ isSearchPending: true }, () => 'Names')
              .with(
                { hasActiveFilters: true },
                () => `Names (${filteredData.length} of ${names.length} shown)`,
              )
              .with({ total: undefined }, () => 'Names')
              .with(
                { isSearching: true },
                ({ total }) => `Names (${total} matching)`,
              )
              .otherwise(({ total }) => `Names (${total})`)}
          </PageHeading>
        </div>
        {rowCount > 0 ? (
          <div className="flex flex-col lg:flex-row w-full lg:justify-between lg:items-center gap-4">
            <div className="flex flex-row items-center gap-1 shrink-0">
              <button
                type="button"
                className="cursor-pointer"
                onClick={() => setRowSelection({})}
              >
                <XIcon className="size-6" />
              </button>
              {rowCount} selected
            </div>
            {nonCanonicalCount > 0 && (
              <p className="text-p text-muted-foreground">
                {nonCanonicalCount} selected name(s) have a non-normalized label
                and can’t be extended here: a renewal would go to a different
                name.
              </p>
            )}
            <Button
              variant="default"
              size="sm"
              disabled={extendableNames.length === 0 || renewabilityLoading}
              onClick={() => {
                if (isTransactionInFlight(activeTxState)) {
                  // Reopening an attempt that is already running: reuse the
                  // scope it was started with rather than naming a new one.
                  openRenewalModal()
                  return
                }
                // A terminal actor from a previous attempt is stale for a new
                // one, and the step ids are scoped, so it no longer shadows
                // the fresh attempt. Cancelling is still wanted to keep the
                // manager's list from growing, and it is the one actor the
                // modal's `activeTxState` lookup points at.
                if (activeTxState) {
                  transactionManager.cancelTransaction(activeTxState.txId)
                }
                clearIncompatibleRenewalState(
                  extendableNames.length === 1 ? 'single' : 'multi',
                )
                setExtendModalOpen(true)
              }}
            >
              <FastForward className="size-4" />
              Extend
            </Button>
          </div>
        ) : (
          <>
            <InputGroup className="bg-background rounded-sm">
              <InputGroupInput
                id={searchNamesId}
                className="w-full"
                placeholder="Search names..."
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
            {loader.canShowMore && hasActiveFilters && (
              <p className="text-p text-muted-foreground">
                Filters cover the {names.length} names shown so far. Show more
                to include the rest.
              </p>
            )}
            <div className="flex flex-row gap-2 flex-wrap">
              <TableDateRangeFilter
                label="Expiry"
                dateRange={expiryDateRange}
                onChange={setExpiryDateRange}
              />
              <TableMultiSelectFilter
                label="Status"
                groups={STATUS_FILTER_GROUPS}
                selectedValues={selectedStatuses}
                onChange={setSelectedStatuses}
              />
              <TableMultiSelectFilter
                label="Length"
                groups={LENGTH_FILTER_GROUPS}
                selectedValues={selectedLengths}
                onChange={setSelectedLengths}
              />
            </div>
          </>
        )}
      </header>
      {failedSearches.map((protocolVersion) => (
        <ErrorMessage
          key={protocolVersion}
          compact
          description={`Error searching ${protocolVersion} names. Please try again.`}
        />
      ))}
      <div className="overflow-x-auto">
        <NamesTable table={table} />
      </div>
      <ListLoader {...loader} className="py-4" />
      {extendableNames.length === 1 && (
        <ExtendNameModal
          open={extendModalOpen && !isTransactionModalOpen}
          onClose={() => setExtendModalOpen(false)}
          selectedName={extendableNames[0]}
          onExtend={(config) => {
            // `startFlow` names the attempt and opens the modal.
            startFlow(extendableNames[0], config)
          }}
        />
      )}
      {extendableNames.length > 1 && (
        <MultiNameExtendModal
          open={extendModalOpen && !isTransactionModalOpen}
          onClose={() => setExtendModalOpen(false)}
          selectedNames={extendableNames}
          onExtend={(config) => {
            // `startMultiFlow` names the attempt and opens the modal.
            startMultiFlow({
              renewals: config.renewals,
              tokenAddress: config.selection.tokenAddress,
              payments: config.selection.payments,
            })
          }}
        />
      )}
      <TransactionModal transactions={renewalTransactions} />
    </>
  )
}

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  // Kept with its address and dropped when the address changes, so a search
  // neither follows you to another address nor waits for you to come back.
  const [typed, setTyped] = useState({ address, search: '' })
  if (typed.address !== address) setTyped({ address, search: '' })
  const search = typed.address === address ? typed.search : ''
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const appliedSearch = search === '' ? '' : debouncedSearch

  const {
    names: loadedNames,
    total,
    hasMore,
    fetchMore,
    v1Query: v1NamesQuery,
    v2Query: v2NamesQuery,
  } = useOwnedNames({ address, search: appliedSearch || undefined })

  const loader = useListLoader({
    initialCount: NAMES_INITIAL_COUNT,
    loaded: loadedNames.length,
    total,
    hasMore,
    fetchMore,
    resetKey: `${address}:${appliedSearch}`,
  })

  // Must be memoised: a fresh array makes the table recompute its row model,
  // which auto-resets the page index, which re-renders — forever.
  const names: NameRow[] = useMemo(
    () => loadedNames.slice(0, loader.shown),
    [loadedNames, loader.shown],
  )

  if (v1NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (v2NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  const failedSources = (
    [
      ['ENSv1', v1NamesQuery],
      ['ENSv2', v2NamesQuery],
    ] as const
  )
    .filter(([, query]) => query.isError && !query.isFetchNextPageError)
    .map(([protocolVersion]) => protocolVersion)
  const isSearching = appliedSearch !== ''

  if (failedSources.length > 0 && !isSearching) {
    return (
      <ErrorMessage
        compact
        description="Error fetching names. Please refresh the page."
      />
    )
  }

  if (loadedNames.length === 0 && !hasMore && !isSearching)
    return (
      <>
        <header className="bg-background flex flex-col gap-4 sticky top-0 z-20">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            Names
          </PageHeading>
        </header>
        <NoResultsMessage
          title="No names yet"
          description="Names owned by this address will appear here."
          className="mx-0"
        />
      </>
    )

  return (
    <NamesList
      address={address}
      names={names}
      loader={loader}
      search={search}
      onSearchChange={(next) => setTyped({ address, search: next })}
      isSearching={isSearching}
      isSearchPending={
        v1NamesQuery.isPlaceholderData || v2NamesQuery.isPlaceholderData
      }
      failedSearches={failedSources}
    />
  )
}
