import { useNavigate } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
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
  const navigate = useNavigate()
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

  const shortenedAddress = truncateAddress(owner, 6, 4, '...')
  const variant = ownerName ? 'name' : 'address'

  if (asRow) {
    const handleRowClick = () => {
      if (ownerName) navigate({ to: '/$name', params: { name: ownerName } })
      else navigate({ to: '/addr/$addr', params: { addr: owner } })
    }

    return (
      <div
        className={cn(
          'flex items-center gap-4 rounded hover:bg-muted/50 w-full',
          className,
        )}
      >
        <button
          type="button"
          className="flex items-center gap-4 text-left cursor-pointer"
          onClick={handleRowClick}
        >
          <NameAvatar
            width="20px"
            height="20px"
            name={ownerName || shortenedAddress}
          />
          <span className="text-sm text-muted-foreground min-w-24 shrink-0 whitespace-nowrap">
            {label}
          </span>
        </button>
        <EntityBadgeWithActions
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadgeWithActions>
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
        <EntityBadgeWithActions
          inline
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadgeWithActions>
      </div>
    </BlockCard>
  )
}
