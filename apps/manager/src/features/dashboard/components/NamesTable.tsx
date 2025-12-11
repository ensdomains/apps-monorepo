import { Search } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
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
  primaryLabel?: string | null
}

export const NamesTable = ({ primaryLabel }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [searchQuery, setSearchQuery] = useState('')

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

        {match(activeTab)
          .with('myNames', () => (
            <div className="w-full md:w-[292px]">
              <Input
                size="sm"
                placeholder="Search my name..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
                className="h-[32px] rounded-[4.1px] border-none bg-ens-white text-[#8c8c8c] text-[13.12px] placeholder:text-[#8c8c8c]"
              />
            </div>
          ))
          .otherwise(() => null)}
      </div>

      <MyNamesList primaryLabel={primaryLabel} searchQuery={searchQuery} />
    </div>
  )
}
