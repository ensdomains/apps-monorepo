import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getIsRegistryPendingUpgradeQueryOptions } from '../queries/getIsRegistryPendingUpgrade'
import { getRegistryLabelOwnersQueryOptions } from '../queries/getRegistryLabelOwners'
import {
  getRegistryRepairCase,
  type RegistryRepairCase,
} from '../utils/registryRepairCase'
import { useHasSetSubregistryRole } from './useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

export type UseRegistryRepairCaseResult = {
  readonly repairCase: RegistryRepairCase
  /** The registry holding the name's subnames, once known. */
  readonly registryAddress: Address | undefined
  /** Live subnames in it; only read for an account that can repair the registry. */
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

  const { data: isPendingUpgrade } = useQuery({
    ...getIsRegistryPendingUpgradeQueryOptions({
      registryAddress: registryAddress ?? zeroAddress,
    }),
    enabled: Boolean(registryAddress),
  })

  const { hasRole, isLoading: isRoleLoading } = useHasSetSubregistryRole(name, {
    enabled: isPendingUpgrade === true,
  })
  const canRepair = isRoleLoading ? undefined : hasRole

  const { data: subnameOwners } = useQuery({
    ...getRegistryLabelOwnersQueryOptions({
      registryAddress: registryAddress ?? zeroAddress,
    }),
    enabled: Boolean(registryAddress) && canRepair === true,
  })

  return {
    repairCase: getRegistryRepairCase({
      isPendingUpgrade: registryAddress ? isPendingUpgrade : false,
      account,
      canRepair,
      subnameOwners,
    }),
    registryAddress,
    subnameCount: subnameOwners?.length,
  }
}
