import { useNavigate } from '@tanstack/react-router'
import type { Address } from 'viem'
import { ResolverIcon } from '@/assets/icons'
import { EntityBadge } from '@/components/EntityBadge'
import { useIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'
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
  const { data: isPermissionedResult } = useIsPermissionedResolver({
    resolverAddress,
  })
  const resolverLabel = isPermissionedResult ? 'owned resolver' : undefined

  const value = (
    <EntityBadge
      variant="contract"
      address={resolverAddress}
      label={resolverLabel}
    >
      {truncateAddress(resolverAddress, 6, 4)}
    </EntityBadge>
  )

  if (asRow) {
    return (
      <div className="flex items-center gap-4 w-full min-h-7">
        <ResolverIcon className="size-4 shrink-0 text-neutral-7" />
        <span className="text-sm text-muted-foreground w-24 shrink-0">
          Resolver
        </span>
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
        <ResolverIcon className="size-8 shrink-0 text-neutral-7" />
        <span className="text-sm text-muted-foreground">Resolver</span>
      </button>
      {value}
    </div>
  )
}
