import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useWallet } from '@getpara/react-sdk-lite'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Loader2,
  Mountain,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { match, P } from 'ts-pattern'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { tw } from '@/utils/tailwind'
import { getDomainsQuery } from '../service/queries/getDashboardDomains'
import { NameRow } from './NameRow'
import { PrimaryBadge } from './PrimaryBadge'

const PAGE_SIZE = 5

type SortField = 'name' | 'expiry' | 'registration'

interface MyNamesListProps {
  readonly primaryLabel?: string | null
  readonly searchQuery?: string
}

type SortIndicatorProps = {
  readonly direction?: OrderDirection
  readonly isActive: boolean
}

const NameRowSkeleton = () => (
  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
    <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[12px]">
      <div className="size-[16px] shrink-0 animate-pulse rounded bg-gray-200" />
      <div className="flex items-center gap-2 md:gap-[12px]">
        <div className="size-[32px] shrink-0 animate-pulse rounded-full bg-gray-200 md:size-[36.9px]" />
        <div className="h-[24px] w-[120px] animate-pulse rounded-[2.8px] bg-gray-200 md:w-[150px]" />
      </div>
    </div>
    <div className="flex items-start gap-4 md:gap-[30px]">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:gap-[4px]">
        <div className="h-[20px] w-[80px] animate-pulse rounded bg-gray-200" />
        <div className="h-[16px] w-[50px] animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  </div>
)

