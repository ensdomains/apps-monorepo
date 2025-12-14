import { OrderDirection } from '@ens-apps/indexer'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
} from 'lucide-react'
import { match, P } from 'ts-pattern'
import {
  formatDashboardDate,
  getDaysUntil,
  isExpiringSoon,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { useDashboardNames } from '../hooks/useDashboardNames'
import { PrimaryBadge } from './PrimaryBadge'

interface MyNamesListProps {
  primaryLabel?: string | null
  searchQuery?: string
}

type SortIndicatorProps = {
  direction?: OrderDirection
  isActive: boolean
}

const SortIndicator = ({ direction, isActive }: SortIndicatorProps) => {
  if (!isActive) {
    return (
      <div className="flex flex-col">
        <ChevronDown className="size-[8.2px] rotate-180 text-[#d7d7d7]" />
        <ChevronDown className="size-[8.2px] text-[#d7d7d7]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <ChevronDown
        className={`size-[8.2px] rotate-180 ${direction === OrderDirection.Asc ? 'text-[#0080bc]' : 'text-[#d7d7d7]'}`}
      />
      <ChevronDown
        className={`size-[8.2px] ${direction === OrderDirection.Desc ? 'text-[#0080bc]' : 'text-[#d7d7d7]'}`}
      />
    </div>
  )
}

export const MyNamesList = ({
  primaryLabel,
  searchQuery = '',
}: MyNamesListProps) => {
  const {
    names,
    isLoading,
    isError,
    page,
    handlePrev,
    handleNext,
    pageSize,
    sortField,
    sortDirection,
    handleSort,
  } = useDashboardNames({ searchQuery })

  if (isError) {
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
              <button
                type="button"
                onClick={() => handleSort('name')}
                className="flex cursor-pointer items-center gap-[8px]"
              >
                <span
                  className={`font-sans text-[12px] tracking-[0.24px] ${sortField === 'name' ? 'font-bold text-[#232222]' : 'text-[#7d7d7d]'}`}
                >
                  Name
                </span>
                <SortIndicator
                  isActive={sortField === 'name'}
                  direction={sortDirection}
                />
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 md:gap-[30px]">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:w-[120px]">
            <div className="flex items-center gap-[8px]">
              <button
                type="button"
                onClick={() => handleSort('expiry')}
                className="flex cursor-pointer items-center gap-[8px]"
              >
                <span
                  className={`font-sans text-[12px] tracking-[0.24px] ${sortField === 'expiry' ? 'font-bold text-[#232222]' : 'text-[#7d7d7d]'}`}
                >
                  Expiry
                </span>
                <SortIndicator
                  isActive={sortField === 'expiry'}
                  direction={sortDirection}
                />
              </button>
            </div>
          </div>
          <div className="size-[24px] shrink-0" />
        </div>
      </div>

      <div className="flex w-full flex-col">
        {match({ isLoading, names })
          .with({ isLoading: true }, () => (
            <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
              Loading names...
            </div>
          ))
          .with({ names: P.when((n) => n.length === 0) }, () => (
            <div className="py-8 text-center font-sans text-[#8c8c8c] text-sm">
              No names found
            </div>
          ))
          .otherwise(({ names }) =>
            names.map((name) => {
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
                        <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
                          <div className="absolute inset-0 bg-linear-to-br from-purple-200 to-blue-200" />
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
                    </div>
                  </div>
                </div>
              )
            }),
          )}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-3 md:gap-[12px]">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isLoading || page === 1}
            className="flex items-center gap-1 rounded-[6px] border border-[#d3d3d3] px-3 py-1 text-[#7d7d7d] text-[11px] disabled:border-[#f0f0f0] disabled:text-[#d3d3d3] md:text-[12px]"
          >
            <ChevronLeft className="size-[14px]" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isLoading || names.length < pageSize}
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
