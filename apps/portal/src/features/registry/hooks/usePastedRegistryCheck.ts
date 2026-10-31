import { useQuery } from '@tanstack/react-query'
import { isAddress, zeroAddress } from 'viem'
import { getIsRegistryPendingUpgradeQueryOptions } from '@/features/registry/queries/getIsRegistryPendingUpgrade'
import { isPastedRegistryBlocked } from '@/features/registry/utils/pendingUpgradeRegistry'

/** Whether a pasted registry can't be used yet: pending an upgrade, or not yet checked. */
export const usePastedRegistryCheck = ({
  isUsed,
  value,
}: {
  readonly isUsed: boolean
  readonly value: string
}) => {
  const registryAddress = isUsed && isAddress(value) ? value : null
  const { data: isPendingUpgrade } = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({
      registryAddress: registryAddress ?? zeroAddress,
    }),
    enabled: registryAddress !== null,
  })
  return {
    isBlocked: isPastedRegistryBlocked({
      isPasted: registryAddress !== null,
      isPendingUpgrade,
    }),
    isPendingUpgrade: registryAddress !== null && isPendingUpgrade === true,
  }
}
