import type { NameRegistrationStatus } from '@ens-apps/indexer/reads'
import type { ColumnDef, FilterFn } from '@tanstack/react-table'
import { EntityBadge } from '@/components/EntityBadge'
import { SortButton } from '@/components/table/SortButton'
import { Checkbox } from '@/components/ui/checkbox'
import type { RoleCount } from '@/features/dashboard/hooks/useAddressRoleCounts'
import {
  getNameLength,
  getNameStatus,
} from '@/features/renew/utils/nameExtension'
import type { RegistryRole } from '@/lib/roles/registryPowerRoles'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import {
  type AddressNameRelation,
  getShownExpiry,
  isShownExpiryInRange,
} from '@/utils/names/addressNames'
import type { ProtocolVersion } from '@/utils/types'
import { NameExpiry } from '../NameExpiry'
import { RelationBadges } from '../RelationBadges'

export type NameRow = {
  name: string | null
  expiryDate?: Date | null
  readonly parentExpiryDate?: Date | null
  graceEndDate: Date | null
  status: NameRegistrationStatus
  relations: readonly AddressNameRelation[]
  registryRoles?: readonly RegistryRole[]
  roleCount?: RoleCount
  protocolVersion: ProtocolVersion
}

/** A row's selection key: its name, not its position, which shifts as rows load. */
export const getNameRowId = (row: NameRow, index: number): string =>
  row.name === null ? String(index) : `${row.protocolVersion}:${row.name}`

/** A common key space for V1 relationships and exact V2 roles. */
const roleKeys = (row: NameRow): string[] =>
  row.protocolVersion === 'ENSv1'
    ? [...row.relations]
    : (row.registryRoles ?? []).map((role) => `v2:${role}`)

const matchesAny: FilterFn<NameRow> = (row, columnId, selected: string[]) =>
  selected.includes(row.getValue<string>(columnId))
matchesAny.autoRemove = (selected: string[]) => !selected?.length

const matchesExpiry: FilterFn<NameRow> = (row, _columnId, range: DateRange) =>
  isShownExpiryInRange(row.original, range)
matchesExpiry.autoRemove = (range: DateRange) => !range?.from && !range?.to

/** Helper columns participate in filtering/faceting without appearing in the table. */
export const nameColumnVisibility = {
  levels: false,
  statuses: false,
  lengths: false,
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
        disabled={!table.getRowModel().rows.some((row) => row.getCanSelect())}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) =>
      row.getCanSelect() ? (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ) : null,
  },
  {
    accessorKey: 'name',
    filterFn: (row, columnId, search: string) =>
      (row.getValue<string | null>(columnId) ?? '')
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
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
      return (
        <EntityBadge
          variant="name"
          name={name}
          showAvatar
          format="truncate"
          containerClassName="max-w-72"
        >
          {name}
        </EntityBadge>
      )
    },
  },
  {
    id: 'expiryDate',
    accessorFn: getShownExpiry,
    filterFn: matchesExpiry,
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
    id: 'roles',
    accessorFn: roleKeys,
    getUniqueValues: roleKeys,
    filterFn: 'arrIncludesSome',
    sortingFn: (a, b) => {
      const count = (row: NameRow) =>
        typeof row.roleCount === 'number' ? row.roleCount : roleKeys(row).length
      return count(a.original) - count(b.original)
    },
    sortDescFirst: false,
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
  {
    id: 'levels',
    accessorFn: (row) => {
      const depth = row.name?.split('.').length ?? 0
      return depth === 2 ? '2ld' : depth > 2 ? 'subname' : ''
    },
    filterFn: matchesAny,
    enableSorting: false,
  },
  {
    id: 'statuses',
    accessorFn: (row) => getNameStatus(row),
    filterFn: matchesAny,
    enableSorting: false,
  },
  {
    id: 'lengths',
    accessorFn: (row) => getNameLength(row.name),
    filterFn: matchesAny,
    enableSorting: false,
  },
]
