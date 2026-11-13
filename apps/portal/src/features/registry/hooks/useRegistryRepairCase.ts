import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getIsRegistryPendingUpgradeQueryOptions } from '../queries/getIsRegistryPendingUpgrade'
import {
  getRegistryRepairCase,
  type RegistryRepairCase,
} from '../utils/registryRepairCase'
import { useHasSetSubregistryRole } from './useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'
import { getRegistryOccupantsQueryOptions } from './useRegistryOccupants'

export type UseRegistryRepairCaseResult = {
  readonly repairCase: RegistryRepairCase
  /** The registry holding the name's subnames, once known. */
  readonly registryAddress: Address | undefined
  /** Subnames in it; only read for an account that can repair the registry. */
  readonly subnameCount: number | undefined
}

/** Which registry update notice the connected account sees for a V2 name. */
export const useRegistryRepairCase = (
  name: string,
): UseRegistryRepairCaseResult => {
  const { address: account } = useConnection()

  const { data: registries } = useQuery(getNameRegistriesQueryOptions({ name }))
  const subregistry = registries?.at(0)
  const registryAddress =
    subregistry && subregistry !== zeroAddress ? subregistry : undefined

  const pendingUpgrade = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({
      registryAddress: registryAddress ?? zeroAddress,
    }),
    enabled: Boolean(registryAddress),
  })
  const isPendingUpgrade = pendingUpgrade.error
    ? undefined
    : pendingUpgrade.data

  const { hasRole, isLoading: isRoleLoading } = useHasSetSubregistryRole(name, {
    enabled: isPendingUpgrade === true,
  })
  const canRepair = isRoleLoading ? undefined : hasRole

  const occupants = useQuery({
    ...getRegistryOccupantsQueryOptions({
      address: registryAddress ?? zeroAddress,
      account: account ?? zeroAddress,
    }),
    enabled: Boolean(registryAddress && account) && canRepair === true,
  })

  return {
    repairCase: getRegistryRepairCase({
      isPendingUpgrade: registryAddress ? isPendingUpgrade : false,
      isConnected: Boolean(account),
      canRepair,
      occupants: occupants.error ? undefined : occupants.data,
    }),
    registryAddress,
    subnameCount: occupants.data?.count,
  }
}
