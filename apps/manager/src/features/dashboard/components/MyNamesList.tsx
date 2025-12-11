import {
  Domain_OrderBy,
  OrderDirection,
  useDomainsQuery,
} from '@ens-apps/indexer'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MoreHorizontal,
} from 'lucide-react'
import { useRef, useState } from 'react'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { useSmartAccount } from '@/lib/smart-account'
import { PrimaryBadge } from './PrimaryBadge'

interface MyNamesListProps {
  primaryLabel?: string | null
  searchQuery?: string
}

export const MyNamesList = ({
  primaryLabel,
  searchQuery = '',
}: MyNamesListProps) => {
  const { accountAddress } = useSmartAccount()
  const [page, setPage] = useState(1)
  const previousSearchRef = useRef<string>('')
  const PAGE_SIZE = 5

  const normalizedAddress = accountAddress?.toLowerCase()

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
        orderBy: Domain_OrderBy.RegistrationDate,
        orderDirection: OrderDirection.Desc,
      }
    : undefined

  const { data, loading, error } = useDomainsQuery(
    queryVariables
      ? {
          variables: queryVariables,
          onCompleted: () => {
            if (previousSearchRef.current !== searchQuery) {
              previousSearchRef.current = searchQuery
              if (page !== 1) {
                setPage(1)
              }
            }
          },
        }
      : { skip: true },
  )

  const names = normalizedAddress && data?.domains ? data.domains : []

  const handlePrev = () => {
    if (!loading && page > 1) {
      setPage((p) => p - 1)
    }
  }

  const handleNext = () => {
    if (!loading && names.length === PAGE_SIZE) {
      setPage((p) => p + 1)
    }
  }

  if (error) {
    return (
      <div className="py-8 text-center font-sans text-red-500 text-sm">
        Error loading names
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-[16px] hidden w-full md:flex md:items-center md:justify-between">
        <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[25px]">
          <div className="flex items-center gap-2 md:gap-[12px]">
            <div className="size-[32px] shrink-0 md:size-[36.9px]" />
            <div className="flex items-center gap-[8px]">
              <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
                Name
              </span>
              <div className="flex flex-col">
                <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
                <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 md:gap-[30px]">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px]">
            <div className="flex items-center gap-[8px]">
              <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
                Expiry
              </span>
              <div className="flex flex-col">
                <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
                <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
              </div>
            </div>
          </div>
          <div className="size-[24px] shrink-0" />
        </div>
      </div>

      {/* <div className="mb-[16px] flex h-[32px] items-center gap-[12px]">
        <div className="size-[12px] rounded-[3px] border-[#7d7d7d] border-[0.41px]" />
        <span className="font-sans text-[#232222] text-[14px] tracking-[0.28px]">
          Select all
        </span>
      </div> */}

      <div className="flex w-full flex-col">
        {loading ? (
          <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
            Loading names...
          </div>
        ) : (
          names.map((name) => {
            const label = resolveDomainLabel(name)
            const expiryDate = toDateFromSeconds(name.expiryDate ?? null)
            const daysUntilExpiry = getDaysUntil(expiryDate)
            const expiringSoon = isExpiringSoon(expiryDate, 30, daysUntilExpiry)
            const formattedExpiryDate = formatDashboardDate(expiryDate)
            const isPrimary =
              primaryLabel !== undefined &&
              label.toLowerCase() === primaryLabel?.toLowerCase()

            return (
              <div
                key={name.id}
                className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
              >
                {isPrimary && (
                  <div className="mb-[10px] px-[24px]">
                    <PrimaryBadge />
                  </div>
                )}

                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex w-full items-center gap-3 md:w-[340px] md:gap-[25px]">
                    <div className="flex items-center gap-2 md:gap-[12px]">
                      {/* <div className="size-[12px] shrink-0 rounded-[3px] border-[#7d7d7d] border-[0.41px]" /> */}
                      <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-200 to-blue-200" />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-center rounded-[2.8px] bg-[#e5f7ff] px-2 py-1 md:h-[24px] md:px-[8px] md:py-[4px]">
                        <Link
                          to="/p/$name"
                          params={{ name: label }}
                          className="mr-1 truncate font-medium font-mono text-[#0080bc] text-[14px] tracking-[-0.28px] md:mr-2 md:text-[16px] md:tracking-[-0.32px]"
                        >
                          {label}
                        </Link>
                        <ArrowUpRight
                          className="size-[6px] shrink-0 text-[#0080bc] md:size-[7px]"
                          strokeWidth={3}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4 md:gap-[30px]">
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px] md:gap-[4px]">
                      <div className="flex flex-col items-start">
                        <span className="font-sans text-[#515151] text-[12px] leading-[1.6] md:text-[14px] md:leading-[1.8]">
                          {formattedExpiryDate}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-[3.28px]">
                        <Link
                          to="/auto-renewal"
                          className="flex items-center gap-[4.92px] text-[#0080bc]"
                        >
                          <span className="font-sans text-[11px] leading-[1.6] md:text-[12px] md:leading-[1.8]">
                            Extend
                          </span>
                          <ArrowRight
                            className="size-[6px] md:size-[7.538px]"
                            strokeWidth={3}
                          />
                        </Link>
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

                    <button
                      type="button"
                      className="size-[24px] shrink-0 text-[#d9d9d9]"
                    >
                      <MoreHorizontal className="size-full" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-3 md:gap-[12px]">
          <button
            type="button"
            onClick={handlePrev}
            disabled={loading || page === 1}
            className="flex items-center gap-1 rounded-[6px] border border-[#d3d3d3] px-3 py-1 text-[#7d7d7d] text-[11px] disabled:border-[#f0f0f0] disabled:text-[#d3d3d3] md:text-[12px]"
          >
            <ChevronLeft className="size-[14px]" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={loading || names.length < PAGE_SIZE}
            className="flex items-center gap-1 rounded-[6px] border border-[#d3d3d3] px-3 py-1 text-[#7d7d7d] text-[11px] disabled:border-[#f0f0f0] disabled:text-[#d3d3d3] md:text-[12px]"
          >
            <span>Next</span>
            <ChevronRight className="size-[14px]" />
          </button>
        </div>
        <span className="text-center font-sans text-[#7d7d7d] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
          Showing your names
        </span>
      </div>
    </div>
  )
}
