import { Link } from '@tanstack/react-router'
import { AvailabilityCheckIcon } from '@/components/atoms/AvailabilityCheckIcon'
import type { PremiumLabel } from '@/features/register/utils'
import { cn } from '@/lib/utils'
import { DomainAttributePill } from './DomainAttributePill'

interface DomainResultCardProps {
  domainName: string
  status: 'available' | 'premium'
  premiumLabel?: PremiumLabel
  price?: number
  priceLabel?: string
  className?: string
  link?: string
  isLoading?: boolean
}

const statusIconMap = {
  available: <AvailabilityCheckIcon />,
  premium: <AvailabilityCheckIcon />,
} as const

export const DomainResultCard = ({
  domainName,
  status,
  premiumLabel,
  price,
  priceLabel = '/year',
  className,
  link,
  isLoading = false,
}: DomainResultCardProps) => {
  const baseClasses = cn(
    'domain-result-card',
    'flex w-full flex-col',
    'gap-3',
    'px-5 py-5',
    'text-left',
    'bg-ens-white',
    'rounded-[4px]',
    'shadow-lg transition',
    link && 'hover:-translate-y-0.5 cursor-pointer hover:shadow-xl',
    className,
  )

  const content = (
    <div className="flex w-full flex-col gap-3">
      {isLoading ? (
        <>
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-[9px]">
              <span className="flex h-[26px] w-[26px] animate-pulse items-center justify-center rounded-full bg-slate-200" />
              <span className="inline-block h-9 w-48 animate-pulse rounded-[4px] bg-slate-200" />
            </div>

            <div className="flex items-end gap-2 text-center">
              <span className="inline-block h-5 w-20 animate-pulse rounded-md bg-slate-200 leading-tight" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-[34px]">
            <span className="inline-block h-6 w-20 animate-pulse rounded-full bg-slate-200" />
            <span className="inline-block h-6 w-32 animate-pulse rounded-full bg-slate-200" />
          </div>
        </>
      ) : (
        <>
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-[9px]">
              <span className="flex items-center justify-center">
                {statusIconMap[status]}
              </span>
              <span
                className={cn(
                  'px-2 py-1',
                  'text-2xl text-ens-blue',
                  'bg-white',
                  'border border-ens-blue',
                  'font-medium leading-none tracking-[-0.48px]',
                  'block rounded-[4px]',
                  'max-w-[10ch] truncate sm:max-w-[40ch]', // Mobile: 10 chars, Desktop: 40 chars
                )}
                title={domainName}
              >
                {domainName}
              </span>
            </div>

            <div className="flex items-start gap-2 text-center md:items-end">
              <span className="text-slate-500 text-sm">starting at</span>
              <div className="flex flex-col items-start text-sm md:flex-row md:items-end md:gap-2 md:text-base">
                {price ? (
                  <>
                    <p className="font-semibold text-slate-900 leading-tight">
                      ${Math.round(price).toLocaleString()}
                    </p>
                    <p className="text-slate-500 text-sm">{priceLabel}</p>
                  </>
                ) : (
                  <div className="flex items-end gap-2 text-center">
                    <span className="inline-block h-5 w-20 animate-pulse rounded-md bg-slate-200 leading-tight" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-[34px]">
            <DomainAttributePill label="available" variant="available" />
            {premiumLabel && (
              <DomainAttributePill
                label={premiumLabel.label}
                variant={premiumLabel.variant}
              />
            )}
          </div>
        </>
      )}
    </div>
  )

  if (link) {
    return (
      <Link to={link as never} className={baseClasses}>
        {content}
      </Link>
    )
  }

  return <div className={baseClasses}>{content}</div>
}

DomainResultCard.displayName = 'DomainResultCard'
