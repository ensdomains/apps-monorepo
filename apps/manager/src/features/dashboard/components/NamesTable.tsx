import { Search } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  type DashboardNameRow,
  MOCK_FAVORITE_NAMES,
} from '@/features/dashboard/MOCK'
import { FavoritesList } from './FavoritesList'
import { MyNamesList } from './MyNamesList'

interface NamesTableProps {
  names?: DashboardNameRow[]
  isLoading: boolean
  error: unknown
}

export const MyNamesCard = ({ names, isLoading, error }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<'myNames' | 'favorites'>('myNames')

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading names</div>

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-4 md:gap-[20px]">
        <div className="flex items-center gap-4 overflow-x-auto md:gap-[40px]">
          <button
            type="button"
            onClick={() => setActiveTab('myNames')}
            className="flex shrink-0 items-center gap-2 md:gap-[12px]"
          >
            <span
              className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${activeTab === 'myNames' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              My Names
            </span>
            <div
              className={`flex h-[18px] items-center justify-center rounded-[14px] px-[5px] py-[1.4px] md:h-[20px] md:px-[6.5px] md:py-[1.6px] ${activeTab === 'myNames' ? 'bg-[#e5f7ff]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[12px] leading-[1.05] md:text-[14px] ${activeTab === 'myNames' ? 'text-[#0080bc]' : 'text-[#8c8c8c]'}`}
              >
                {names?.length ?? 0}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className="flex shrink-0 items-center gap-2 md:gap-[12px]"
          >
            <span
              className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${activeTab === 'favorites' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              {activeTab === 'favorites' ? 'Favorites List' : 'Favorites'}
            </span>
            <div
              className={`flex h-[18px] items-center justify-center rounded-[14px] px-[5px] py-[1.4px] md:h-[20px] md:px-[6.5px] md:py-[1.6px] ${activeTab === 'favorites' ? 'bg-[#ffecf5]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[12px] leading-[1.05] md:text-[14px] ${activeTab === 'favorites' ? 'text-[#f53293]' : 'text-[#8c8c8c]'}`}
              >
                {MOCK_FAVORITE_NAMES.length}
              </span>
            </div>
          </button>
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

      {activeTab === 'myNames' ? (
        <MyNamesList names={names} />
      ) : (
        <FavoritesList favorites={MOCK_FAVORITE_NAMES} />
      )}
    </div>
  )
}
