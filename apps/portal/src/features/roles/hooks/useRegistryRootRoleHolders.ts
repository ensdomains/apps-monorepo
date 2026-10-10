import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { ROOT_RESOURCE } from '@/lib/roles/roleChangeLogs'
import { getRoleHolders } from '@/lib/roles/roleHolders'

type GetRegistryRootRoleHoldersParameters = {
  readonly registryAddress: Address
}

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly Role[]
}

/**
 * Every account holding roles at a registry's root, with the roles it holds.
 * An account whose bitmap decodes to nothing has been revoked and is dropped.
 */
const getRegistryRootRoleHolders = ResultFn(async function* ({
  registryAddress,
}: GetRegistryRootRoleHoldersParameters) {
  const current = yield* getRoleHolders({
    registryAddress,
    resource: ROOT_RESOURCE,
  })

  const holders: RootRoleHolder[] = current
    .filter(({ account }) => account !== zeroAddress)
    .map(({ account, roleBitmap }) => ({
      account,
      roles: decodeRoleBitmap(roleBitmap),
    }))
    .filter(({ roles }) => roles.length > 0)

  return ok(holders)
})

const getRegistryRootRoleHoldersQueryKey = createQueryKey<
  'get-registry-root-role-holders',
  GetRegistryRootRoleHoldersParameters
>('get-registry-root-role-holders')

export const getRegistryRootRoleHoldersQueryOptions = (
  params: GetRegistryRootRoleHoldersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleHoldersQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoleHolders(params),
  })
