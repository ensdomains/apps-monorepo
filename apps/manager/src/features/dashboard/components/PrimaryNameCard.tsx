import { Calendar, ChevronDown, Clock } from 'lucide-react'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { PrimaryBadge } from './PrimaryBadge'

type PrimaryNameCardProps = {
  primaryName: string
  address: string
  registeredDate: Date
  expiryDate: Date
  avatarUrl?: string | null
}

export const PrimaryNameCard = ({
  primaryName,
  address,
  registeredDate,
  expiryDate,
  avatarUrl,
}: PrimaryNameCardProps) => {
  const formattedRegisteredDate = formatDashboardDate(registeredDate)
  const formattedExpiryDate = formatDashboardDate(expiryDate)
  const hasAvatar = Boolean(avatarUrl)

  return (
    <Card className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white p-4 shadow-none md:p-[24px]">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex flex-col items-start gap-4 md:flex-row md:gap-[20px]">
          <div className="size-[120px] shrink-0 overflow-hidden rounded-[4px] bg-[#faf9f6] md:size-[200px]">
            {hasAvatar ? (
              <img
                src={avatarUrl as string}
                alt={primaryName}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-gradient-to-br from-blue-400 via-blue-600 to-blue-900" />
            )}
          </div>

          <div className="flex min-h-0 flex-col justify-between md:h-[200px]">
            <div className="flex flex-col items-start gap-2 md:gap-[12px]">
              <div className="inline-flex items-center rounded-[4px] bg-[#0080bc] px-2 py-1 md:px-[8.5px] md:py-[4.25px]">
                <span className="font-medium font-mono text-[#f6f6f6] text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[28px] md:tracking-[-0.56px]">
                  {primaryName}
                </span>
              </div>
              <div className="flex items-center gap-[2px]">
                <PrimaryBadge />
                <ChevronDown className="size-[17.5px] text-[#0080bc]" />
              </div>
            </div>

            <div className="flex flex-col gap-[8.5px]">
              <div className="flex items-center gap-[8px]">
                <Calendar
                  className="size-[16px] text-[#8c8c8c]"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-[4px] text-[12px] leading-[0.96] tracking-[-0.24px]">
                  <span className="text-[#8c8c8c]">Registered</span>
                  <span className="text-[#232222]">
                    {formattedRegisteredDate}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-[8px]">
                <Clock
                  className="size-[16px] text-[#8c8c8c]"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-[4px] text-[12px] leading-[0.96] tracking-[-0.24px]">
                  <span className="text-[#8c8c8c]">Expires</span>
                  <span className="text-[#232222]">{formattedExpiryDate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <LinkButton
          to="/p/$name"
          params={{ name: primaryName }}
          variant="outline"
          className="h-[34px] w-full rounded-[4px] border border-[#0080bc] px-[8.5px] py-[4.25px] text-[#0080bc] hover:bg-[#0080bc]/5 hover:text-[#0080bc] md:w-auto"
        >
          <span className="font-sans text-[14px] leading-normal">
            View profile
          </span>
          <span className="ml-[4px]">→</span>
        </LinkButton>
      </div>
    </Card>
  )
}
