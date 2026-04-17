import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ResolverIcon } from '@/assets/icons'
import { EntityBadgeWithActions } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
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
  const { data, isLoading, error } = useQuery({
    ...getUnderlyingAddressQueryOptions({ name, resolverAddress }),
    enabled: Boolean(resolverAddress),
  })

  const underlyingResolverAddress = data?.[0] || undefined

  const value = isLoading ? (
    <LoadingSpinner title="Loading..." />
  ) : error ? (
    <span className="text-muted-foreground">—</span>
  ) : underlyingResolverAddress ? (
    <EntityBadgeWithActions
      variant="contract"
      address={underlyingResolverAddress}
    >
      {truncateAddress(underlyingResolverAddress, 6, 4, '...')}
    </EntityBadgeWithActions>
  ) : (
    <span className="text-muted-foreground">No resolver</span>
  )

  if (asRow) {
    return (
      <button
        type="button"
        className="flex items-center gap-4 py-3 rounded hover:bg-muted/50 cursor-pointer w-full text-left"
        onClick={() => navigate({ to: '/$name/resolver', params: { name } })}
      >
        <ResolverIcon className="size-4 shrink-0 text-icon-foreground" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Resolver
        </span>
        {value}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted cursor-pointer w-full text-left',
      )}
      onClick={() => navigate({ to: '/$name/resolver', params: { name } })}
    >
      <ResolverIcon className="size-8 shrink-0 text-icon-foreground" />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Resolver</span>
        {value}
      </div>
    </button>
  )
}
