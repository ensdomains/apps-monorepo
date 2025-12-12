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
        'flex h-[157px] w-full items-end justify-between gap-4',
        'rounded-sm bg-ens-white p-[22px]',
        'shadow-[0px_20.905px_27.874px_0px_rgba(14,61,104,0.06)] transition',
        clickable &&
          'hover:-translate-y-0.5 cursor-pointer hover:shadow-[0px_20px_28px_-12px_rgba(15,23,42,0.20)]',
        className,
      )}
    >
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
          <div className="flex w-fit items-center justify-center gap-[10px] rounded-sm bg-ens-magenta px-2 py-1 font-medium text-2xl text-ens-white leading-none tracking-[-0.64px]">
            {domainName}
          </div>

          {/* Registration and Expiry Info */}
          <div className="flex flex-col gap-2">
            {/* Registered Date */}
            {formattedRegisteredDate && (
              <div className="flex items-center gap-[5.417px]">
                <Calendar className="size-5 text-ens-garnet-surface" />
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
                <Clock className="size-5 text-ens-garnet-surface" />
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

      <div className="group flex h-8 min-w-[101px] shrink-0 flex-col items-end justify-end rounded-sm border border-ens-blue-midnight hover:bg-gray-600">
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
