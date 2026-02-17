import { ArrowRight, Calendar, Clock } from 'lucide-react'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { cn } from '@/lib/utils'

export interface DomainProfileCardProps {
  domainName: string
  avatarUrl?: string | null
  registeredDate?: Date | string | null
  expiryDate?: Date | string | null
  className?: string
  clickable?: boolean
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
  className,
  clickable = false,
}: DomainProfileCardProps) => {
  const formattedRegisteredDate = formatDate(registeredDate) || 'N/A'
  const formattedExpiryDate = formatDate(expiryDate) || 'N/A'

  // const content =
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-4',
        'rounded-sm bg-ens-white p-4',
        'shadow-[0px_20.905px_27.874px_0px_rgba(14,61,104,0.06)] transition',
        'sm:h-[157px] sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:p-[22px]',
        clickable &&
          'hover:-translate-y-0.5 cursor-pointer hover:shadow-[0px_20px_28px_-12px_rgba(15,23,42,0.20)]',
        className,
      )}
    >
      {/* Left section: Avatar and Domain Info */}
      <div className="flex min-w-0 items-center gap-3 sm:h-full sm:gap-4">
        {/* Avatar */}
        <div className="relative size-20 shrink-0 sm:size-[113px]">
          <div className="size-full overflow-clip rounded-[5.215px] bg-ens-white">
            <img
              alt={`${domainName} avatar`}
              className="size-full object-cover"
              src={avatarUrl || placeholderAvatar}
            />
          </div>
        </div>

        {/* Domain Info */}
        <div className="flex min-w-0 flex-col justify-start gap-2 sm:h-full">
          {/* Domain Name Badge */}
          <div className="flex w-fit max-w-full items-center justify-center gap-[10px] rounded-sm bg-ens-magenta px-2 py-1 font-medium text-ens-white text-lg leading-none tracking-[-0.64px] sm:text-2xl">
            <span className="max-w-full truncate">{domainName}</span>
          </div>

          {/* Registration and Expiry Info */}
          <div className="flex min-w-0 flex-col gap-2">
            {/* Registered Date */}
            {formattedRegisteredDate && (
              <div className="flex min-w-0 items-center gap-[5.417px]">
                <Calendar className="size-5 shrink-0 text-ens-garnet-surface" />
                <div className="flex min-w-0 flex-wrap items-end gap-[3.611px]">
                  <p className="text-ens-garnet-surface text-xs leading-none tracking-[-0.28px] sm:text-sm">
                    Registered
                  </p>
                  <p className="font-medium text-ens-magenta text-xs leading-none tracking-[-0.28px] sm:whitespace-nowrap sm:text-sm">
                    {formattedRegisteredDate}
                  </p>
                </div>
              </div>
            )}

            {/* Expiry Date */}
            {formattedExpiryDate && (
              <div className="flex min-w-0 items-center gap-2">
                <Clock className="size-5 shrink-0 text-ens-garnet-surface" />
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <p className="text-ens-garnet-surface text-xs leading-none tracking-[-0.28px] sm:text-sm">
                    Expires
                  </p>
                  <p className="font-medium text-ens-magenta text-xs leading-none tracking-[-0.28px] sm:whitespace-nowrap sm:text-sm">
                    {formattedExpiryDate}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="group ml-auto flex h-8 min-w-[101px] shrink-0 flex-col items-end justify-end rounded-sm border border-ens-blue-midnight hover:bg-gray-600 sm:ml-0">
        <div className="flex h-8 items-center gap-1 rounded-sm px-2 py-1">
          <p className="text-center font-medium text-ens-blue-midnight text-xs leading-normal group-hover:text-white">
            View profile
          </p>
          <ArrowRight className="size-2.5 h-2.5 text-ens-blue-midnight group-hover:text-white" />
        </div>
      </div>
    </div>
  )
}

DomainProfileCard.displayName = 'DomainProfileCard'
