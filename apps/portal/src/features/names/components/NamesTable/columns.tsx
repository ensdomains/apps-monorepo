import type { NameRegistrationStatus } from '@ens-apps/indexer/reads'
import type { ColumnDef } from '@tanstack/react-table'
import { EntityBadge } from '@/components/EntityBadge'
import { SortButton } from '@/components/table/SortButton'
import { Checkbox } from '@/components/ui/checkbox'
import type { RoleCount } from '@/features/dashboard/hooks/useAddressRoleCounts'
import type { AddressNameRelation } from '@/utils/names/addressNames'
import type { ProtocolVersion } from '@/utils/types'
import { NameExpiry } from '../NameExpiry'
import { RelationBadges } from '../RelationBadges'

export type NameRow = {
  name: string | null
  expiryDate?: Date | null
  parentExpiryDate?: Date | null
  graceEndDate: Date | null
  status: NameRegistrationStatus
  relations: readonly AddressNameRelation[]
  roleCount?: RoleCount
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
    // A subname sorts by the parent expiry it shows.
    accessorFn: (row) => row.expiryDate ?? row.parentExpiryDate,
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Expiry
      </SortButton>
    ),
    cell: ({ row }) => <NameExpiry {...row.original} />,
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
    cell: ({ row }) => (
      <RelationBadges
        relations={row.original.relations}
        roleCount={row.original.roleCount}
      />
    ),
  },
]
