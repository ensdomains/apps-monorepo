import {
  Domain_OrderBy,
  type DomainFragment,
  OrderDirection,
} from '@ens-apps/indexer'
import { useWallet } from '@getpara/react-sdk-lite'
import { Trans, useLingui } from '@lingui/react/macro'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleArrowLeft,
  CircleArrowRight,
  Mountain,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { match, P } from 'ts-pattern'
import type { Address } from 'viem'
import ensMarkBadge from '@/assets/ens-mark-badge.svg'
import {
  buildMergedNamesList,
  mergedRowMetadata,
  type SortDir,
  type SortField,
} from '@/features/dashboard/mergedNames'
import { GracePeriodBadge } from '@/features/grace/components/GracePeriodBadge'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import {
  type AvatarLookupEntry,
  namesAvatarsQuery,
} from '@/features/profile/service/profileAvatar'
import { useSmartAccountContextSafe } from '@/lib/smart-account/SmartAccountContext'
import { tw } from '@/utils/tailwind'
import { getAllDomainsInfiniteQuery } from '../service/queries/getAllDashboardDomains'
import { NameRow } from './NameRow'
import { PrimaryBadge } from './PrimaryBadge'

const PAGE_SIZE = 5

type Sort = `${SortField}-${SortDir}`

interface MyNamesListProps {
  readonly migrationEnabled?: boolean
  readonly primaryLabel?: string | null
  readonly searchQuery?: string
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

const SortIndicator = ({
  direction,
  isActive,
}: {
  readonly direction: 'asc' | 'desc'
  readonly isActive: boolean
}) => {
  if (!isActive) {
    return (
      <div className="flex flex-col">
        <ChevronDown className="size-[8.2px] rotate-180 text-black" />
        <ChevronDown className="size-[8.2px] text-black" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <ChevronDown
        className={`size-[8.2px] rotate-180 ${direction === 'asc' ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === 'desc' ? 'text-ens-blue' : 'text-ens-gray-three'}`}
      />
    </div>
  )
}

const parseSort = (sort: Sort): { field: SortField; dir: SortDir } => {
  const [field, dir] = sort.split('-') as [SortField, SortDir]
  return { field, dir }
}

export const MyNamesList = ({
  migrationEnabled = false,
  primaryLabel,
  searchQuery = '',
}: MyNamesListProps) => {
  const { t } = useLingui()
  const shouldReduceMotion = useReducedMotion()
  const { data: wallet } = useWallet()
  const smartAccount = useSmartAccountContextSafe()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<Sort>('name-desc')
  const { field: sortField, dir: sortDir } = parseSort(sort)

  const { eligible: v1Classified, isPending: isV1Pending } = useEligibleV1Names(
    { enabled: migrationEnabled },
  )
  const visibleV1Classified = useMemo(
    () => (migrationEnabled ? v1Classified : []),
    [migrationEnabled, v1Classified],
  )

  // Names can be owned by either the EOA or the EOA-authorized smart account
  // (HCA). On the rhinestone registration path the on-chain ENS owner is the
  // SCA; HCAEquivalence resolves SCA→EOA on-chain but the GraphQL indexer is
  // not HCA-aware, so we must query both addresses explicitly via owner_in.
  const ownerAddresses = useMemo(() => {
    const candidates = [
      wallet?.address,
      smartAccount?.accountAddress,
      smartAccount?.ownerAddress,
    ]
    const unique = new Set<string>()
    for (const addr of candidates) {
      if (addr) unique.add(addr.toLowerCase())
    }
    return Array.from(unique)
  }, [
    wallet?.address,
    smartAccount?.accountAddress,
    smartAccount?.ownerAddress,
  ])

  const hasOwnerAddresses = ownerAddresses.length > 0
  const ownerAddressesKey = ownerAddresses.join(',')

  const {
    data: v2Data,
    isPending: isV2Pending,
    isError: isV2Error,
    fetchNextPage: fetchNextV2Page,
    hasNextPage: hasNextV2Page,
    isFetchingNextPage: isFetchingNextV2Page,
  } = useInfiniteQuery(
    getAllDomainsInfiniteQuery(
      hasOwnerAddresses
        ? {
            where: { owner_in: ownerAddresses },
            orderBy:
              sortField === 'expiry'
                ? Domain_OrderBy.ExpiryDate
                : Domain_OrderBy.Name,
            orderDirection:
              sortDir === 'asc' ? OrderDirection.Asc : OrderDirection.Desc,
          }
        : undefined,
    ),
  )

  const v2Names: DomainFragment[] = v2Data ?? []

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset page on search change
  useEffect(() => {
    setPage(1)
  }, [searchQuery, ownerAddressesKey])

  useEffect(() => {
    if (isV2Error || !hasNextV2Page || isFetchingNextV2Page) return
    void fetchNextV2Page()
  }, [fetchNextV2Page, hasNextV2Page, isFetchingNextV2Page, isV2Error])

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

  const totalPages = Math.max(
    1,
    Math.ceil(mergedSortedFiltered.length / PAGE_SIZE),
  )
  const currentPage = Math.min(page, totalPages)
  const pageItems = mergedSortedFiltered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const hasNextPage = currentPage < totalPages

  const toggleSort = (field: 'name' | 'expiry') => {
    if (sortField === field) {
      setSort(`${field}-${sortDir === 'desc' ? 'asc' : 'desc'}`)
    } else {
      setSort(`${field}-${field === 'expiry' ? 'asc' : 'desc'}`)
    }
    setPage(1)
  }

  const avatarLookups = useMemo<AvatarLookupEntry[]>(
    () =>
      pageItems.flatMap((item) => {
        if (item.kind !== 'v2') return []
        const resolverAddress = item.domain.resolver?.address as
          | Address
          | undefined
        if (!resolverAddress) return []
        return [{ name: item.sortName, resolverAddress }]
      }),
    [pageItems],
  )

  const { data: pageAvatars } = useQuery(namesAvatarsQuery(avatarLookups))

  const isPending =
    (isV2Pending && hasOwnerAddresses) || (migrationEnabled && isV1Pending)
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

      {/* Mobile Sort Dropdown */}
      <div className="mb-4 flex md:hidden">
        <div className="flex h-8 items-center gap-1 rounded-full border border-border bg-white px-2">
          <span className="font-sans text-foreground text-xs tracking-[0.24px]">
            <Trans>Sort by</Trans>
          </span>
          <select
            aria-label={t`Sort names by`}
            className="bg-transparent font-medium font-sans text-foreground text-xs tracking-[0.24px] outline-none"
            onChange={(e) => {
              setSort(e.target.value as Sort)
              setPage(1)
            }}
            value={sort}
          >
            <option value="name-asc">
              <Trans>Name (A-Z)</Trans>
            </option>
            <option value="name-desc">
              <Trans>Name (Z-A)</Trans>
            </option>
            <option value="expiry-asc">
              <Trans>Expiry date (Earliest)</Trans>
            </option>
            <option value="expiry-desc">
              <Trans>Expiry date (Latest)</Trans>
            </option>
          </select>
        </div>
      </div>

      {/* Desktop Sort Header */}
      <div className="hidden w-full md:flex md:items-center md:justify-between">
        <button
          aria-label={
            sortField === 'name'
              ? sortDir === 'asc'
                ? t`Sort by name, currently ascending`
                : t`Sort by name, currently descending`
              : t`Sort by name, currently unsorted`
          }
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => toggleSort('name')}
          type="button"
        >
          <span
            className={`font-sans text-[16px] tracking-[0.24px] ${sortField === 'name' ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            <Trans>Name</Trans>
          </span>
          <SortIndicator direction={sortDir} isActive={sortField === 'name'} />
        </button>
        <button
          aria-label={
            sortField === 'expiry'
              ? sortDir === 'asc'
                ? t`Sort by expiry, currently ascending`
                : t`Sort by expiry, currently descending`
              : t`Sort by expiry, currently unsorted`
          }
          className="flex cursor-pointer items-center gap-[8px]"
          onClick={() => toggleSort('expiry')}
          type="button"
        >
          <span
            className={`font-sans text-[16px] tracking-[0.24px] ${sortField === 'expiry' ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            <Trans>Expiry</Trans>
          </span>
          <SortIndicator
            direction={sortDir}
            isActive={sortField === 'expiry'}
          />
        </button>
      </div>

      <div className={tw`flex w-full flex-col`}>
        {match({ isPending, pageItems })
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
            pageItems.map((item, index) => {
              const {
                label,
                daysUntilExpiry,
                expiringSoon,
                formattedExpiryDate,
                isV1,
                isPrimary,
                avatarUrl,
                isInGrace,
                showProminentRenew,
                useWireframeNameplate,
              } = mergedRowMetadata(
                item,
                primaryLabel,
                pageAvatars?.[item.sortName],
              )

              return (
                <motion.div
                  className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
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
                  {migrationEnabled && isV1 && (
                    <div className="mb-[10px]">
                      <Link
                        className="inline-flex items-center gap-1 rounded-full bg-[#feeaf0] px-1 py-0.5 transition-colors hover:bg-[#fcdbe5]"
                        to="/migration"
                      >
                        <img
                          alt=""
                          className="mt-[2px] size-4.5 shrink-0"
                          src={ensMarkBadge}
                        />
                        <span className="font-sans text-[#e72a96] text-[14px] leading-[1.05] tracking-[0.28px]">
                          <Trans>Eligible for upgrade</Trans>
                        </span>
                      </Link>
                    </div>
                  )}
                  {isInGrace && (
                    <div className="mb-[10px]">
                      <GracePeriodBadge />
                    </div>
                  )}
                  {isPrimary && (
                    <div className="mb-[10px]">
                      <PrimaryBadge />
                    </div>
                  )}
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <NameRow
                      avatarUrl={avatarUrl}
                      label={label}
                      linkToMigration={migrationEnabled && isV1}
                      useWireframeNameplate={useWireframeNameplate}
                    />
                    <div className="flex items-start gap-4 md:gap-[30px]">
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:flex-none md:items-end md:gap-[4px]">
                        <div className="flex flex-col items-start">
                          <span className="font-sans text-muted-foreground text-xs leading-[1.6] md:text-sm md:leading-[1.8]">
                            <Trans>Expires</Trans> {formattedExpiryDate}
                          </span>
                        </div>
                        {expiringSoon &&
                          !isInGrace &&
                          daysUntilExpiry !== null && (
                            <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#fff8f0] px-2 py-1">
                              <CircleAlert
                                className="size-3 shrink-0 text-[#e3a531]"
                                strokeWidth={2}
                              />
                              <span className="font-medium font-sans text-[#c68a1b] text-xs leading-none tracking-[0.24px]">
                                <Trans>Expires in {daysUntilExpiry} days</Trans>
                              </span>
                            </div>
                          )}
                      </div>
                      {showProminentRenew && (
                        <Link
                          className="inline-flex shrink-0 items-center gap-0.5 font-sans text-ens-blue text-sm leading-none tracking-[0.28px] hover:underline"
                          params={{ name: label }}
                          to="/renew/$name"
                        >
                          <Trans>Renew</Trans>
                          <ChevronRight className="size-4" strokeWidth={2} />
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            }),
          )}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-[12px]">
          <button
            aria-label={t`Previous page`}
            className="flex size-[32px] items-center justify-center text-ens-blue disabled:text-border"
            disabled={isPending || currentPage === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            <CircleArrowLeft className="size-[32px]" strokeWidth={1} />
          </button>
          <button
            aria-label={t`Next page`}
            className="flex size-[32px] items-center justify-center text-ens-blue disabled:text-border"
            disabled={isPending || !hasNextPage}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            <CircleArrowRight className="size-[32px]" strokeWidth={1} />
          </button>
        </div>
        <span className="flex items-center justify-center gap-1.5 font-sans text-[16px] text-muted-foreground leading-[1.2] tracking-[0.14px]">
          <Trans>Showing your names</Trans>
        </span>
      </div>
    </div>
  )
}
