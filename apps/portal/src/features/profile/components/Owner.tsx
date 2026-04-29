import { useNavigate } from '@tanstack/react-router'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
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
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            {label}
          </span>
          <span className="text-sm text-muted-foreground">No data</span>
        </div>
      )
    return (
      <div
        className={cn(
          'p-6 flex flex-col justify-center rounded-sm border border-border hover:bg-muted',
          className,
        )}
      >
        <span className="text-sm text-muted-foreground">{label}</span>
        <span>No data</span>
      </div>
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
          <span className="text-sm text-muted-foreground w-24 shrink-0">
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

  const handleCardClick = () => {
    if (ownerName) navigate({ to: '/$name', params: { name: ownerName } })
    else navigate({ to: '/addr/$addr', params: { addr: owner } })
  }

  return (
    <div
      className={cn(
        'p-6 flex flex-row items-center gap-6 rounded-sm border border-border hover:bg-muted w-full',
        className,
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-pointer"
        onClick={handleCardClick}
      >
        <NameAvatar
          width="40px"
          height="40px"
          name={ownerName || shortenedAddress}
        />
      </button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
        <button
          type="button"
          className="font-medium text-left cursor-pointer shrink-0"
          onClick={handleCardClick}
        >
          {label}
        </button>
        <EntityBadgeWithActions
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadgeWithActions>
      </div>
    </div>
  )
}
