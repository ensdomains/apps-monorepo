import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const Owner = ({
  owner,
  label = 'Owner',
  className,
}: {
  owner?: Address
  label?: string
  className?: string
}) => {
  const {
    data: ownerName,
    error,
    isLoading,
  } = useEnsName({ address: owner, query: { enabled: Boolean(owner) } })

  if (error) return <div>{error.message}</div>
  if (isLoading) return <div>Loading</div>

  if (!owner)
    return (
      <div
        className={cn(
          'h-21.5 px-6 flex flex-col rounded-sm border border-border hover:bg-muted',
          className,
        )}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span>No data</span>
      </div>
    )

  const shortenedAddress = truncateAddress(owner, 6, 4, '...')
  const cardClassName = cn(
    'h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted',
    className,
  )
  const cardContent = (
    <>
      <NameAvatar
        width="40px"
        height="40px"
        name={ownerName || shortenedAddress}
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <EntityBadge variant={ownerName ? 'name' : 'address'}>
          {ownerName || shortenedAddress}
        </EntityBadge>
      </div>
    </>
  )

  if (ownerName) {
    return (
      <Link to="/$name" params={{ name: ownerName }} className={cardClassName}>
        {cardContent}
      </Link>
    )
  }

  return (
    <Link to="/addr/$addr" params={{ addr: owner }} className={cardClassName}>
      {cardContent}
    </Link>
  )
}
