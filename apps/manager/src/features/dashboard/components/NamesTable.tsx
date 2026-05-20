import { useWallet } from '@getpara/react-sdk-lite'
import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQueries } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { ownedNamesCountQueryOptions } from '@/features/shared/service/ownedNamesCount'
import { isBackendAuthed } from '@/utils/backend-client'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { FavoritesList, type FavoritesSort } from './FavoritesList'
import { type FilterChipDef, FilterChips } from './FilterChips'
import { MyNamesList, type Sort } from './MyNamesList'
import { SortMenu, type SortOption } from './SortMenu'

type FilterKey = 'owned' | 'favorites'

interface NamesTableProps {
  readonly primaryLabel?: string | null
  readonly migrationEnabled?: boolean
}

export const NamesTable = ({
  migrationEnabled = false,
  primaryLabel,
}: NamesTableProps) => {
  const { t } = useLingui()
  const [activeFilter, setActiveFilter] = useState<FilterKey>('owned')
  const [searchQuery, setSearchQuery] = useState('')
  const [ownedSort, setOwnedSort] = useState<Sort>('name-asc')
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSort>('name-asc')
  const shouldReduceMotion = useReducedMotion()
  const isAuthed = useAtom(isBackendAuthed)
  const { data: wallet } = useWallet()
  const normalizedAddress = wallet?.address?.toLowerCase()

  const [favoritesQuery, ownedNamesCountQuery] = useQueries({
    queries: [
      { ...favoritesQueryOptions, enabled: isAuthed },
      {
        ...ownedNamesCountQueryOptions(normalizedAddress),
        enabled: Boolean(normalizedAddress),
      },
    ],
  })

  const { eligible: eligibleV1Names } = useEligibleV1Names({
    enabled: migrationEnabled,
  })
  const v1NamesCount = eligibleV1Names.length

  const { data: favorites = [] } = favoritesQuery
  const { data: ownedNamesCount } = ownedNamesCountQuery
  const favoritesCount = favorites.length
  const ownedCount = (ownedNamesCount ?? 0) + v1NamesCount

  const favoriteLabels = useMemo(
    () => new Set(favorites.map((entry) => entry.name.toLowerCase())),
    [favorites],
  )

  const addMutation = useMutation(addFavoriteMutationOptions)
  const removeMutation = useMutation(removeFavoriteMutationOptions)
  const onToggleFavorite = (label: string) => {
    if (favoriteLabels.has(label.toLowerCase())) {
      removeMutation.mutate({ name: label })
    } else {
      addMutation.mutate({ name: label })
    }
  }

  const ownedSortOptions: SortOption<Sort>[] = [
    { value: 'name-asc', label: t`Name (A-Z)`, triggerLabel: t`Name` },
    { value: 'name-desc', label: t`Name (Z-A)`, triggerLabel: t`Name` },
    {
      value: 'expiry-asc',
      label: t`Expiry (Soonest)`,
      triggerLabel: t`Expiry`,
    },
    {
      value: 'expiry-desc',
      label: t`Expiry (Latest)`,
      triggerLabel: t`Expiry`,
    },
  ]

  const favoritesSortOptions: SortOption<FavoritesSort>[] = [
    { value: 'name-asc', label: t`Name (A-Z)`, triggerLabel: t`Name` },
    { value: 'name-desc', label: t`Name (Z-A)`, triggerLabel: t`Name` },
    {
      value: 'addedAt-desc',
      label: t`Recently added`,
      triggerLabel: t`Date added`,
    },
    {
      value: 'addedAt-asc',
      label: t`Oldest first`,
      triggerLabel: t`Date added`,
    },
  ]

  const chips: FilterChipDef<FilterKey>[] = [
    { value: 'owned', label: t`Owned`, count: ownedCount },
    {
      value: 'favorites',
      label: t`Favorites`,
      count: favoritesCount,
      disabled: !isAuthed,
    },
  ]

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-[20px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="font-sans text-[28px] text-foreground leading-[0.96] tracking-[0.28px]">
            <Trans>My Names</Trans>
          </h2>
          <div className="w-full md:w-[352px]">
            <Input
              className="h-10 rounded-full border-none bg-ens-white text-[16px] text-foreground tracking-[-0.32px] placeholder:text-ens-quartz-350"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t`Search my names`}
              startIcon={<Search className="size-[18px] text-ens-quartz-350" />}
              value={searchQuery}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
          {activeFilter === 'owned' ? (
            <SortMenu
              onChange={setOwnedSort}
              options={ownedSortOptions}
              value={ownedSort}
            />
          ) : (
            <SortMenu
              onChange={setFavoritesSort}
              options={favoritesSortOptions}
              value={favoritesSort}
            />
          )}
          <FilterChips
            chips={chips}
            onChange={(next) => {
              setActiveFilter(next)
              setSearchQuery('')
            }}
            value={activeFilter}
          />
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {match(activeFilter)
          .with('owned', () => (
            <motion.div
              key="owned"
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
                favoriteLabels={favoriteLabels}
                isAuthenticated={isAuthed}
                migrationEnabled={migrationEnabled}
                onToggleFavorite={onToggleFavorite}
                primaryLabel={primaryLabel}
                searchQuery={searchQuery}
                sort={ownedSort}
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
              <FavoritesList searchQuery={searchQuery} sort={favoritesSort} />
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  )
}