const SortIndicator = ({ direction, isActive }: SortIndicatorProps) => {
  if (!isActive) {
    return (
      <div className="flex flex-col">
        <ChevronDown className="size-[8.2px] rotate-180 text-ens-gray-three" />
        <ChevronDown className="size-[8.2px] text-ens-gray-three" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <ChevronDown
        className={`size-[8.2px] rotate-180 ${direction === OrderDirection.Asc ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === OrderDirection.Desc ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
    </div>
  )
}

export const MyNamesList = ({
  primaryLabel,
  searchQuery = '',
}: MyNamesListProps) => {
  const shouldReduceMotion = useReducedMotion()
  const { data: wallet } = useWallet()
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('registration')
  const [sortDirection, setSortDirection] = useState<OrderDirection | null>(
    null,
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset page on search change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, wallet?.address])

  const normalizedAddress = wallet?.address?.toLowerCase()

  const orderBy = match(sortField)
    .with('name', () => Domain_OrderBy.Name)
    .with('expiry', () => Domain_OrderBy.ExpiryDate)
    .with('registration', () => Domain_OrderBy.RegistrationDate)
    .exhaustive()

  const queryVariables = normalizedAddress
    ? {
        where: {
          owner: normalizedAddress,
          ...(searchQuery
            ? { name_contains_nocase: searchQuery.toLowerCase() }
            : {}),
        },
        first: PAGE_SIZE,
        skip: (page - 1) * PAGE_SIZE,
        orderBy,
        orderDirection: sortDirection ?? OrderDirection.Desc,
      }
    : undefined

  const { data, isPending, isError, isPlaceholderData } = useQuery({
    ...getDomainsQuery(queryVariables),
    placeholderData: keepPreviousData,
  })

  const names: DomainFragment[] =
    normalizedAddress && data?.domains ? data.domains : []

  const handlePrev = () => {
    if (!isPending && page > 1) {
      setPage((p) => p - 1)
    }
  }

  const handleNext = () => {
    if (!isPending && names.length === PAGE_SIZE) {
      setPage((p) => p + 1)
    }
  }

  const setSort = (field: SortField, direction: OrderDirection) => {
    setSortField(field)
    setSortDirection(direction)
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field && sortDirection !== null) {
      setSortDirection((prev) =>
        prev === OrderDirection.Desc ? OrderDirection.Asc : OrderDirection.Desc,
      )
    } else {
      setSortField(field)
      setSortDirection(
        field === 'expiry' ? OrderDirection.Asc : OrderDirection.Desc,
      )
    }
  }

  const avatarQueries = useQueries({
    queries: names.map((domain) =>
      parseAvatarQuery(domain.resolver?.avatar ?? undefined),
    ),
  })

  const hasNextPage = names.length === PAGE_SIZE

  if (isError) {
    return (
      <div className="py-8 text-center font-sans text-red-500 text-sm">
        Error loading names
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Mobile Sort Dropdown */}
      <div className="mb-4 flex md:hidden">
        <div className="flex h-8 items-center gap-1 rounded-full border border-border bg-white px-2">
          <span className="font-sans text-[12px] text-foreground tracking-[0.24px]">
            Sort by
          </span>
          <select
            aria-label="Sort names by"
            className="bg-transparent font-medium font-sans text-[12px] text-foreground tracking-[0.24px] outline-none"
            onChange={(e) => {
              const [field, direction] = e.target.value.split('-') as [
                'name' | 'expiry',
                'asc' | 'desc',
              ]
              setSort(
                field,
                direction === 'asc' ? OrderDirection.Asc : OrderDirection.Desc,
              )
            }}
            value={
              sortDirection
                ? `${sortField}-${sortDirection === OrderDirection.Asc ? 'asc' : 'desc'}`
                : 'name-asc'
            }
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="expiry-asc">Expiry date (Earliest)</option>
            <option value="expiry-desc">Expiry date (Latest)</option>
          </select>
        </div>
      </div>

      {/* Desktop Sort Header */}
      <div className="hidden w-full md:flex md:items-center md:justify-between">
        <button
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => toggleSort('name')}
          type="button"
        >
          <span
            className={`font-sans text-sm tracking-[0.24px] ${sortDirection !== null && sortField === 'name' ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            Name
          </span>
          <SortIndicator
            direction={sortDirection ?? undefined}
            isActive={sortDirection !== null && sortField === 'name'}
          />
        </button>
        <button
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => toggleSort('expiry')}
          type="button"
        >
          <span
            className={`font-sans text-sm tracking-[0.24px] ${sortDirection !== null && sortField === 'expiry' ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            Expiry
          </span>
          <SortIndicator
            direction={sortDirection ?? undefined}
            isActive={sortDirection !== null && sortField === 'expiry'}
          />
        </button>
      </div>

      <div
        className={tw`flex w-full flex-col transition-opacity ${isPlaceholderData && 'opacity-50'}`}
      >
        {match({ isPending, names })
          .with({ isPending: true }, () => (
            <>
              <div className="border-[lightgrey] border-b-[0.41px] py-[24px]">
                <NameRowSkeleton />
              </div>
              <div className="border-[lightgrey] border-b-[0.41px] py-[24px]">
                <NameRowSkeleton />
              </div>
              <div className="py-[24px]">
                <NameRowSkeleton />
              </div>
            </>
          ))
          .with({ names: P.when((n) => n.length === 0) }, () => (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Mountain
                className="size-12 text-ens-gray-three"
                strokeWidth={1}
              />
              <span className="font-sans text-muted-foreground text-sm">
                No names to display
              </span>
            </div>
          ))
          .otherwise(({ names }) =>
            names.map((name, index) => {
              const label = resolveDomainLabel(name)
              const expiryDate = toDateFromSeconds(name.expiryDate ?? null)
              const daysUntilExpiry = getDaysUntil(expiryDate)
              const expiringSoon = isExpiringSoon(
                expiryDate,
                30,
                daysUntilExpiry,
              )
              const formattedExpiryDate = formatDashboardDate(expiryDate)
              const isPrimary =
                primaryLabel !== undefined &&
                label.toLowerCase() === primaryLabel?.toLowerCase()
              const avatarUrl =
                avatarQueries[index]?.data ?? name.resolver?.avatar ?? undefined

              return (
                <motion.div
                  className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
                  key={name.id}
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
                  {isPrimary && (
                    <div className="mb-[10px] px-[24px]">
                      <PrimaryBadge />
                    </div>
                  )}
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <NameRow avatarUrl={avatarUrl} label={label} />
                    <div className="flex items-start gap-4 md:gap-[30px]">
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:gap-[4px]">
                        <div className="flex flex-col items-start">
                          <span className="font-sans text-[12px] text-muted-foreground leading-[1.6] md:text-[14px] md:leading-[1.8]">
                            {formattedExpiryDate}
                          </span>
                        </div>
                        {expiringSoon && daysUntilExpiry !== null && (
                          <div className="flex items-center gap-[3px] rounded-[20px] bg-[#fff8f0] p-[3px] md:gap-[4px] md:p-[4px]">
                            <CircleAlert
                              className="size-[10px] text-[#e3a531] md:size-[12px]"
                              strokeWidth={2}
                            />
                            <span className="font-sans text-[#c68a1b] text-[10px] leading-[1.05] tracking-[0.2px] md:text-[12px] md:tracking-[0.24px]">
                              Expires in {daysUntilExpiry} days
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            }),
          )}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-3 md:gap-[12px]">
          <button
            className="flex items-center gap-1 rounded-[6px] border border-ens-gray-three px-3 py-1 text-[11px] text-muted-foreground disabled:border-ens-white disabled:text-ens-gray-three md:text-[12px]"
            disabled={isPending || page === 1}
            onClick={handlePrev}
            type="button"
          >
            <ChevronLeft className="size-[14px]" />
            <span>Previous</span>
          </button>
          {hasNextPage && (
            <button
              className="flex items-center gap-1 rounded-[6px] border border-ens-gray-three px-3 py-1 text-[11px] text-muted-foreground disabled:border-ens-white disabled:text-ens-gray-three md:text-[12px]"
              disabled={isPending}
              onClick={handleNext}
              type="button"
            >
              <span>Next</span>
              <ChevronRight className="size-[14px]" />
            </button>
          )}
        </div>
        <span className="flex items-center justify-center gap-1.5 font-sans text-[11px] text-muted-foreground leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
          {isPlaceholderData && (
            <Loader2 className="size-[12px] animate-spin" />
          )}
          Showing your names
        </span>
      </div>
    </div>
  )
}
