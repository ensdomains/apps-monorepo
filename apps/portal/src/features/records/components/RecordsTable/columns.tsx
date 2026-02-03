import type { ColumnDef } from '@tanstack/react-table'
import { SortButton } from '@/components/table/SortButton'
import { Checkbox } from '@/components/ui/checkbox'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'

type AddressRecord = { type: 'address'; id: number; key: string }
type ContentHashRecord = { type: 'contentHash' }
type TextRecord = { type: 'text'; key: string }

export type NameRecord = { value: string } & (
  | AddressRecord
  | ContentHashRecord
  | TextRecord
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
        >
          Key
        </SortButton>
      )
    },
    cell: ({ column, row }) => {
      const type = row.original.type
      const value = row.getValue(column.id) as string
      if (type === 'address') {
        return (
          <span className={'flex flex-row items-center gap-2'}>
            {row.original.id}{' '}
            <span className="font-sans text-gray-500 uppercase">{value}</span>
          </span>
        )
      } else return <span className="font-mono">{value}</span>
    },
  },
  {
    accessorKey: 'value',
    header: ({ column }) => {
      return (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
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
