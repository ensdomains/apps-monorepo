import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs } from '@/lib/roles/roleChangeLogs'
import { ROOT_RESOURCE } from '@/lib/roles/rootResource'

type GetRegistryRootRoleHoldersParameters = {
  readonly registryAddress: Address
  /** Earliest block to scan. See `ROLES_FROM_BLOCK`. */
  readonly fromBlock: bigint
}

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly Role[]
}

/**
 * Every account holding roles at a registry's root, with the roles it holds.
 *
 * `newRoleBitmap` is absolute state at each log, and logs arrive oldest-first,
 * so writing each account as it is seen leaves its latest bitmap. An account
 * whose latest bitmap decodes to nothing has been revoked and is dropped.
 */
const getRegistryRootRoleHolders = ResultFn(async function* ({
  registryAddress,
  fromBlock,
}: GetRegistryRootRoleHoldersParameters) {
  const logs = yield* getRoleChangeLogs({
    registryAddress,
    fromBlock,
    resource: ROOT_RESOURCE,
  })

  const latest = new Map<Address, readonly Role[]>()

  for (const log of logs) {
    const account = log.args.account
    if (!account || account === zeroAddress) continue
    latest.set(account, decodeRoleBitmap(log.args.newRoleBitmap ?? 0n))
  }

  const holders: RootRoleHolder[] = [...latest]
    .filter(([, roles]) => roles.length > 0)
    .map(([account, roles]) => ({ account, roles }))

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
