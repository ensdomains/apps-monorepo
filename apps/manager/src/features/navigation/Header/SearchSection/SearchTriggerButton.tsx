import { Search } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export const SearchTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  return (
    <button
      {...props}
      className="flex items-center justify-center rounded-md border border-none p-2 transition-colors hover:bg-[#F7F7F7]"
      type="button"
    >
      <Search className="size-5 text-gray-700" />
    </button>
  )
}
