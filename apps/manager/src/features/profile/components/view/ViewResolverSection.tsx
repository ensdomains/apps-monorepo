import type { Address } from 'viem'
import { CopyableButton } from '@/components/atoms/CopyableButton'

interface ViewResolverSectionProps {
  resolverAddress?: Address
}

export const ViewResolverSection = ({
  resolverAddress,
}: ViewResolverSectionProps) => {
  const resolver = resolverAddress
  return (
    <div className="space-y-2">
      <div className="font-medium">Public Resolver</div>
      <CopyableButton
        value={resolver || ''}
        className="w-full min-w-1/3 flex-1 justify-between"
        title={resolver || ''}
        disabled={!resolver}
        iconClassName="size-3.5"
      >
        <span className="truncate font-mono text-sm">
          {resolver || 'Not set'}
        </span>
      </CopyableButton>
    </div>
  )
}
