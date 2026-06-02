/**
 * True when the connected wallet holds at least one `*_ADMIN` role at the
 * registry-root resource on the given registry. Drives the visibility of
 * admin-only affordances (`+ Add User`, per-row Edit icon, etc.) so
 * non-admin viewers see the data but no management UI.
 *
 * Returns `false` when no wallet is connected.
 */

import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useWalletClient } from 'wagmi'
import { getRegistryRolesQueryOptions } from './useRegistryRoles'

export function useIsRegistryAdmin(registryAddress: Address): boolean {
  const { data: walletClient } = useWalletClient()
  const callerAddress = walletClient?.account?.address

  const { data: rolesData } = useQuery({
    ...getRegistryRolesQueryOptions({ address: registryAddress }),
    enabled: Boolean(callerAddress),
  })

  if (!callerAddress || !rolesData) return false
  const callerLower = callerAddress.toLowerCase()
  const callerRow = rolesData.find(
    (r) => r.account.toLowerCase() === callerLower,
  )
  return !!callerRow && callerRow.roles.some((r) => r.endsWith('_ADMIN'))
}
