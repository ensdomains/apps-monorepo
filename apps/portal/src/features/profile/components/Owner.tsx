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
          'p-6 flex flex-col rounded-2xl border border-border hover:bg-muted',
          className,
        )}
      >
        <span className="font-medium">{label}</span>
        <span>No data</span>
      </div>
    )

  const shortenedAddress = truncateAddress(owner, 6, 4, '...')

  return (
    <Link
      to="/addr/$addr"
      params={{ addr: owner }}
      className={cn(
        'p-6 flex flex-row rounded-2xl gap-6 items-center border border-border hover:bg-muted',
        className,
      )}
    >
      <NameAvatar
        width="40px"
        height="40px"
        name={ownerName || shortenedAddress}
      />
      <div className="flex flex-col gap-1">
        <span className="font-medium">{label}</span>
        <EntityBadge variant={ownerName ? 'name' : 'address'}>
          {ownerName || shortenedAddress}
        </EntityBadge>
      </div>
    </Link>
  )
}
