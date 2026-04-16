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
  asRow,
}: {
  owner?: Address
  label?: string
  className?: string
  asRow?: boolean
}) => {
  const {
    data: ownerName,
    error,
    isLoading,
  } = useEnsName({ address: owner, query: { enabled: Boolean(owner) } })

  if (error) return <div>{error.message}</div>
  if (isLoading) return <div>Loading</div>

  if (!owner) {
    if (asRow)
      return (
        <div className={cn('flex items-center gap-4 py-3', className)}>
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            {label}
          </span>
          <span className="text-sm text-muted-foreground">No data</span>
        </div>
      )
    return (
      <div
        className={cn(
          'h-21.5 px-6 flex flex-col justify-center rounded-sm border border-border hover:bg-muted',
          className,
        )}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span>No data</span>
      </div>
    )
  }

  const shortenedAddress = truncateAddress(owner, 6, 4, '...')

  if (asRow) {
    const rowContent = (
      <>
        <NameAvatar
          width="20px"
          height="20px"
          name={ownerName || shortenedAddress}
        />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          {label}
        </span>
        <EntityBadge variant={ownerName ? 'name' : 'address'}>
          {ownerName || shortenedAddress}
        </EntityBadge>
      </>
    )
    if (ownerName) {
      return (
        <Link
          to="/$name"
          params={{ name: ownerName }}
          className={cn(
            'flex items-center gap-4 py-3 hover:bg-muted/50',
            className,
          )}
        >
          {rowContent}
        </Link>
      )
    }
    return (
      <Link
        to="/addr/$addr"
        params={{ addr: owner }}
        className={cn(
          'flex items-center gap-4 py-3 hover:bg-muted/50',
          className,
        )}
      >
        {rowContent}
      </Link>
    )
  }

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
