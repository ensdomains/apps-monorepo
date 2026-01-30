import { useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { isBackendAuthed } from '@/utils/backend-client'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { FavoritesList } from './FavoritesList'
import { MyNamesList } from './MyNamesList'

type TabKey = 'myNames' | 'favorites'

type TabButtonProps = {
  readonly label: string
  readonly isActive: boolean
  readonly onClick: () => void
  readonly badge?: number
  readonly disabled?: boolean
  readonly disabledTooltip?: string
}

const DashboardTabButton = ({
  label,
  isActive,
  onClick,
  badge,
  disabled = false,
  disabledTooltip,
}: TabButtonProps) => {
  const button = (
    <button
      className={`flex shrink-0 items-center gap-[12px] ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      type="button"
    >
      <span
        className={`font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px] ${isActive ? 'text-foreground' : 'text-ens-gray-three'}`}
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

  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{disabledTooltip}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}

interface NamesTableProps {
  readonly primaryLabel?: string | null
}

export const NamesTable = ({ primaryLabel }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [searchQuery, setSearchQuery] = useState('')
  const isAuthed = useAtom(isBackendAuthed)
  const { data: favorites = [] } = useQuery(favoritesQueryOptions)
  const favoritesCount = favorites.length

  const tabs = [
    {
      key: 'myNames' as const,
      label: 'My Names',
    },
    {
      key: 'favorites' as const,
      label: 'Favorites',
      badge: favoritesCount,
      disabled: !isAuthed,
      disabledTooltip: 'Sign in to view favorites',
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
                disabled={'disabled' in tab ? tab.disabled : false}
                disabledTooltip={
                  'disabledTooltip' in tab ? tab.disabledTooltip : undefined
                }
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
            className="h-[32px] rounded-[4.1px] border-none bg-ens-white text-[13.12px] text-muted-foreground placeholder:text-muted-foreground"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={
              activeTab === 'myNames' ? 'Search my name...' : 'Search name...'
            }
            size="sm"
            startIcon={<Search className="size-[18px] text-muted-foreground" />}
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
