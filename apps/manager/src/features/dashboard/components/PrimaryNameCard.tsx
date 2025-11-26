import { Calendar, Clock } from 'lucide-react'
import { Highlight } from '@/components/atoms/Highlight/Highlight'
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
    <Card className="rounded-2xl border bg-white/90 shadow-sm">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <div className="h-[160px] w-[160px] overflow-hidden rounded-2xl bg-muted">
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
              <Highlight className="inline-flex items-center rounded-full bg-ens-blue px-5 py-2 font-sans font-semibold text-2xl text-white">
                {primaryName}
              </Highlight>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#F4F7FB] px-4 py-1 font-medium text-ens-blue text-xs">
                Primary Name
                <span className="flex size-4 items-center justify-center rounded-full border border-ens-blue bg-white text-ens-blue">
                  ✓
                </span>
              </span>
            </div>

            <div className="flex flex-col gap-2 text-muted-foreground text-sm md:flex-row md:gap-8">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span>Registered</span>
                <span className="font-medium text-foreground">
                  {dateFormatter.format(registeredDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span>Expires</span>
                <span className="font-medium text-foreground">
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
          className="mt-4 whitespace-nowrap md:mt-0"
        >
          View profile →
        </LinkButton>
      </div>
    </Card>
  )
}
