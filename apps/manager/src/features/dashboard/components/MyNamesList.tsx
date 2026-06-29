import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Mountain } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import {
  buildMergedNamesList,
  mergedRowMetadata,
  type SortDir,
  type SortField,
} from '@/features/dashboard/mergedNames'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { profileRecordsQuery } from '@/features/profile/service/profileRecords'
import { tw } from '@/utils/tailwind'
import { useOwnedDomains } from '../useOwnedDomains'
import { DashboardPagination } from './DashboardPagination'
import { NameRow } from './NameRow'
import { getNameRowProfilePreview } from './nameRowProfileRecords'

const PAGE_SIZE = 5

export type Sort = `${SortField}-${SortDir}`

interface MyNamesListProps {
  readonly migrationEnabled?: boolean
  readonly primaryLabel?: string | null
  readonly searchQuery?: string
  readonly sort: Sort
  readonly favoriteLabels: ReadonlySet<string>
  readonly onToggleFavorite: (label: string) => void
  readonly isAuthenticated: boolean
}

const NameRowSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="h-5 w-30 animate-pulse rounded-full bg-gray-200" />
    <div className="flex items-center gap-4">
      <div className="size-8.5 shrink-0 animate-pulse rounded-sm bg-gray-200" />
      <div className="h-7 w-37.5 animate-pulse rounded-xs bg-gray-200" />
    </div>
    <div className="h-4 w-45 animate-pulse rounded bg-gray-200" />
  </div>
)

const parseSort = (sort: Sort): { field: SortField; dir: SortDir } => {
  const [field, dir] = sort.split('-') as [SortField, SortDir]
  return { field, dir }
}

type MergedNameItem = ReturnType<typeof buildMergedNamesList>[number]

const AnimatedNameRow = ({
  item,
  index,
  shouldReduceMotion,
  primaryLabel,
  favoriteLabels,
  onToggleFavorite,
  isAuthenticated,
}: {
  readonly item: MergedNameItem
  readonly index: number
  readonly shouldReduceMotion: boolean | null
  readonly primaryLabel?: string | null
  readonly favoriteLabels: ReadonlySet<string>
  readonly onToggleFavorite: (label: string) => void
  readonly isAuthenticated: boolean
}) => {
  const {
    label,
    daysUntilExpiry,
    expiringSoon,
    formattedExpiryDate,
    isV1,
    isPrimary,
    isInGrace,
    expiryCta,
  } = mergedRowMetadata(item, primaryLabel)
  const { data: profileRecords } = useQuery({
    ...profileRecordsQuery(label),
    enabled: item.kind === 'v2' && !isInGrace,
  })
  const profilePreview = getNameRowProfilePreview({
    label,
    records: profileRecords,
  })

  return (
    <motion.div
      className="border-ens-quartz-250 border-b-[0.5px] py-8 first:pt-0 last:border-none md:first:pt-8"
      key={item.key}
      {...(shouldReduceMotion
        ? {}
        : {
            initial: { opacity: 0, y: 6 },
            animate: { opacity: 1, y: 0 },
            transition: {
              duration: 0.2,
              ease: [0.25, 0.46, 0.45, 0.94] as const,
              delay: index * 0.04,
            },
          })}
    >
      <NameRow
        avatarUrl={profilePreview.avatarUrl}
        cta={isV1 ? null : expiryCta}
        expiringInDays={!isInGrace && expiringSoon ? daysUntilExpiry : null}
        expiryLabel={formattedExpiryDate}
        isAuthenticated={isAuthenticated}
        isFavorite={favoriteLabels.has(label.toLowerCase())}
        isInGrace={isInGrace}
        label={label}
        nameRole="owner"
        nameVariant={isPrimary ? 'primary' : 'secondary'}
        onToggleFavorite={() => onToggleFavorite(label)}
        showFavoriteButton
        status={isV1 ? 'eligibleUpgrade' : null}
        themeColor={profilePreview.themeColor}
        verified={isPrimary}
      />
    </motion.div>
  )
}

export const MyNamesList = ({
  migrationEnabled = false,
  primaryLabel,
  searchQuery = '',
  sort,
  favoriteLabels,
  onToggleFavorite,
  isAuthenticated,
}: MyNamesListProps) => {
  const shouldReduceMotion = useReducedMotion()
  const [page, setPage] = useState(1)
  const { field: sortField, dir: sortDir } = parseSort(sort)

  const filterKey = `${searchQuery}:${sort}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const { eligible: v1Classified, isPending: isV1Pending } = useEligibleV1Names(
    { enabled: migrationEnabled },
  )
  const visibleV1Classified = useMemo(
    () => (migrationEnabled ? v1Classified : []),
    [migrationEnabled, v1Classified],
  )

  const {
    v2Names,
    isPending: isV2Pending,
    isError: isV2Error,
  } = useOwnedDomains()

  const mergedSortedFiltered = useMemo(
    () =>
      buildMergedNamesList({
        v2Names,
        v1Classified: visibleV1Classified,
        searchQuery,
        sortField,
        sortDir,
      }),
    [v2Names, visibleV1Classified, searchQuery, sortField, sortDir],
  )

  const total = mergedSortedFiltered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = mergedSortedFiltered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total)

  const isPending = isV2Pending || (migrationEnabled && isV1Pending)
  const hasPartialV2Error = isV2Error && v2Names.length > 0

  if (isV2Error && v2Names.length === 0) {
    return (
      <div className="py-8 text-center font-sans text-red-500 text-sm">
        <Trans>Error loading names</Trans>
      </div>
    )
  }

  return (
    <div className="w-full">
      {hasPartialV2Error ? (
        <div
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 font-sans text-red-600 text-sm"
          role="alert"
        >
          <Trans>Some names could not be loaded</Trans>
        </div>
      ) : null}

      <div className={tw`flex w-full flex-col`}>
        {match({ isPending, pageItems })
          .with({ isPending: true }, () => (
            <>
              <div className="border-ens-quartz-250 border-b-[0.41px] py-6">
                <NameRowSkeleton />
              </div>
              <div className="border-ens-quartz-250 border-b-[0.41px] py-6">
                <NameRowSkeleton />
              </div>
              <div className="py-6">
                <NameRowSkeleton />
              </div>
            </>
          ))
          .with({ pageItems: P.when((n) => n.length === 0) }, () => (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain
                className="size-12 text-ens-gray-three"
                strokeWidth={1}
              />
              <span className="font-sans text-muted-foreground text-sm">
                <Trans>No names to display</Trans>
              </span>
            </div>
          ))
          .otherwise(({ pageItems }) =>
            pageItems.map((item, index) => (
              <AnimatedNameRow
                favoriteLabels={favoriteLabels}
                index={index}
                isAuthenticated={isAuthenticated}
                item={item}
                key={item.key}
                onToggleFavorite={onToggleFavorite}
                primaryLabel={primaryLabel}
                shouldReduceMotion={shouldReduceMotion}
              />
            )),
          )}
      </div>

      {total > 0 && (
        <DashboardPagination
          currentPage={currentPage}
          disabled={isPending}
          onPageChange={setPage}
          rangeEnd={rangeEnd}
          rangeStart={rangeStart}
          total={total}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
