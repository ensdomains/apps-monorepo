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
      <div className="mb-[20px] flex flex-col gap-[20px]">
        <div className="flex items-center gap-[40px]">
          <button
            type="button"
            onClick={() => setActiveTab('myNames')}
            className="flex items-center gap-[12px]"
          >
            <span
              className={`font-serif text-[28px] leading-[0.96] tracking-[0.28px] ${activeTab === 'myNames' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              My Names
            </span>
            <div
              className={`flex h-[20px] items-center justify-center rounded-[14px] px-[6.5px] py-[1.6px] ${activeTab === 'myNames' ? 'bg-[#e5f7ff]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[14px] leading-[1.05] ${activeTab === 'myNames' ? 'text-[#0080bc]' : 'text-[#8c8c8c]'}`}
              >
                {names?.length ?? 0}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className="flex items-center gap-[12px]"
          >
            <span
              className={`font-serif text-[28px] leading-[0.96] tracking-[0.28px] ${activeTab === 'favorites' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              {activeTab === 'favorites' ? 'Favorites List' : 'Favorites'}
            </span>
            <div
              className={`flex h-[20px] items-center justify-center rounded-[14px] px-[6.5px] py-[1.6px] ${activeTab === 'favorites' ? 'bg-[#ffecf5]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[14px] leading-[1.05] ${activeTab === 'favorites' ? 'text-[#f53293]' : 'text-[#8c8c8c]'}`}
              >
                {MOCK_FAVORITE_NAMES.length}
              </span>
            </div>
          </button>
        </div>

        {activeTab === 'myNames' && (
          <div className="w-[292px]">
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
