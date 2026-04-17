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
          'p-6 flex flex-col justify-center rounded-2xl border border-border hover:bg-muted',
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
      <button
        type="button"
        className={cn(
          'flex items-center gap-4 py-3 rounded hover:bg-muted/50 cursor-pointer w-full text-left',
          className,
        )}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleRowClick()
          }
        }}
      >
        <NameAvatar
          width="20px"
          height="20px"
          name={ownerName || shortenedAddress}
        />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          {label}
        </span>
        <EntityBadgeWithActions
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadgeWithActions>
      </button>
    )
  }

  const cardClassName = cn(
    'h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted cursor-pointer w-full text-left',
    className,
  )

  const handleCardClick = () => {
    if (ownerName) navigate({ to: '/$name', params: { name: ownerName } })
    else navigate({ to: '/addr/$addr', params: { addr: owner } })
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <button
      type="button"
      className={cardClassName}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
    >
      <NameAvatar
        width="40px"
        height="40px"
        name={ownerName || shortenedAddress}
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <EntityBadgeWithActions
          variant={variant}
          name={ownerName ?? undefined}
          address={owner}
        >
          {ownerName || shortenedAddress}
        </EntityBadgeWithActions>
      </div>
    </button>
  )
}
