import { transactionManager } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import {
  type ColumnFiltersState,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { FastForward, Search, XIcon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { PageHeading } from '@/components/PageHeading'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  getAddressNamesQueryKey,
  getAddressNamesQueryOptions,
} from '@/features/dashboard/hooks/useAddressNames'
import {
  getAddressRolesQueryOptions,
  withAddressRoles,
} from '@/features/dashboard/hooks/useAddressRoleCounts'
import { NamesFilters } from '@/features/names/components/NamesFilters'
import {
  columns,
  getNameRowId,
  type NameRow,
  nameColumnVisibility,
} from '@/features/names/components/NamesTable/columns'
import { NamesTable } from '@/features/names/components/NamesTable/NamesTable'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { MultiNameExtendModal } from '@/features/renew/components/multi-name-extension/MultiNameExtendModal'
import { useV1Renewable } from '@/features/renew/hooks/useIsRenewable'
import {
  type SelectedName,
  useRenewalTransactions,
} from '@/features/renew/hooks/useRenewalTransactions'
import { isExtendable2LD } from '@/features/renew/utils/nameExtension'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import {
  isTransactionInFlight,
  useActiveTransactionState,
} from '@/features/transaction-manager/hooks/useActiveTransactionState'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { queryClient } from '@/utils/queryClient'

const NO_NAMES: NameRow[] = []
const NAMES_INITIAL_COUNT = 100

export const Route = createFileRoute('/addr/$addr/names')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    queryClient.prefetchQuery(
      getAddressNamesQueryOptions({ address: params.addr as Address }),
    ),
})

/**
 * Narrows a coarse-filtered selection to names actually renewable right now.
 *
 * `isExtendable2LD` is a coarse grace-window pre-filter and is NOT authoritative
 * for v1: ETHRenewerV1 only renews reserved/in-grace names and reverts
 * otherwise. That is a check on the renewer, not on ownership: every live v1
 * name was reserved by premigration, and the rows here are already limited to
 * names the address holds a role on. So each selected v1 name is checked against the
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
  v2RolesState,
}: {
  readonly address: Address
  /** Every loaded name, before filtering and sorting. */
  readonly names: NameRow[]
  readonly v2RolesState: 'ready' | 'loading' | 'unavailable'
}) => {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: NAMES_INITIAL_COUNT,
  })
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
        queryKey: getAddressNamesQueryKey({ address }),
      })
    },
  })

  const activeTxState = useActiveTransactionState()
  const { isOpen: isTransactionModalOpen } = useTransactionModal()

  const table = useReactTable({
    data: names,
    columns,
    getRowId: getNameRowId,
    initialState: { columnVisibility: nameColumnVisibility },
    autoResetPageIndex: false,
    enableRowSelection: ({ original }) =>
      original.name !== null &&
      isExtendable2LD({
        ...original,
        name: original.name,
        isV2: original.protocolVersion === 'ENSv2',
      }),
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
      columnFilters,
      pagination,
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: (update) => {
      setColumnFilters(update)
      setPagination({ pageIndex: 0, pageSize: NAMES_INITIAL_COUNT })
    },
    onPaginationChange: setPagination,
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const selectedRows = table.getSelectedRowModel().rows
  const rowCount = selectedRows.length
  const selectedNames: readonly SelectedName[] = selectedRows.flatMap(
    ({ original: row }) =>
      row.name === null
        ? []
        : [
            {
              name: row.name,
              isV2: row.protocolVersion === 'ENSv2',
              expiryDate: row.expiryDate,
              graceEndDate: row.graceEndDate,
            },
          ],
  )
  // Keep the authoritative on-chain V1 check after selection.
  const coarseExtendable = selectedNames.filter(isExtendable2LD)
  const { names: extendableNames, isLoading: renewabilityLoading } =
    useRenewableNames(coarseExtendable)

  const searchNamesId = useId()

  const search =
    (table.getColumn('name')?.getFilterValue() as string | undefined) ?? ''
  const isSearching = search.trim() !== ''
  const hasActiveFilters = columnFilters.some((filter) => filter.id !== 'name')
  const filteredCount = table.getFilteredRowModel().rows.length
  const shown = table.getRowModel().rows.length
  const moreCount = Math.min(pagination.pageSize * 2, filteredCount)
  const loader = {
    shown,
    total: filteredCount,
    moreCount,
    canShowMore: shown < filteredCount,
    // Match the shared list loader's limit on rendering everything at once.
    canShowAll: filteredCount <= 1000,
    status: 'idle' as const,
    onMore: () => table.setPageSize(moreCount),
    onAll: () => table.setPageSize(filteredCount),
  }

  return (
    <>
      <header className="bg-background flex flex-col gap-4 sticky top-0 z-20">
        <div className="flex flex-row justify-between">
          <PageHeading parent={{ type: 'addr', addr: address }}>
            {hasActiveFilters
              ? `Names (${filteredCount} of ${names.length} matching)`
              : isSearching
                ? `Names (${filteredCount} matching)`
                : `Names (${names.length})`}
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
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="bg-background min-w-0 flex-1 rounded-sm">
              <InputGroupInput
                id={searchNamesId}
                className="w-full"
                placeholder="Search names..."
                value={search}
                onChange={(event) =>
                  table
                    .getColumn('name')
                    ?.setFilterValue(
                      event.target.value.trim()
                        ? event.target.value
                        : undefined,
                    )
                }
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
            <NamesFilters table={table} v2RolesState={v2RolesState} />
          </div>
        )}
      </header>
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

  const namesQuery = useQuery(getAddressNamesQueryOptions({ address }))
  const rolesQuery = useQuery(getAddressRolesQueryOptions({ address }))
  const v2RolesState = rolesQuery.data
    ? 'ready'
    : rolesQuery.isError
      ? 'unavailable'
      : 'loading'
  const allNames = useMemo(
    () =>
      withAddressRoles<NameRow>(namesQuery.data ?? NO_NAMES, {
        data: rolesQuery.data,
        isError: rolesQuery.isError,
      }),
    [namesQuery.data, rolesQuery.data, rolesQuery.isError],
  )
  if (namesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (namesQuery.error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching names. Please refresh the page."
      />
    )
  }

  if (allNames.length === 0)
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
      key={address}
      address={address}
      names={allNames}
      v2RolesState={v2RolesState}
    />
  )
}
