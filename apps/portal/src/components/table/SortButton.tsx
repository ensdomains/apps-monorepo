import type { SortDirection } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

interface SortButtonProps extends React.ComponentProps<'button'> {
  sortDirection?: SortDirection | false
}

export const SortButton = ({
  children,
  sortDirection,
  ...props
}: SortButtonProps) => {
  const SortIcon =
    sortDirection === 'asc'
      ? ArrowUp
      : sortDirection === 'desc'
        ? ArrowDown
        : ArrowUpDown

  return (
    <button
      className="p-0 flex flex-row items-center cursor-pointer"
      type="button"
      {...props}
    >
      {children}
      <SortIcon className="ml-2 h-4 w-4" />
    </button>
  )
}
