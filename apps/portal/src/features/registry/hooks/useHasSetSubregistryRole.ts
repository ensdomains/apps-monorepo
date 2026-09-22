import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { resourceIdForName } from '@/lib/resource/resourceId'
import { getHasRolesQueryOptions } from './useHasRoles'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'

export type UseHasSetSubregistryRoleResult = {
  hasRole: boolean | undefined
  isLoading: boolean
  error: Error | null
  parentRegistry: Address | null
  connectedAddress: Address | undefined
}

export const useHasSetSubregistryRole = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
): UseHasSetSubregistryRoleResult => {
  const { address: connectedAddress } = useConnection()

  const {
    data: registries,
    isLoading: isRegistriesLoading,
    error: registriesError,
  } = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled,
  })

  // The name's id rather than its label: `labelhash` leaves an encoded
  // (`[<64 hex>]`) label unhashed, so a label-keyed gate can answer about a
  // different name (WEB-1458). No id means no permission.
  const resource = resourceIdForName(name).unwrapOr(null)
  const parentRegistry = registries?.at(1) ?? null

  const {
    data: hasRole,
    isLoading: isRoleLoading,
    error: roleError,
  } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistry ?? zeroAddress,
      resource,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAddress ?? zeroAddress,
    }),
    enabled:
      enabled && !!connectedAddress && !!parentRegistry && !isRegistriesLoading,
  })

  const error = registriesError ?? roleError

  return {
    hasRole: error ? undefined : (hasRole ?? false),
    isLoading: enabled && (isRegistriesLoading || isRoleLoading),
    error,
    parentRegistry,
    connectedAddress,
  }
}
