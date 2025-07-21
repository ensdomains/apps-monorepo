import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Record = {
  type: string
  key?: string
  value: string
}

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
  },
]
