import type { ColumnDef } from '@tanstack/react-table'
import { SortButton } from '@/components/table/SortButton'
import { Checkbox } from '@/components/ui/checkbox'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'

type AddressRecord = { type: 'address'; id: number; key: string }
type ContentHashRecord = { type: 'contentHash' }
type TextRecord = { type: 'text'; key: string }
type AbiRecord = { type: 'abi' }

export type NameRecord = { value: string } & (
  | AddressRecord
  | ContentHashRecord
  | TextRecord
  | AbiRecord
)

export const columns: ColumnDef<NameRecord>[] = [
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
    accessorKey: 'type',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        sortDirection={column.getIsSorted()}
      >
        Type
      </SortButton>
    ),
  },
  {
    accessorKey: 'key',
    header: ({ column }) => {
      return (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          sortDirection={column.getIsSorted()}
        >
          Key
        </SortButton>
      )
    },
    cell: ({ row }) => {
      const type = row.original.type

      // Single-value records use type as key
      if (type === 'contentHash' || type === 'abi') {
        return <span className="font-mono">{type}</span>
      }

      // Address records show coin type + coin name
      if (type === 'address') {
        return (
          <span className="flex flex-row items-center gap-2 font-mono">
            {row.original.id}{' '}
            <span className="font-sans text-muted-foreground uppercase">
              {row.original.key}
            </span>
          </span>
        )
      }

      // Text records show the key
      return <span className="font-mono">{row.original.key}</span>
    },
  },
  {
    accessorKey: 'value',
    header: ({ column }) => {
      return (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          sortDirection={column.getIsSorted()}
        >
          Value
        </SortButton>
      )
    },
    cell: ({ column, row }) => {
      const value = row.getValue(column.id) as NameRecord['value']

      const [settings] = useTableViewSettings()

      return (
        <div
          className={cn(
            `font-mono w-full max-w-[30vw] sm:max-w-[670px]`,
            settings.wrapText ? 'break-all whitespace-normal' : 'truncate',
          )}
        >
          <span>{value}</span>
        </div>
      )
    },
  },
]
