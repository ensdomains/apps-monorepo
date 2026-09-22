import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getHasRolesQueryOptions } from './useHasRoles'
import { getNameRegistriesQueryOptions } from './useNameRegistryDiscovery'
import { useNameResourceId } from './useNameResourceId'

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

  const parentRegistry = registries?.at(1) ?? null

  // The name's id rather than its label: a label rendered `[<64 hex>]` does
  // not say which name it is, so the id is resolved once and the gate asks
  // about that (WEB-1458).
  const { resourceId, isLoading: isResourceIdLoading } = useNameResourceId({
    name,
    registryAddress: parentRegistry ?? undefined,
    enabled,
  })

  const {
    data: hasRole,
    isLoading: isRoleLoading,
    error: roleError,
  } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: parentRegistry ?? zeroAddress,
      resource: resourceId,
      roles: ['ROLE_SET_SUBREGISTRY'],
      account: connectedAddress ?? zeroAddress,
    }),
    enabled:
      enabled &&
      !!connectedAddress &&
      !!parentRegistry &&
      !isRegistriesLoading &&
      !!resourceId,
  })

  const error = registriesError ?? roleError

  return {
    hasRole: error ? undefined : (hasRole ?? false),
    isLoading:
      enabled && (isRegistriesLoading || isResourceIdLoading || isRoleLoading),
    error,
    parentRegistry,
    connectedAddress,
  }
}
