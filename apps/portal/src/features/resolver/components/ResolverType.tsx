import { FocusIcon } from 'lucide-react'
import type { Address } from 'viem/accounts'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useIsDedicatedResolver } from '@/features/resolver/hooks/useIsDedicatedResolver'

export const ResolverType = ({
  resolverAddress,
}: {
  resolverAddress: Address
}) => {
  const {
    data: isDedicatedResolver,
    isLoading,
    error,
  } = useIsDedicatedResolver({ resolverAddress })

  if (isLoading) return <LoadingSpinner title="Loading..." />
  if (error)
    return <>{error instanceof Error ? error.message : 'Failed to load data'}</>
  if (!isDedicatedResolver) return null

  return (
    <div className="flex flex-row p-4 sm:p-6 gap-4 sm:gap-6 rounded-2xl border border-border w-full flex-1 items-center">
      <FocusIcon className="size-10" />
      <div className="flex flex-col">
        <span className="font-medium">Type</span>
        <span>DedicatedResolver</span>
      </div>
    </div>
  )
}
