import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { ShieldPersonIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { BlockCard } from '@/features/dashboard/components'
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
        <div className={cn('flex items-center gap-4 min-h-7', className)}>
          <span className="text-sm text-muted-foreground min-w-24 shrink-0 whitespace-nowrap">
            {label}
          </span>
          <span className="text-sm text-muted-foreground">No data</span>
        </div>
      )
    return (
      <BlockCard className={cn('flex-col items-start', className)}>
        <span className="text-sm text-muted-foreground">{label}</span>
        <span>No data</span>
      </BlockCard>
    )
  }

  const shortenedAddress = truncateAddress(owner, 6, 4)
  const variant = ownerName ? 'name' : 'address'

  if (asRow) {
    return (
      <div className={cn('flex items-center gap-4 w-full min-h-7', className)}>
        <ShieldPersonIcon className="size-4 shrink-0 text-neutral-7" />
        <span className="text-sm text-muted-foreground min-w-24 shrink-0 whitespace-nowrap">
          {label}
        </span>
        <EntityBadge
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadge>
      </div>
    )
  }

  return (
    <BlockCard className={cn('gap-3', className)}>
      <div className="flex-1 flex items-center justify-between min-w-0 gap-2">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          <NameAvatar
            width="20px"
            height="20px"
            name={ownerName || shortenedAddress}
            rounded="rounded-sm"
          />
          <span className="text-sm truncate">{label}</span>
        </div>
        <EntityBadge
          inline
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadge>
      </div>
    </BlockCard>
  )
}
