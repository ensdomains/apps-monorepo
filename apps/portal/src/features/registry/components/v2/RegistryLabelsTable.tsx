import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import type { Address } from 'viem'
import { DataTable } from '@/components/DataTable'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SortButton } from '@/components/table/SortButton'
import { Badge } from '@/components/ui/badge'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { dateToPlainDate } from '@/utils/temporal'
import {
  getRegistryLabelsQueryOptions,
  type RegistryLabelRow,
} from '../../hooks/useRegistryLabels'

const columns: ColumnDef<RegistryLabelRow>[] = [
  {
    accessorKey: 'labelName',
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
      if (name) {
        return (
          <EntityBadge variant="name" name={name} showAvatar>
            {labelName ?? name}
          </EntityBadge>
        )
      }
      if (labelName) return <span className="font-medium">{labelName}</span>
      return (
        <EntityBadge variant="default" copyValue={labelhash}>
          {truncateAddress(labelhash, 10, 8)}
        </EntityBadge>
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
        return (
          <Badge variant="secondary" className="text-xs">
            Does not expire
          </Badge>
        )
      }
      return (
        <span>
          {formatExpiryDuration(dateToPlainDate(new Date(expiryDate * 1000)))}
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
      if (count === 0) return <span className="text-muted-foreground">0</span>
      return (
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'labelhash',
    enableSorting: false,
    header: () => <span className="text-muted-foreground">Label hash</span>,
    cell: ({ row }) => (
      <EntityBadge variant="default" copyValue={row.original.labelhash}>
        {truncateAddress(row.original.labelhash, 10, 8)}
      </EntityBadge>
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
