import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ResolverIcon } from '@/assets/icons'
import { CopyButton } from '@/components/CopyButton'
import { EntityBadge } from '@/components/EntityBadge'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getUnderlyingAddressQueryOptions } from '@/features/resolver/hooks/useUnderlyingResolver'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

export const ResolverCard = ({
  name,
  resolverAddress,
}: {
  name: string
  resolverAddress: Address
}) => {
  const { data, isLoading, error } = useQuery({
    ...getUnderlyingAddressQueryOptions({ name, resolverAddress }),
    enabled: Boolean(resolverAddress),
  })

  const underlyingResolverAddress = data?.[0] || undefined

  return (
    <Link
      to="/$name/resolver"
      params={{ name }}
      className="h-21.5 px-6 flex flex-row rounded-sm gap-6 items-center border border-border hover:bg-muted"
    >
      <ResolverIcon className="size-8 shrink-0 text-[#191919] dark:text-[#595755]" />
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Resolver</span>
        {isLoading ? (
          <LoadingSpinner title="Loading..." />
        ) : error ? (
          <span className="text-muted-foreground">—</span>
        ) : underlyingResolverAddress ? (
          <div className="flex items-center gap-1">
            <EntityBadge variant="contract">
              {truncateAddress(underlyingResolverAddress, 6, 4, '...')}
            </EntityBadge>
            <CopyButton value={underlyingResolverAddress} />
          </div>
        ) : (
          <span className="text-muted-foreground">No resolver</span>
        )}
      </div>
    </Link>
  )
}
