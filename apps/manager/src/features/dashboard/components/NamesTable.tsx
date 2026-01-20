import { Search } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import { useFavorites } from '../hooks/useFavorites'
import { FavoritesList } from './FavoritesList'
import { MyNamesList } from './MyNamesList'

type TabKey = 'myNames' | 'favorites'

type TabButtonProps = {
  label: string
  isActive: boolean
  onClick: () => void
  badge?: number
}

const DashboardTabButton = ({
  label,
  isActive,
  onClick,
  badge,
}: TabButtonProps) => (
  <button
    className="flex shrink-0 items-center gap-[12px]"
    onClick={onClick}
    type="button"
  >
    <span
      className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${isActive ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
    >
      {label}
    </span>
    {badge !== undefined && badge > 0 && (
      <span className="flex h-[19.68px] items-center justify-center rounded-[14px] bg-[#ffecf5] px-[6.56px] py-[1.64px] font-sans text-[#f53293] text-[14px] leading-[1.05] tracking-[0.28px]">
        {badge}
      </span>
    )}
  </button>
)

interface NamesTableProps {
  primaryLabel?: string | null
}

export const NamesTable = ({ primaryLabel }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [searchQuery, setSearchQuery] = useState('')
  const { favoritesCount } = useFavorites()

  const tabs = [
    {
      key: 'myNames' as const,
      label: 'My Names',
    },
    {
      key: 'favorites' as const,
      label: 'Favorites',
      badge: favoritesCount,
    },
  ]

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-4 md:gap-[20px]">
        <div className="flex items-center gap-4 md:gap-[40px]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key

            return (
              <DashboardTabButton
                badge={'badge' in tab ? tab.badge : undefined}
                isActive={isActive}
                key={tab.key}
                label={tab.label}
                onClick={() => {
                  setActiveTab(tab.key)
                  setSearchQuery('')
                }}
              />
            )
          })}
        </div>

        <div className="w-full md:w-[292px]">
          <Input
            className="h-[32px] rounded-[4.1px] border-none bg-ens-white text-[#8c8c8c] text-[13.12px] placeholder:text-[#8c8c8c]"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              activeTab === 'myNames' ? 'Search my name...' : 'Search name...'
            }
            size="sm"
            startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
            value={searchQuery}
          />
        </div>
      </div>

      {match(activeTab)
        .with('myNames', () => (
          <MyNamesList primaryLabel={primaryLabel} searchQuery={searchQuery} />
        ))
        .with('favorites', () => <FavoritesList searchQuery={searchQuery} />)
        .exhaustive()}
    </div>
  )
}
