import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

type AddressRecord = { type: 'address'; id: number; key: string }
type ContentHashRecord = { type: 'contentHash' }
type TextRecord = { type: 'text'; key: string }

export type Record = { value: string } & (
  | AddressRecord
  | ContentHashRecord
  | TextRecord
)


const SortButton = ({ children, ...props }: React.ComponentProps<'button'>) => {
  return (
    <button className="p-0 flex flex-row items-center" type="button" {...props}>
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </button>
  )
}

export const columns: ColumnDef<Record>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <div className="pl-8">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="pl-8">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
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
      const value = row.getValue(column.id) as Record['value']

      return <span className="font-mono">{value}</span>
    },
  },
]
