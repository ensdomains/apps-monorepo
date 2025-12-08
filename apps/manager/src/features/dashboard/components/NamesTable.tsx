import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import type { DashboardNameRow } from '@/features/dashboard/MOCK'
import type {
  DashboardNamesSortDirection,
  DashboardNamesSortKey,
} from '@/features/dashboard/service/dashboardNamesList'
import { useDashboardNamesListQuery } from '@/features/dashboard/service/hooks'
import { FavoritesList } from './FavoritesList'
import { MyNamesList } from './MyNamesList'

type TabKey = 'myNames' | 'favorites'

type TabButtonProps = {
  label: string
  count: number
  isActive: boolean
  onClick: () => void
  activeBadgeClass: string
  activeCountClass: string
}

const DashboardTabButton = ({
  label,
  count,
  isActive,
  onClick,
  activeBadgeClass,
  activeCountClass,
}: TabButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex shrink-0 items-center gap-2 md:gap-[12px]"
  >
    <span
      className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${isActive ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
    >
      {label}
    </span>
    <div
      className={`flex h-[18px] items-center justify-center rounded-[14px] px-[5px] py-[1.4px] md:h-[20px] md:px-[6.5px] md:py-[1.6px] ${isActive ? activeBadgeClass : 'border-[#8c8c8c] border-[0.5px]'}`}
    >
      <span
        className={`font-sans text-[12px] leading-[1.05] md:text-[14px] ${isActive ? activeCountClass : 'text-[#8c8c8c]'}`}
      >
        {count}
      </span>
    </div>
  </button>
)

interface NamesTableProps {
  favorites?: DashboardNameRow[]
}

export const NamesTable = ({ favorites }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<DashboardNamesSortKey>('name')
  const [sortDirection, setSortDirection] =
    useState<DashboardNamesSortDirection>('asc')
  const [page, setPage] = useState(1)
  const pageSize = 5
  const favoriteNames = favorites ?? []
  const trimmedQuery = searchQuery.trim()
  const namesQuery = useDashboardNamesListQuery({
    query: trimmedQuery || undefined,
    sortBy,
    sortDirection,
    page,
    pageSize,
  })

  const displayedNames = namesQuery.data?.items ?? []
  const totalCount = namesQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const isLoading = namesQuery.isLoading && !namesQuery.data
  const isFetching = namesQuery.isFetching

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages))
  }, [totalPages])

  const onSearchChange = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const onSortChange = (key: DashboardNamesSortKey) => {
    setSortDirection((prev) =>
      sortBy === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc',
    )
    setSortBy(key)
    setPage(1)
  }

  const onPageChange = (nextPage: number) => {
    setPage(Math.max(1, nextPage))
  }

  const statusMessage = (() => {
    if (namesQuery.isError) return 'Error loading names'
    if (isLoading) return 'Loading names...'
    if (isFetching) return 'Updating...'
    return null
  })()

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-4 md:gap-[20px]">
        <div className="flex items-center gap-4 md:gap-[40px]">
          {[
            {
              key: 'myNames' as const,
              label: 'My Names',
              count: totalCount,
              activeBadgeClass: 'bg-[#e5f7ff]',
              activeCountClass: 'text-[#0080bc]',
            },
            {
              key: 'favorites' as const,
              label: 'Favorites',
              count: favoriteNames.length,
              activeBadgeClass: 'bg-[#ffecf5]',
              activeCountClass: 'text-[#f53293]',
            },
          ].map((tab) => {
            const isActive = activeTab === tab.key

            return (
              <DashboardTabButton
                key={tab.key}
                label={tab.label}
                count={tab.count}
                isActive={isActive}
                activeBadgeClass={tab.activeBadgeClass}
                activeCountClass={tab.activeCountClass}
                onClick={() => setActiveTab(tab.key)}
              />
            )
          })}
        </div>

        {activeTab === 'myNames' && (
          <div className="w-full md:w-[292px]">
            <Input
              size="sm"
              placeholder="Search my name..."
              startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
              className="h-[32px] rounded-[4.1px] border-none bg-[#f6f6f6] text-[#8c8c8c] text-[13.12px] placeholder:text-[#8c8c8c]"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
        )}

        {activeTab === 'myNames' && statusMessage && (
          <div className="text-[#7d7d7d] text-[12px] md:text-[13px]">
            {statusMessage}
          </div>
        )}
      </div>

      {activeTab === 'myNames' ? (
        <MyNamesList
          names={displayedNames}
          searchQuery={searchQuery}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
        />
      ) : (
        <FavoritesList favorites={favoriteNames} />
      )}
    </div>
  )
}
