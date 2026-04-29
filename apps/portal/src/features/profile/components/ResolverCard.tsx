import { useNavigate } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ResolverIcon } from '@/assets/icons'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const ResolverCard = ({
  name,
  resolverAddress,
  asRow,
}: {
  name: string
  resolverAddress: Address
  asRow?: boolean
}) => {
  const navigate = useNavigate()

  const value = (
    <EntityBadgeWithActions variant="contract" address={resolverAddress}>
      {truncateAddress(resolverAddress, 6, 4, '...')}
    </EntityBadgeWithActions>
  )

  if (asRow) {
    return (
      <div className="flex items-center gap-4 py-3 rounded hover:bg-muted/50 w-full">
        <button
          type="button"
          className="flex items-center gap-4 text-left cursor-pointer"
          onClick={() => navigate({ to: '/$name/resolver', params: { name } })}
        >
          <ResolverIcon className="size-4 shrink-0 text-icon-foreground" />
          <span className="text-sm text-muted-foreground w-24 shrink-0">
            Resolver
          </span>
        </button>
        {value}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted w-full',
      )}
    >
      <button
        type="button"
        className="flex items-center gap-6 text-left cursor-pointer"
        onClick={() => navigate({ to: '/$name/resolver', params: { name } })}
      >
        <ResolverIcon className="size-8 shrink-0 text-icon-foreground" />
        <span className="text-sm text-muted-foreground">Resolver</span>
      </button>
      {value}
    </div>
  )
}
