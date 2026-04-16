import { useQueries } from '@tanstack/react-query'
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
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { TableDateRangeFilter } from '@/components/table/TableDateRangeFilter'
import { TableMultiSelectFilter } from '@/components/table/TableMultiSelectFilter'
import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { getV1NamesForAddressQueryOptions } from '@/features/dashboard/hooks/useV1NamesForAddress'
import { getV2NamesWithRolesForAddressQueryOptions } from '@/features/dashboard/hooks/useV2NamesWithRolesForAddress'
import {
  columns,
  type NameRow,
} from '@/features/names/components/NamesTable/columns'
import { NamesTable } from '@/features/names/components/NamesTable/NamesTable'
import { ExtendNameModal } from '@/features/renew/components/ExtendNameModal'
import { MultiNameExtendModal } from '@/features/renew/components/multi-name-extension/MultiNameExtendModal'
import {
  type SelectedName,
  useRenewalTransactions,
} from '@/features/renew/hooks/useRenewalTransactions'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import type { FilterGroup } from '@/utils/filtering/multiSelectFilter'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import { queryClient } from '@/utils/queryClient'

const MS_PER_SECOND = 1000
const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND
const GRACE_PERIOD_DAYS = 90
const PREMIUM_PERIOD_DAYS = 21

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

const getNameStatus = (expiryDate: Date | null | undefined): string => {
  if (!expiryDate) return 'no-expiry'

  const now = new Date()
  const gracePeriodEnd = new Date(
    expiryDate.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY,
  )
  const premiumPeriodEnd = new Date(
    gracePeriodEnd.getTime() + PREMIUM_PERIOD_DAYS * MS_PER_DAY,
  )

  // After grace + premium period = fully expired
  if (now > premiumPeriodEnd) return 'expired'
  // After grace period but in premium period
  if (now > gracePeriodEnd) return 'premium'
  // After expiry but in grace period
  if (now > expiryDate) return 'grace'
  // Still registered (active)
  return 'registered'
}

const getNameLength = (name: string | null): string => {
  if (!name) return '5+'
  // Remove the TLD (e.g., .eth)
  const label = name.split('.')[0]
  if (label.length === 3) return '3'
  if (label.length === 4) return '4'
  return '5+'
}

export const Route = createFileRoute('/addr/$addr/names')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
  loader: ({ params }) =>
    Promise.all([
      queryClient.prefetchQuery(
        getV1NamesForAddressQueryOptions({
          address: params.addr as Address,
        }),
      ),
      queryClient.prefetchQuery(
        getV2NamesWithRolesForAddressQueryOptions({
          address: params.addr as Address,
        }),
      ),
    ]),
})

function RouteComponent() {
  const { addr: address } = Route.useParams() as { addr: Address }

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [extendModalOpen, setExtendModalOpen] = useState(false)

  const {
    transactions: renewalTransactions,
    startFlow,
    startMultiFlow,
  } = useRenewalTransactions({
    onComplete: () => {
      void queryClient.invalidateQueries({
        queryKey: ['get-names-for-address'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['get-v2-names-with-roles-for-address'],
      })
    },
  })

  const { openModal } = useTransactionModal()

  // Filter state
  const [expiryDateRange, setExpiryDateRange] = useState<DateRange>({})
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [selectedLengths, setSelectedLengths] = useState<string[]>([])
  const [v1NamesQuery, v2NamesQuery] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  const data = useMemo((): NameRow[] => {
    const v1Names: NameRow[] = (v1NamesQuery.data || []).map(
      ({ name, expiryDate, relation }) => ({
        name,
        expiryDate: expiryDate?.date ?? null,
        roleBitmap: null,
        v1Roles: {
          // For wrapped names: wrappedOwner controls both ownership and management
          // For unwrapped names: registrant is Owner, registry owner is Manager
          owner: relation.registrant || relation.wrappedOwner,
          manager: relation.owner || relation.wrappedOwner,
        },
      }),
    )

    const v2Names: NameRow[] = (v2NamesQuery.data || []).map(
      ({ name, expiryDate, roleBitmap }) => ({
        name,
        expiryDate: expiryDate ? new Date(expiryDate * MS_PER_SECOND) : null,
        roleBitmap,
        v1Roles: null,
      }),
    )

    return [...v1Names, ...v2Names]
  }, [v1NamesQuery.data, v2NamesQuery.data])

  // Apply filters to data
  const filteredData = useMemo(() => {
    let filtered = data

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
        const status = getNameStatus(row.expiryDate)
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
  }, [data, expiryDateRange, selectedStatuses, selectedLengths])

  const table = useReactTable({
    data: filteredData,
    columns,
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
    globalFilterFn: 'includesString',
  })

  const rowCount = useMemo(
    () => Object.keys(rowSelection).length,
    [rowSelection],
  )

  const selectedNames = useMemo(
    (): SelectedName[] =>
      Object.keys(rowSelection)
        .map((idx) => filteredData[Number(idx)])
        .filter((row): row is NameRow => Boolean(row))
        .filter((row): row is NameRow & { name: string } => row.name !== null)
        .map((row) => ({
          name: row.name,
          isV2: row.v1Roles === null,
          expiryDate: row.expiryDate,
        })),
    [rowSelection, filteredData],
  )

  const searchNamesId = useId()

  if (v1NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (v2NamesQuery.isLoading) {
    return <LoadingMessage />
  }

  if (v1NamesQuery.error) {
    return (
      <ErrorMessage
        title="Error loading names"
        description={extractErrorMessage(v1NamesQuery.error)}
      />
    )
  }

  if (v2NamesQuery.error) {
    return (
      <ErrorMessage
        title="Error loading names"
        description={extractErrorMessage(v2NamesQuery.error)}
      />
    )
  }

  const nameCount = filteredData.length
  const totalCount = data.length
  const hasActiveFilters =
    expiryDateRange.from ||
    expiryDateRange.to ||
    selectedStatuses.length > 0 ||
    selectedLengths.length > 0

  return (
    <>
      <header className="bg-muted px-8 pb-4 pt-12 flex flex-col gap-4 sticky top-0 z-10">
        <div className="flex flex-row justify-between">
          <h1 className="text-heading font-medium">
            {hasActiveFilters ? `${nameCount} of ${totalCount}` : nameCount}{' '}
            names
          </h1>
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
              variant="secondary"
              size="sm"
              disabled={rowCount < 1}
              onClick={() => setExtendModalOpen(true)}
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
                onChange={(event) => table.setGlobalFilter(event.target.value)}
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
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
      <div className="overflow-x-auto">
        <NamesTable table={table} />
      </div>
      {selectedNames.length === 1 && (
        <ExtendNameModal
          open={extendModalOpen}
          onClose={() => setExtendModalOpen(false)}
          selectedName={selectedNames[0]}
          onExtend={(config) => {
            startFlow(selectedNames[0], config)
            setExtendModalOpen(false)
            openModal()
          }}
        />
      )}
      {selectedNames.length > 1 && (
        <MultiNameExtendModal
          open={extendModalOpen}
          onClose={() => {
            setExtendModalOpen(false)
            setRowSelection({})
          }}
          selectedNames={selectedNames}
          onExtend={(config) => {
            startMultiFlow({
              renewals: config.renewals,
              tokenAddress: config.token.address,
              tokenPrice: config.token.price.total,
            })
            setExtendModalOpen(false)
            openModal()
          }}
        />
      )}
      <TransactionModal transactions={renewalTransactions} />
    </>
  )
}
