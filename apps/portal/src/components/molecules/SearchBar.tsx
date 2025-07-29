import { SearchIcon } from 'lucide-react'

export const SearchBar = () => {
  return (
    <div className="max-w-[800px] w-full flex flex-row gap-1 items-center border border-border rounded-sm p-1 pl-2">
      <label htmlFor="search" aria-label="Search">
        <SearchIcon height={16} width={16} />
      </label>
      <input
        id="search"
        className="w-full appearance-none border-none outline-none"
        placeholder="Search..."
      />
    </div>
  )
}
