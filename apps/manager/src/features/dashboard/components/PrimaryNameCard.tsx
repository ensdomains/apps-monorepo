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
    <Card className="rounded-[22px] border border-gray-200 bg-white/95 shadow-md">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <div className="h-[200px] w-[200px] overflow-hidden rounded-[18px] bg-muted">
            {hasAvatar ? (
              <img
                src={avatarUrl as string}
                alt={primaryName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-ens-blue/40 via-ens-blue to-ens-blue-midnight" />
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center rounded-[14px] bg-ens-blue px-6 py-3 font-sans font-semibold text-[28px] text-white leading-none">
                {primaryName}
              </span>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#f1f5f9] px-4 py-2 font-medium text-ens-blue text-sm">
                Primary Name
                <CheckCircle2 className="size-4" />
              </div>
            </div>

            <div className="flex flex-col gap-3 text-muted-foreground text-sm md:flex-row md:gap-8">
              <div className="flex items-center gap-2">
                <Calendar className="size-5 text-muted-foreground" />
                <span>Registered</span>
                <span className="font-semibold text-foreground">
                  {dateFormatter.format(registeredDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-5 text-muted-foreground" />
                <span>Expires</span>
                <span className="font-semibold text-foreground">
                  {dateFormatter.format(expiryDate)}
                </span>
              </div>
            </div>

            <div className="text-muted-foreground text-sm">
              Wallet{' '}
              <span className="font-medium text-foreground">
                {truncateAddress(address)}
              </span>
            </div>
          </div>
        </div>

        <LinkButton
          to="/p/$name"
          params={{ name: primaryName }}
          variant="outline"
          size="lg"
          className="mt-4 whitespace-nowrap border-2 border-ens-blue text-ens-blue hover:bg-ens-blue/5 md:mt-0"
        >
          View profile →
        </LinkButton>
      </div>
    </Card>
  )
}
