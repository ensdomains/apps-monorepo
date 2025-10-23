import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown } from 'lucide-react'
import { useTableViewSettings } from '@/features/profile/hooks/useTableViewSettings'
import { cn } from '@/lib/utils'

export type ForwardName = {
  name: string
  coinTypes: number[]
}

const SortButton = ({ children, ...props }: React.ComponentProps<'button'>) => {
  return (
    <button
      className="p-0 flex flex-row items-center cursor-pointer"
      type="button"
      {...props}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </button>
  )
}

export const columns: ColumnDef<ForwardName>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <SortButton
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
      </SortButton>
    ),
  },
  {
    accessorKey: 'Networks',
    header: ({ column }) => {
      return (
        <SortButton
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Networks
        </SortButton>
      )
    },
    cell: ({ column, row }) => {
      const value = row.getValue(column.id) as ForwardName['coinTypes']

      const [settings] = useTableViewSettings()

      return (
        <div
          className={cn(
            `font-mono w-full max-w-[30vw] sm:max-w-[670px]`,
            settings.wrapText ? 'break-all whitespace-normal' : 'truncate',
          )}
        >
          <span>{value.join(', ')}</span>
        </div>
      )
    },
  },
]
