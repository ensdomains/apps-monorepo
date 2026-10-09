import type { ColumnDef } from '@tanstack/react-table'
import { EntityBadge } from '@/components/EntityBadge'
import { SortButton } from '@/components/table/SortButton'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { GraceBadge } from '@/features/profile/components/GraceBadge'
import { getNameStatus } from '@/features/renew/utils/nameExtension'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import type { AddressNameRelation } from '@/utils/names/addressNames'
import { dateToPlainDate } from '@/utils/temporal'
import type { ProtocolVersion } from '@/utils/types'
import { RelationBadges } from '../RelationBadges'

export type NameRow = {
  name: string | null
  expiryDate?: Date | null
  relations: readonly AddressNameRelation[]
  protocolVersion: ProtocolVersion
}

/** A row's selection key: its name, not its position, which shifts as rows load. */
export const getNameRowId = (row: NameRow, index: number): string =>
  row.name === null ? String(index) : `${row.protocolVersion}:${row.name}`

const NameCell = ({ name }: { name: string }) => (
  <EntityBadge variant="name" name={name} showAvatar>
    {name}
  </EntityBadge>
)

export const columns: ColumnDef<NameRow>[] = [
  {
    enableSorting: false,
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Name
      </SortButton>
    ),
    cell: ({ getValue }) => {
      const name = getValue() as string
      if (!name) return null
      return <NameCell name={name} />
    },
  },
  {
    id: 'expiryDate',
    accessorKey: 'expiryDate',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Expiry
      </SortButton>
    ),
    cell: ({ row }) => {
      const expiryDate = row.original.expiryDate
      if (!expiryDate) {
        return (
          <Badge variant="secondary" className="text-xs">
            Does not expire
          </Badge>
        )
      }
      const isV2 = row.original.protocolVersion === 'ENSv2'
      const status = getNameStatus(expiryDate, isV2)
      return (
        <div className="flex items-center gap-2">
          <span>{formatDateTime(dateToPlainDate(expiryDate))}</span>
          {status === 'grace' && <GraceBadge />}
        </div>
      )
    },
  },
  {
    id: 'relations',
    accessorFn: (row) => row.relations.length,
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Roles
      </SortButton>
    ),
    cell: ({ row }) => <RelationBadges relations={row.original.relations} />,
  },
]
