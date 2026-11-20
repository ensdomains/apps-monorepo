import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'
import type { ProtocolVersion } from '@/utils/types'
import { getIsRegistryPendingUpgradeQueryOptions } from '../queries/getIsRegistryPendingUpgrade'
import { settledData } from '../utils/pendingUpgradeRegistry'
import { shouldShowSubnameOwnerNotice } from '../utils/registryRepairCase'
import { useHasSetSubregistryRole } from './useHasSetSubregistryRole'

export type UseSubnameOwnerNoticeResult = {
  readonly isShown: boolean
  /** The name whose registry holds the subname; null for a 2LD. */
  readonly parentName: string | null
}

/** Whether the connected owner of `name` sees the Case C notice. */
export const useSubnameOwnerNotice = ({
  name,
  owner,
  registryAddress,
  protocolVersion,
}: {
  readonly name: string
  readonly owner: Address
  /** The registry holding `name`, from the owner lookup. */
  readonly registryAddress: Address
  readonly protocolVersion: ProtocolVersion
}): UseSubnameOwnerNoticeResult => {
  const { address: account } = useConnection()
  const parentName = is2LD(name) ? null : getParentName(name)
  const isV2 = protocolVersion === 'ENSv2'
  const isOwner = Boolean(account && isAddressEqual(account, owner))
  const isCandidate = isV2 && isOwner && parentName !== null

  const pendingUpgrade = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({ registryAddress }),
    enabled: isCandidate,
  })
  const isPendingUpgrade = settledData(pendingUpgrade)

  const { hasRole, isLoading } = useHasSetSubregistryRole(parentName ?? '', {
    enabled: isCandidate && isPendingUpgrade === true,
  })

  return {
    isShown: shouldShowSubnameOwnerNotice({
      isV2,
      isOwner,
      isSubname: parentName !== null,
      isPendingUpgrade,
      canUpgradeRegistry: isLoading ? undefined : hasRole,
    }),
    parentName,
  }
}
