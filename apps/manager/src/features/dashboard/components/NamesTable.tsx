import { useWallet } from '@getpara/react-sdk-lite'
import { Trans, useLingui } from '@lingui/react/macro'
import { useQueries } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { CountBadge } from '@/components/atoms/CountBadge'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { classifyNames } from '@/features/migration/service/classifyNames'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { isBackendAuthed } from '@/utils/backend-client'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { FavoritesList } from './FavoritesList'
import { MyNamesList } from './MyNamesList'

type TabKey = 'myNames' | 'favorites'

type TabButtonProps = {
  readonly label: ReactNode
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
      className={cn(
        'flex shrink-0 items-center gap-[12px]',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      type="button"
    >
      <span
        className={cn(
          'font-serif text-[20px] leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px]',
          isActive ? 'text-foreground' : 'text-ens-quartz-400',
        )}
      >
        {label}
      </span>
      {badge !== undefined && badge > 0 && <CountBadge value={badge} />}
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
  const { t } = useLingui()
  const [activeTab, setActiveTab] = useState<TabKey>('myNames')
  const [searchQuery, setSearchQuery] = useState('')
  const shouldReduceMotion = useReducedMotion()
  const isAuthed = useAtom(isBackendAuthed)
  const { data: wallet } = useWallet()
  const normalizedAddress = wallet?.address?.toLowerCase()
  const [favoritesQuery, ownedNamesCountQuery] = useQueries({
    queries: [
      {
        ...favoritesQueryOptions,
        enabled: isAuthed,
      },
      {
        ...ownedNamesCountQueryOptions(normalizedAddress),
        enabled: Boolean(normalizedAddress),
      },
    ],
  })

  const { ownerAddress } = useSmartAccountContext()
  const { data: v1NamesRaw } = useV1Names()

  const v1NamesCount = useMemo(() => {
    if (!v1NamesRaw || !ownerAddress) return 0
    return classifyNames(v1NamesRaw, ownerAddress as Address).classified.length
  }, [v1NamesRaw, ownerAddress])

  const { data: favorites = [] } = favoritesQuery
  const { data: ownedNamesCount } = ownedNamesCountQuery
  const favoritesCount = favorites.length
  const hasNoV2Names = ownedNamesCount === 0
  const totalNamesCount = hasNoV2Names
    ? v1NamesCount || undefined
    : ownedNamesCount

  const tabs = [
    {
      key: 'myNames' as const,
      label: <Trans>My Names</Trans>,
      badge: totalNamesCount,
    },
    {
      key: 'favorites' as const,
      label: <Trans>Favorites</Trans>,
      badge: favoritesCount,
      disabled: !isAuthed,
      disabledTooltip: t`Sign in to view favorites`,
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
              activeTab === 'myNames' ? t`Search my name...` : t`Search name...`
            }
            size="sm"
            startIcon={<Search className="size-[18px] text-muted-foreground" />}
            value={searchQuery}
          />
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {match(activeTab)
          .with('myNames', () => (
            <motion.div
              key="myNames"
              {...(shouldReduceMotion
                ? {}
                : {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0 },
                    transition: {
                      duration: 0.15,
                      ease: [0.25, 0.46, 0.45, 0.94] as const,
                    },
                  })}
            >
              <MyNamesList
                primaryLabel={primaryLabel}
                searchQuery={searchQuery}
              />
            </motion.div>
          ))
          .with('favorites', () => (
            <motion.div
              key="favorites"
              {...(shouldReduceMotion
                ? {}
                : {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0 },
                    transition: {
                      duration: 0.15,
                      ease: [0.25, 0.46, 0.45, 0.94] as const,
                    },
                  })}
            >
              <FavoritesList searchQuery={searchQuery} />
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  )
}
