import { useQuery } from '@tanstack/react-query'
import { Calendar, Clock } from 'lucide-react'
import { match } from 'ts-pattern'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { profileExpiryQuery } from '@/features/profile/service/profileExpiry'
import { profileRegistrationQuery } from '@/features/profile/service/profileRegistration'
import { ChoosePrimaryNameDialog } from './ChoosePrimaryNameDialog'
import { PrimaryBadge } from './PrimaryBadge'

type PrimaryNameCardProps = {
  primaryName?: string | null
  avatarUrl?: string | null
}

export const PrimaryNameCard = ({
  primaryName,
  avatarUrl,
}: PrimaryNameCardProps) => {
  const { data: registration, isLoading: isRegistrationLoading } = useQuery({
    ...profileRegistrationQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })

  const { data: reverseExpiry, isLoading: isReverseExpiryLoading } = useQuery({
    ...profileExpiryQuery(primaryName ?? ''),
    enabled: !!primaryName,
  })

  const registeredDate =
    registration?.registrationDate != null
      ? new Date(registration.registrationDate * 1000)
      : null
  const expiryDate =
    reverseExpiry?.expiry != null
      ? new Date(Number(reverseExpiry.expiry) * 1000)
      : null
  const formattedRegisteredDate = formatDashboardDate(registeredDate)
  const formattedExpiryDate = formatDashboardDate(expiryDate)
  const hasAvatar = Boolean(avatarUrl)
  const displayName = primaryName ?? 'Your ENS name'
  const registeredLabel = isRegistrationLoading
    ? 'Loading...'
    : formattedRegisteredDate
  const expiryLabel = isReverseExpiryLoading
    ? 'Loading...'
    : formattedExpiryDate
  const canViewProfile = Boolean(primaryName)

  return (
    <Card className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white p-4 shadow-none md:p-[24px]">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex flex-row items-start gap-4 md:gap-[20px]">
          <div className="size-[80px] shrink-0 overflow-hidden rounded-[4px] bg-[#faf9f6] md:size-[200px]">
            {match(hasAvatar)
              .with(true, () => (
                <img
                  alt={displayName}
                  className="size-[80px] object-cover md:size-full"
                  src={avatarUrl as string}
                />
              ))
              .otherwise(() => (
                <div className="size-[80px] bg-linear-to-br from-blue-400 via-blue-600 to-blue-900 md:size-full" />
              ))}
          </div>
          <div className="flex min-h-0 flex-col justify-between md:h-[200px]">
            <div className="flex flex-col items-start gap-2 transition-opacity hover:opacity-80 md:gap-[12px]">
              <div className="inline-flex items-center rounded-[4px] bg-ens-blue px-2 py-1 md:px-[8.5px] md:py-[4.25px]">
                <span
                  className={
                    displayName.length > 10
                      ? 'font-medium font-mono text-[24px] text-ens-white leading-[0.96] tracking-[-0.48px]'
                      : 'font-medium font-mono text-[20px] text-ens-white leading-[0.96] tracking-[-0.4px] md:text-[28px] md:tracking-[-0.56px]'
                  }
                >
                  {displayName}
                </span>
              </div>
              <ChoosePrimaryNameDialog
                currentPrimaryAvatar={avatarUrl}
                currentPrimaryName={primaryName}
              >
                <button
                  className="mb-4 cursor-pointer transition-opacity hover:opacity-80"
                  type="button"
                >
                  <PrimaryBadge />
                </button>
              </ChoosePrimaryNameDialog>
            </div>
            <div className="flex flex-col gap-[8.5px]">
              <div className="flex items-center gap-[8px]">
                <Calendar
                  className="size-[16px] text-[#8c8c8c]"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-[4px] text-[12px] leading-[0.96] tracking-[-0.24px]">
                  <span className="text-[#8c8c8c]">Registered</span>
                  <span className="text-[#232222]">{registeredLabel}</span>
                </div>
              </div>
              <div className="flex items-center gap-[8px]">
                <Clock
                  className="size-[16px] text-[#8c8c8c]"
                  strokeWidth={1.5}
                />
                <div className="flex items-end gap-[4px] text-[12px] leading-[0.96] tracking-[-0.24px]">
                  <span className="text-[#8c8c8c]">Expires</span>
                  <span className="text-[#232222]">{expiryLabel}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <LinkButton
          className="h-[40px] w-full rounded-xs border border-ens-blue px-[8.5px] py-[4.25px] font-mono text-ens-blue uppercase tracking-wider hover:bg-ens-blue/5 hover:text-ens-blue md:w-auto"
          disabled={!canViewProfile}
          params={{ name: primaryName ?? '' }}
          to="/p/$name"
          variant="outline"
        >
          <span className="font-sans text-[14px] leading-normal">
            View profile
          </span>
        </LinkButton>
      </div>
    </Card>
  )
}
