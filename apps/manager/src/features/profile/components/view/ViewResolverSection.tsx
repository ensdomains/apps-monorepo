import type { Address } from 'viem'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ViewResolverSectionProps {
  resolverAddress?: Address
}

export const ViewResolverSection = ({
  resolverAddress,
}: ViewResolverSectionProps) => {
  const resolver = resolverAddress
  return (
    <Card className="border-[0.25px] border-border bg-white shadow-none">
      <CardHeader>
        <CardTitle className="text-base tracking-tight">
          Public Resolver
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CopyableButton
          className="w-full min-w-1/3 flex-1 justify-between"
          disabled={!resolver}
          iconClassName="size-3.5"
          title={resolver || ''}
          value={resolver || ''}
        >
          <span className="truncate font-mono text-sm">
            {resolver || 'Not set'}
          </span>
        </CopyableButton>
      </CardContent>
    </Card>
  )
}
