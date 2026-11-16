import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import type { ProtocolVersion } from '@/utils/types'
import { getIsRegistryPendingUpgradeQueryOptions } from '../queries/getIsRegistryPendingUpgrade'
import { settledData } from '../utils/pendingUpgradeRegistry'
import { shouldShowSubnameOwnerNotice } from '../utils/registryRepairCase'
import { useHasSetSubregistryRole } from './useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

export type UseSubnameOwnerNoticeResult = {
  readonly isShown: boolean
  /** The name whose registry holds the subname. */
  readonly parentName: string
}

/** Whether the connected owner of `name` sees the Case C notice. */
export const useSubnameOwnerNotice = ({
  name,
  owner,
  protocolVersion,
}: {
  readonly name: string
  readonly owner: Address
  readonly protocolVersion: ProtocolVersion
}): UseSubnameOwnerNoticeResult => {
  const { address: account } = useConnection()
  const isV2 = protocolVersion === 'ENSv2'
  const isOwner = Boolean(account && isAddressEqual(account, owner))
  const parentName = name.split('.').slice(1).join('.')

  const { data: registries } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled: isV2 && isOwner,
  })
  const registry = registries?.at(1)
  const hasRegistry = Boolean(registry && registry !== zeroAddress)

  const pendingUpgrade = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({
      registryAddress: registry ?? zeroAddress,
    }),
    enabled: isV2 && isOwner && hasRegistry,
  })
  const isPendingUpgrade = settledData(pendingUpgrade)

  const { hasRole, isLoading } = useHasSetSubregistryRole(parentName, {
    enabled: isPendingUpgrade === true,
  })

  return {
    isShown: shouldShowSubnameOwnerNotice({
      isV2,
      isOwner,
      isPendingUpgrade,
      canUpgradeRegistry: isLoading ? undefined : hasRole,
    }),
    parentName,
  }
}
