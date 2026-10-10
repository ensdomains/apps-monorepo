import { useInfiniteQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import {
  infiniteFetchMore,
  useListLoader,
} from '@/components/ListLoader/useListLoader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { SortButton } from '@/components/table/SortButton'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import {
  getRegistryLabelsQueryOptions,
  REGISTRY_LABELS_PAGE_SIZE,
  type RegistryLabelRow,
} from '../../hooks/useRegistryLabels'

const columns: ColumnDef<RegistryLabelRow>[] = [
  {
    id: 'label',
    accessorFn: (row) => row.labelName ?? row.name ?? row.labelhash ?? '',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Label
      </SortButton>
    ),
    cell: ({ row }) => {
      const { name, labelName, labelhash } = row.original
      return (
        <span
          className="bg-foreground font-medium text-background py-1 px-1.5 rounded-sm"
          title={labelhash ?? undefined}
        >
          {labelName ?? name ?? 'label unknown'}
        </span>
      )
    },
  },
  {
    accessorKey: 'expiryDate',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Expires
      </SortButton>
    ),
    cell: ({ row }) => {
      const { expiryDate } = row.original
      if (!expiryDate) {
        return <span className="text-muted-foreground">Does not expire</span>
      }
      return (
        <span className="text-muted-foreground">
          {formatExpiryDuration(unixSecondsToPlainDateUtc(Number(expiryDate)))}
        </span>
      )
    },
  },
  {
    accessorKey: 'roleHoldersCount',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Role holders
      </SortButton>
    ),
    cell: ({ row }) => {
      const count = row.original.roleHoldersCount
      return <span className="text-muted-foreground">{count ?? '—'}</span>
    },
  },
  {
    accessorKey: 'labelhash',
    enableSorting: false,
    header: 'Label hash',
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">
        {row.original.labelhash}
      </span>
    ),
  },
]

export const RegistryLabelsTable = ({ address }: { address: Address }) => {
  const {
    data,
    isLoading,
    error,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery(getRegistryLabelsQueryOptions({ address }))

  const labels = data?.pages.flatMap((page) => page.labels) ?? []

  const loader = useListLoader({
    initialCount: REGISTRY_LABELS_PAGE_SIZE,
    loaded: labels.length,
    total: data?.pages.at(-1)?.totalCount,
    hasMore: hasNextPage,
    fetchMore: infiniteFetchMore(fetchNextPage, (page) => page.labels.length),
    resetKey: address,
  })

  if (isLoading) return <LoadingSpinner title="Loading labels..." />

  if (error && !isFetchNextPageError) {
    return (
      <ErrorMessage
        compact
        description="Error fetching labels. Please refresh the page."
      />
    )
  }

  if (labels.length === 0)
    return (
      <NoResultsMessage
        title="No labels yet"
        description="Labels registered in this registry will appear here."
        className="mx-0"
      />
    )

  return (
    <>
      <DataTable columns={columns} data={labels.slice(0, loader.shown)} />
      <ListLoader {...loader} />
    </>
  )
}
