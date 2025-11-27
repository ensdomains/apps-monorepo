import { Calendar, CheckCircle2, Clock } from 'lucide-react'
import { LinkButton } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

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
  const hasAvatar = Boolean(avatarUrl)

  return (
    <Card className="rounded-[22px] border-[#dededf] border-[0.25px] bg-white/95 shadow-[0px_20.905px_27.874px_rgba(14,61,104,0.06)]">
      <div className="flex flex-col gap-8 p-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-start gap-6 md:flex-row">
          <div className="size-[200px] shrink-0 overflow-hidden rounded-[18px] bg-muted">
            {hasAvatar ? (
              <img
                src={avatarUrl as string}
                alt={primaryName}
                className="size-full object-cover"
              />
            ) : (
              <div className="size-full bg-linear-to-br from-ens-blue/40 via-ens-blue to-ens-blue-midnight" />
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-fit items-center rounded-[14px] bg-[#0080bc] px-6 py-2.5 font-sans font-semibold text-[28px] text-white leading-none">
                  {primaryName}
                </span>
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f1f5f9] px-4 py-1.5 font-medium text-[#0080bc] text-xs">
                  Primary Name
                  <CheckCircle2 className="size-4" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 text-[#8c8c8c] text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-[#8c8c8c]" />
                <span>Registered</span>
                <span className="font-semibold text-[#232222]">
                  {dateFormatter.format(registeredDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-[#8c8c8c]" />
                <span>Expires</span>
                <span className="font-semibold text-[#232222]">
                  {dateFormatter.format(expiryDate)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <LinkButton
          to="/p/$name"
          params={{ name: primaryName }}
          variant="outline"
          size="lg"
          className="mt-4 whitespace-nowrap rounded-lg border-2 border-[#0080bc] text-[#0080bc] hover:bg-[#0080bc]/5 md:mt-0"
        >
          View profile →
        </LinkButton>
      </div>
    </Card>
  )
}
