import { useQuery } from '@tanstack/react-query'
import { CopyableButton } from '@/components/atoms/CopyableButton'
import { profileResolverQuery } from '../../service/profileResolver'

interface ViewResolverSectionProps {
  name: string
}

export const ViewResolverSection = ({ name }: ViewResolverSectionProps) => {
  const { data: resolverData } = useQuery({
    ...profileResolverQuery(name),
  })

  return (
    <div className="space-y-2">
      <div className="font-medium">
        {resolverData?.isDedicatedResolver
          ? 'Dedicated Resolver'
          : 'Public Resolver'}
      </div>
      <CopyableButton
        value={resolverData?.resolverAddress || ''}
        className="w-full min-w-1/3 flex-1 justify-between"
        title={resolverData?.resolverAddress || ''}
        disabled={!resolverData?.resolverAddress}
        iconClassName="size-3.5"
      >
        <span className="truncate font-mono text-sm">
          {resolverData?.resolverAddress || 'Not set'}
        </span>
      </CopyableButton>
    </div>
  )
}
