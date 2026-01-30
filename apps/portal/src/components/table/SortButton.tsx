import { ArrowUpDown } from 'lucide-react'

export const SortButton = ({
  children,
  ...props
}: React.ComponentProps<'button'>) => (
  <button
    className="p-0 flex flex-row items-center cursor-pointer"
    type="button"
    {...props}
  >
    {children}
    <ArrowUpDown className="ml-2 h-4 w-4" />
  </button>
)
