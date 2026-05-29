import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SortButton } from '@/components/table/SortButton'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import {
  getRegistryLabelsQueryOptions,
  type RegistryLabelRow,
} from '../../hooks/useRegistryLabels'

const columns: ColumnDef<RegistryLabelRow>[] = [
  {
    id: 'label',
    accessorFn: (row) => row.labelName ?? row.name ?? row.labelhash,
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
        className="text-muted-foreground"
      >
        Label
      </SortButton>
    ),
    cell: ({ row }) => {
      const { name, labelName, labelhash } = row.original
      return (
        <span className="bg-foreground font-medium text-background p-1 rounded-sm">
          {labelName ?? name ?? labelhash}
        </span>
      )
    },
  },
  {
    accessorKey: 'expiryDate',
    header: ({ column }) => (
      <SortButton
        className="text-muted-foreground"
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
          {formatExpiryDuration(unixSecondsToPlainDateUtc(expiryDate))}
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
        className="text-muted-foreground"
      >
        Role holders
      </SortButton>
    ),
    cell: ({ row }) => {
      const count = row.original.roleHoldersCount
      return <span className="text-muted-foreground">{count}</span>
    },
  },
  {
    accessorKey: 'labelhash',
    enableSorting: false,
    header: () => <span className="text-muted-foreground">Label hash</span>,
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">
        {row.original.labelhash}
      </span>
    ),
  },
]

export const RegistryLabelsTable = ({ address }: { address: Address }) => {
  const {
    data: labels,
    isLoading,
    error,
  } = useQuery(getRegistryLabelsQueryOptions({ address }))

  if (isLoading) return <LoadingSpinner title="Loading labels..." />

  if (error) {
    const message = (error as { cause?: { message?: string } }).cause?.message
    return <div>Error loading labels{message ? `: ${message}` : ''}</div>
  }

  return <DataTable columns={columns} data={labels ?? []} />
}
