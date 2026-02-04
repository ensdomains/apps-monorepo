import type { ColumnDef } from '@tanstack/react-table'
import { CopyableRecord } from '@/components/CopyableRecord'
import { SortButton } from '@/components/table/SortButton'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import type { V1Roles } from '@/utils/names/mergeNamesData'

export type NameRow = {
  name: string | null
  expiryDate?: Date | null
  roleBitmap?: string | null
  v1Roles?: V1Roles | null
}

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
    cell(cell) {
      const name = cell.getValue() as string

      if (!name) return null

      return (
        <div className="flex flex-row gap-1 items-center w-max">
          <NameAvatar
            name={name}
            height="20px"
            width="20px"
            rounded="rounded-sm"
          />
          <CopyableRecord href={`/${name}`} value={name} />
        </div>
      )
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
      return formatDateTime(expiryDate)
    },
  },
  {
    accessorKey: 'roleBitmap',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Roles
      </SortButton>
    ),
    cell: ({ row }) => {
      const roleBitmap = row.original.roleBitmap
      const v1Roles = row.original.v1Roles

      // V2 names: use roleBitmap
      if (roleBitmap) {
        const roles = decodeRoleBitmap(roleBitmap)
        if (roles.length === 0) return null

        return (
          <Badge variant="secondary" className="text-xs">
            {roles.length} {roles.length === 1 ? 'Role' : 'Roles'}
          </Badge>
        )
      }

      // V1 names: use v1Roles (owner/manager)
      if (v1Roles) {
        const roleLabels: string[] = []
        if (v1Roles.owner) roleLabels.push('Owner')
        if (v1Roles.manager) roleLabels.push('Manager')

        if (roleLabels.length === 0) return null

        return (
          <div className="flex flex-row gap-1">
            {roleLabels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
          </div>
        )
      }

      return null
    },
  },
]
