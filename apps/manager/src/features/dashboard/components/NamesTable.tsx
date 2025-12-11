import type { DomainFragment } from '@ens-apps/indexer'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { MyNamesList } from './MyNamesList'

type TabKey = 'myNames' // | 'favorites'

type TabButtonProps = {
  label: string
  isActive: boolean
  onClick: () => void
}

const DashboardTabButton = ({ label, isActive, onClick }: TabButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex shrink-0 items-center"
  >
    <span
      className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${isActive ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
    >
      {label}
    </span>
  </button>
)

interface NamesTableProps {
  names?: DomainFragment[]
  // favorites?: DashboardNameRow[]
  primaryLabel?: string | null
  isLoading: boolean
  error: unknown
}

export const NamesTable = ({
  names = [],
  // favorites,
  primaryLabel,
  isLoading,
  error,
}: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 5
  // const favoriteNames = favorites ?? []

  if (error) return <div>Error loading names</div>

  const total = names.length
  const totalPages = total > 0 ? Math.ceil(total / PAGE_SIZE) : 1

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const startIndex = (page - 1) * PAGE_SIZE
  const paginatedNames =
    total > 0 ? names.slice(startIndex, startIndex + PAGE_SIZE) : names

  const canPrev = page > 1
  const canNext = page < totalPages

  const handlePrev = () => {
    if (canPrev) setPage((prev) => prev - 1)
  }

  const handleNext = () => {
    if (canNext) setPage((prev) => prev + 1)
  }

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-4 md:gap-[20px]">
        <div className="flex items-center gap-4 md:gap-[40px]">
          {[
            {
              key: 'myNames' as const,
              label: 'My Names',
            },
            // {
            //   key: 'favorites' as const,
            //   label: 'Favorites',
            //   count: favoriteNames.length,
            //   activeBadgeClass: 'bg-[#ffecf5]',
            //   activeCountClass: 'text-[#f53293]',
            // },
          ].map((tab) => {
            const isActive = activeTab === tab.key

            return (
              <DashboardTabButton
                key={tab.key}
                label={tab.label}
                isActive={isActive}
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
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
          Loading names...
        </div>
      ) : (
        <MyNamesList
          names={paginatedNames}
          primaryLabel={primaryLabel}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}
      {/* {activeTab === 'myNames' ? (
        <MyNamesList names={names} primaryLabel={primaryLabel} />
      ) : (
        <FavoritesList favorites={favoriteNames} />
      )} */}
    </div>
  )
}
