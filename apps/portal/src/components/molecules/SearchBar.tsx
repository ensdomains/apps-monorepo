import { SearchIcon } from 'lucide-react'
import { useId } from 'react'

export const SearchBar = () => {
  const id = useId()

  return (
    <div className="max-w-[800px] w-full flex flex-row gap-1 items-center border border-border rounded-sm p-1 pl-2">
      <label htmlFor="search" aria-label="Search">
        <SearchIcon height={16} width={16} />
      </label>
      <input
        id={id}
        className="w-full appearance-none border-none outline-none"
        placeholder="Search..."
      />
    </div>
  )
}
