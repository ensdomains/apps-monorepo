import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs, ROOT_RESOURCE } from '@/lib/roles/roleChangeLogs'
import {
  getBignameRootRoleHolders,
  getRootRoleReadsSupported,
  type RegistryRootRoles,
  type RootRoleHolder,
} from '@/lib/roles/rootRoleReads'

export type {
  RegistryRootRoles,
  RootRoleHolder,
} from '@/lib/roles/rootRoleReads'

type GetRegistryRootRoleHoldersParameters = {
  readonly registryAddress: Address
}

/**
 * Every account holding roles at a registry's root, folded from chain logs.
 *
 * `newRoleBitmap` is absolute state at each log, and logs arrive oldest-first,
 * so writing each account as it is seen leaves its latest bitmap. An account
 * whose latest bitmap decodes to nothing has been revoked and is dropped.
 *
 * The fallback for bigname v0.4.1. Remove it once the release that accepts
 * `GET /v1/permissions?registry=` is deployed everywhere.
 */
const getRegistryRootRoleHoldersFromLogs = ResultFn(async function* ({
  registryAddress,
}: GetRegistryRootRoleHoldersParameters) {
  const logs = yield* getRoleChangeLogs({
    registryAddress,
    resource: ROOT_RESOURCE,
  })

  const latest = new Map<Address, readonly Role[]>()

  for (const log of logs) {
    const account = log.args.account
    if (account === zeroAddress) continue
    latest.set(account, decodeRoleBitmap(log.args.newRoleBitmap))
  }

  const holders: RootRoleHolder[] = [...latest]
    .filter(([, roles]) => roles.length > 0)
    .map(([account, roles]) => ({ account, roles }))

  return ok(holders)
})

/**
 * Every account holding roles at a registry's root, with the roles it holds:
 * from bigname where the deployment serves them, else from chain logs. Only
 * bigname says whether operator-held roles are missing; the log scan never
 * sees them either, and cannot tell.
 */
export const getRegistryRootRoles = ResultFn(async function* (
  params: GetRegistryRootRoleHoldersParameters,
) {
  const isServedByBigname = yield* getRootRoleReadsSupported()
  if (isServedByBigname) return ok(yield* getBignameRootRoleHolders(params))

  const holders = yield* getRegistryRootRoleHoldersFromLogs(params)
  const roles: RegistryRootRoles = { holders, areOperatorRolesUnlisted: false }
  return ok(roles)
})

const getRegistryRootRoleHoldersQueryKey = createQueryKey<
  'get-registry-root-role-holders',
  GetRegistryRootRoleHoldersParameters
>('get-registry-root-role-holders')

/** The holders, and whether the list leaves operator-held roles out. */
export const getRegistryRootRolesQueryOptions = (
  params: GetRegistryRootRoleHoldersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleHoldersQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoles(params),
  })

const selectHolders = ({ holders }: RegistryRootRoles) => holders

/** The holders alone, from the same cache entry. */
export const getRegistryRootRoleHoldersQueryOptions = (
  params: GetRegistryRootRoleHoldersParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleHoldersQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoles(params),
    select: selectHolders,
  })
