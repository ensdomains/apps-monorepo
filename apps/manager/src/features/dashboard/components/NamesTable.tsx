import { Trans, useLingui } from '@lingui/react/macro'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { Input } from '@/components/ui/input'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { isBackendAuthed } from '@/utils/backend-client'
import { addFavoriteMutationOptions } from '../service/mutations/addFavorite'
import { removeFavoriteMutationOptions } from '../service/mutations/removeFavorite'
import { favoritesQueryOptions } from '../service/queries/getFavorites'
import { useOwnedDomains } from '../useOwnedDomains'
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
  const [filter, setFilter] = useState<FilterKey>('owned')
  const [searchQuery, setSearchQuery] = useState('')
  const [ownedSort, setOwnedSort] = useState<Sort>('name-asc')
  const [favoritesSort, setFavoritesSort] = useState<FavoritesSort>('name-asc')
  const shouldReduceMotion = useReducedMotion()
  const isAuthed = useAtom(isBackendAuthed)
  const activeFilter = !isAuthed && filter === 'favorites' ? 'owned' : filter

  const { v2Names } = useOwnedDomains()
  const { data: favorites = [] } = useQuery({
    ...favoritesQueryOptions,
    enabled: isAuthed,
  })

  const { eligible: eligibleV1Names } = useEligibleV1Names({
    enabled: migrationEnabled,
  })

  const favoritesCount = favorites.length
  const ownedCount = v2Names.length + eligibleV1Names.length

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
      <div className="mb-5 flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="font-sans text-[28px] text-foreground leading-[0.96] tracking-[0.28px]">
            <Trans>My Names</Trans>
          </h2>
          <div className="w-full md:w-[352px]">
            <Input
              className="h-10 rounded-full border-none bg-ens-white text-base text-foreground tracking-[-0.32px] placeholder:text-ens-quartz-350"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t`Search my names`}
              startIcon={<Search className="size-4.5 text-ens-quartz-350" />}
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
              setFilter(next)
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
              <FavoritesList
                isAuthenticated={isAuthed}
                searchQuery={searchQuery}
                sort={favoritesSort}
              />
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  )
}
