import { Link } from '@tanstack/react-router'
import { ArrowRight, Calendar, Clock } from 'lucide-react'
import type { MouseEventHandler } from 'react'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { cn } from '@/lib/utils'

export interface DomainProfileCardProps {
  domainName: string
  avatarUrl?: string | null
  registeredDate?: Date | string | null
  expiryDate?: Date | string | null
  onAction?: (domainName: string) => void
  className?: string
  link?: {
    to: string
    params?: Record<string, unknown>
    search?: Record<string, unknown>
    hash?: string
    replace?: boolean
    target?: React.HTMLAttributeAnchorTarget
    rel?: string
    onClick?: MouseEventHandler<HTMLAnchorElement>
  }
}

const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return ''

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (Number.isNaN(dateObj.getTime())) return ''

  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const DomainProfileCard = ({
  domainName,
  avatarUrl,
  registeredDate,
  expiryDate,
  onAction,
  className,
  link,
}: DomainProfileCardProps) => {
  const formattedRegisteredDate = formatDate(registeredDate) || 'N/A'
  const formattedExpiryDate = formatDate(expiryDate) || 'N/A'

  const baseClasses = cn(
    'flex',
    'flex-col',
    'w-full',
    'h-[157px]',
    'py-[22px]',
    'bg-ens-white',
    'rounded-[4px]',
    'shadow-[0px_20.905px_27.874px_0px_rgba(14,61,104,0.06)]',
    'transition',
    'domain-profile-card',
    {
      'cursor-pointer': link || onAction,
      'hover:-translate-y-0.5': link || onAction,
      'hover:shadow-[0px_20px_28px_-12px_rgba(15,23,42,0.20)]':
        link || onAction,
    },
    className,
  )

  const content = (
    <div className="flex h-full w-full items-end justify-between gap-4">
      {/* Left section: Avatar and Domain Info */}
      <div className="flex h-full items-center gap-4">
        {/* Avatar */}
        <div className="relative size-[113px] shrink-0">
          <div className="size-[113px] overflow-clip rounded-[5.215px] bg-ens-white">
            <img
              src={avatarUrl || placeholderAvatar}
              alt={`${domainName} avatar`}
              className="size-full object-cover"
            />
          </div>
        </div>

        {/* Domain Info */}
        <div className="flex h-full flex-col justify-start gap-2">
          {/* Domain Name Badge */}
          <div className="flex items-center justify-center gap-[10px] rounded-[4px] bg-ens-magenta px-2 py-1">
            <p className="font-medium text-2xl text-ens-white leading-none tracking-[-0.64px]">
              {domainName}
            </p>
          </div>

          {/* Registration and Expiry Info */}
          <div className="flex flex-col gap-2">
            {/* Registered Date */}
            {formattedRegisteredDate && (
              <div className="flex items-center gap-[5.417px]">
                <Calendar className="size-[18.958px] text-ens-garnet-surface" />
                <div className="flex items-end gap-[3.611px]">
                  <p className="text-ens-garnet-surface text-sm leading-none tracking-[-0.28px]">
                    Registered
                  </p>
                  <p className="whitespace-nowrap font-medium text-ens-magenta text-sm leading-none tracking-[-0.28px]">
                    {formattedRegisteredDate}
                  </p>
                </div>
              </div>
            )}

            {/* Expiry Date */}
            {formattedExpiryDate && (
              <div className="flex items-center gap-2">
                <Clock className="size-[21px] text-ens-garnet-surface" />
                <div className="flex items-center gap-1">
                  <p className="text-ens-garnet-surface text-sm leading-none tracking-[-0.28px]">
                    Expires
                  </p>
                  <p className="whitespace-nowrap font-medium text-ens-magenta text-sm leading-none tracking-[-0.28px]">
                    {formattedExpiryDate}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="group flex h-8 min-w-[101px] shrink-0 flex-col items-end justify-end rounded-[4px] border border-ens-blue-midnight hover:bg-gray-600">
        <div className="flex h-8 items-center gap-1 rounded-[4px] px-2 py-1">
          <p className="text-center font-medium text-ens-blue-midnight text-xs leading-normal group-hover:text-white">
            View profile
          </p>
          <ArrowRight className="size-2.5 h-2.5 text-ens-blue-midnight group-hover:text-white" />
        </div>
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

DomainProfileCard.displayName = 'DomainProfileCard'
