import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getIsRegistryPendingUpgradeQueryOptions } from '../queries/getIsRegistryPendingUpgrade'
import { settledData } from '../utils/pendingUpgradeRegistry'
import {
  getRegistryRepairCase,
  type RegistryRepairCase,
  sharedRegistryText,
} from '../utils/registryRepairCase'
import { useHasSetSubregistryRole } from './useHasSetSubregistryRole'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'
import { getRegistryInfoQueryOptions } from './useRegistry'
import { getRegistryOccupantsQueryOptions } from './useRegistryOccupants'

export type UseRegistryRepairCaseResult = {
  readonly repairCase: RegistryRepairCase
  /** The registry holding the name's subnames, once known. */
  readonly registryAddress: Address | undefined
  /** The registry holding the name itself. */
  readonly parentRegistry: Address | undefined
  /** How many subnames the registry holds, once counted. */
  readonly subnameCount: number | undefined
  /** Other names sharing the registry, for the account that can upgrade it; null when none do or not read. */
  readonly sharedRegistryNote: string | null
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
  const isPendingUpgrade = settledData(pendingUpgrade)

  const { hasRole, isLoading: isRoleLoading } = useHasSetSubregistryRole(name, {
    enabled: isPendingUpgrade === true,
  })
  const canSwitchParent = isRoleLoading ? undefined : hasRole

  const occupants = useQuery({
    ...getRegistryOccupantsQueryOptions({
      address: registryAddress ?? zeroAddress,
      account: account ?? zeroAddress,
    }),
    enabled: Boolean(registryAddress && account) && canSwitchParent === true,
  })

  const registryInfo = useQuery({
    ...getRegistryInfoQueryOptions({ address: registryAddress ?? zeroAddress }),
    enabled: Boolean(registryAddress) && canSwitchParent === true,
  })
  const sharedRegistry = settledData(registryInfo)

  return {
    repairCase: getRegistryRepairCase({
      // No registry under the name: nothing to upgrade. Registries not read yet: unknown.
      isPendingUpgrade:
        registries && (registryAddress ? isPendingUpgrade : false),
      isConnected: Boolean(account),
      canSwitchParent,
      occupants: settledData(occupants),
    }),
    registryAddress,
    parentRegistry: registries?.at(1) ?? undefined,
    subnameCount: settledData(occupants)?.count,
    sharedRegistryNote: sharedRegistry
      ? sharedRegistryText({
          name,
          referencedBy: sharedRegistry.referencedBy,
          hasMore: sharedRegistry.referencedByHasMore,
        })
      : null,
  }
}
