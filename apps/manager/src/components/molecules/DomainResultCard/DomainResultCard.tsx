import { Link } from '@tanstack/react-router'
import type { HTMLAttributeAnchorTarget, MouseEventHandler } from 'react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { DomainAttributePillVariant } from './DomainAttributePill'
import { DomainAttributePill } from './DomainAttributePill'

const AvailabilityCheckIcon = () => (
  <svg
    aria-hidden="true"
    className="h-[26px] w-[26px]"
    fill="none"
    viewBox="0 0 26 26"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      clipRule="evenodd"
      d="M13 22.75c1.2804 0 2.5482-.2522 3.7312-.7422 1.1829-.49 2.2577-1.2081 3.1631-2.1135s1.5178-1.9802 2.0078-3.1631c.49-1.183.7422-2.4508.7422-3.7312 0-1.2804-.2522-2.5482-.7422-3.73116-.49-1.18293-1.2081-2.25776-2.1135-3.16313-.9054-.90537-1.9802-1.62355-3.1631-2.11353C15.5482 3.50219 14.2804 3.25 13 3.25 10.4141 3.25 7.93419 4.27723 6.10571 6.10571 4.27723 7.93419 3.25 10.4141 3.25 13c0 2.5859 1.02723 5.0658 2.85571 6.8943C7.93419 21.7228 10.4141 22.75 13 22.75Zm-.2513-5.8067 5.4166-6.5-1.664-1.38663-4.6583 5.58893-2.41038-2.4115-1.53183 1.5318 3.25005 3.25.8385.8385.7594-.9111Z"
      fill="var(--color-brand-green)"
      fillRule="evenodd"
    />
  </svg>
)

type DomainResultCardLinkProps = {
  to: string
  params?: Record<string, unknown>
  search?: Record<string, unknown>
  hash?: string
  replace?: boolean
  target?: HTMLAttributeAnchorTarget
  rel?: string
  onClick?: MouseEventHandler<HTMLAnchorElement>
}

export interface DomainResultCardProps {
  domainName: string
  status: 'available' | 'premium'
  isPremium?: boolean
  price?: number
  priceLabel?: string
  onAction?: (domainName: string) => void
  className?: string
  link?: DomainResultCardLinkProps
}

const statusIconMap = {
  available: <AvailabilityCheckIcon />,
  premium: <AvailabilityCheckIcon />,
} as const

export const DomainResultCard = ({
  domainName,
  status,
  isPremium: isPremiumProp = false,
  price,
  priceLabel = 'USD / year',
  onAction,
  className,
  link,
}: DomainResultCardProps) => {
  const showPremiumPill = isPremiumProp || status === 'premium'

  const premiumLabel = useMemo(() => {
    const name = domainName.includes('.')
      ? domainName.slice(0, domainName.lastIndexOf('.'))
      : domainName
    const length = name.length
    if (!length) return null

    const variant: DomainAttributePillVariant =
      length <= 3 ? 'premium-3' : 'premium-4'
    return {
      label: `${length} character premium name`,
      variant,
    } as const
  }, [domainName])

  const baseClasses = cn(
    'flex',
    'flex-col',
    'w-full',
    'gap-3',
    'px-5',
    'py-5',
    'text-left',
    'bg-[#f6f6f6]',
    'rounded-[4px]',
    'shadow-[0px_20.905px_27.874px_0px_rgba(14,61,104,0.06)]',
    'transition',
    'domain-result-card',
    {
      'cursor-pointer': link || onAction,
      'hover:-translate-y-0.5': link || onAction,
      'hover:shadow-[0px_20px_28px_-12px_rgba(15,23,42,0.20)]':
        link || onAction,
    },
    className,
  )

  const content = (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center justify-between gap-4 px-[22px]">
        <div className="flex items-center gap-[9px]">
          <span className="flex items-center justify-center">
            {statusIconMap[status]}
          </span>
          <span
            className={cn(
              'px-2',
              'py-1',
              'text-2xl',
              'font-medium',
              'leading-none',
              'tracking-[-0.48px]',
              'text-brand-blue',
              'bg-white',
              'border',
              'border-brand-blue',
              'rounded-[4px]',
            )}
          >
            {domainName}
          </span>
        </div>

        <div className="flex items-end gap-2 text-center">
          <span className="text-slate-500 text-sm">Starting at</span>

          <p className="font-semibold text-slate-900">
            ${price !== undefined ? Math.round(price).toLocaleString() : ''}
          </p>
          <p className="text-slate-500 text-sm">{priceLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-[34px]">
        <DomainAttributePill label="available" variant="available" />
        {showPremiumPill && premiumLabel && (
          <DomainAttributePill
            label={premiumLabel.label}
            variant={premiumLabel.variant}
          />
        )}
      </div>
    </div>
  )

  const handleAction = () => {
    if (!onAction) return
    onAction(domainName)
  }

  if (link) {
    const { onClick, to, params, search, hash, replace, target, rel } = link

    return (
      <Link
        to={to as never}
        params={params as never}
        search={search as never}
        hash={hash}
        replace={replace}
        target={target}
        rel={rel}
        className={baseClasses}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented && onAction) {
            onAction(domainName)
          }
        }}
      >
        {content}
      </Link>
    )
  }

  if (onAction) {
    return (
      <button
        type="button"
        className={baseClasses}
        onClick={handleAction}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            handleAction()
          }
        }}
      >
        {content}
      </button>
    )
  }

  return <div className={baseClasses}>{content}</div>
}

DomainResultCard.displayName = 'DomainResultCard'
