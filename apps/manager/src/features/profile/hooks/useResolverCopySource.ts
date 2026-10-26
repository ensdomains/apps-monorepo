import { useQuery } from '@tanstack/react-query'
import { useChainId } from 'wagmi'
import { useSmartAccountContext } from '@/lib/smart-account'
import { resolverCopySourceQuery } from '../service/resolverImport'

export const useResolverCopySource = ({
  name,
  isInGrace,
  isExpiryError,
  isUpgradeRequired,
}: {
  readonly name: string
  readonly isInGrace: boolean
  readonly isExpiryError: boolean
  readonly isUpgradeRequired: boolean
}) => {
  const { ownerAddress, isConnected } = useSmartAccountContext()
  const chainId = useChainId()
  const enabled =
    isConnected &&
    Boolean(ownerAddress) &&
    !isInGrace &&
    !isExpiryError &&
    !isUpgradeRequired
  const query = useQuery({
    ...resolverCopySourceQuery(name, ownerAddress ?? undefined),
    enabled,
  })
  return enabled && !query.isError && query.data?.chainId === chainId
    ? query.data
    : undefined
}
