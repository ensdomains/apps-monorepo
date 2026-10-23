import type { Role } from '@ensdomains/ensjs/utils/v2'
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { type Address, zeroAddress } from 'viem'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { type ResourceId, ROOT_RESOURCE_ID } from '@/lib/resource/resourceId'
import { isAdminRole } from '@/lib/roles/permissions'

type UseCallerAdminRolesParameters = {
  readonly registryAddress: Address
  /** The name's resource, or `null` while unknown (root roles still count). */
  readonly resource: ResourceId | null
  readonly account: Address | undefined
}

/** `account`'s on-chain `_ADMIN` roles on `resource` ORed with its registry-root ones; empty until loaded. */
export const useCallerAdminRoles = ({
  registryAddress,
  resource,
  account,
}: UseCallerAdminRolesParameters): ReadonlySet<Role> => {
  const [nameRoles, rootRoles] = useQueries({
    queries: [
      {
        ...getNameRolesForAccountQueryOptions({
          registryAddress,
          resource,
          account: account ?? zeroAddress,
        }),
        enabled: Boolean(account) && resource !== null,
      },
      {
        ...getNameRolesForAccountQueryOptions({
          registryAddress,
          resource: ROOT_RESOURCE_ID,
          account: account ?? zeroAddress,
        }),
        enabled: Boolean(account),
      },
    ],
  })

  const nameDecoded = nameRoles.data?.decoded
  const rootDecoded = rootRoles.data?.decoded

  return useMemo(
    () =>
      new Set<Role>(
        [...(nameDecoded ?? []), ...(rootDecoded ?? [])].filter(isAdminRole),
      ),
    [nameDecoded, rootDecoded],
  )
}
