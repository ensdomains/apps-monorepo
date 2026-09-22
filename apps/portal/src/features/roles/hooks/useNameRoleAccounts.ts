import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetNameRolesAccountsReturnType } from '@ensdomains/ensjs/public/v2'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import type { ResourceId } from '@/lib/resource/resourceId'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs } from '@/lib/roles/roleChangeLogs'

type NameRolesAccountsParameters = {
  /**
   * The name's EAC resource, resolved by the caller. Not derived from the name
   * here: a label rendered `[<64 hex>]` does not say which name it is, and the
   * rows this produces are the ones the sidebar's grants and revokes act on, so
   * they must be about the same resource those writes address (WEB-1458).
   */
  readonly resource: ResourceId | null
  readonly registryAddress: Address
}

/**
 * Current `account -> roles[]` state for a name, read from indexed logs.
 *
 * The resource comes from the registry, so it carries the name's current
 * `eacVersionId` and the node returns only this registration's grants: a
 * previous owner's sit under the pre-bump resource. `newRoleBitmap` is absolute
 * state at each log and logs arrive oldest-first, so writing each account as it
 * is seen leaves its latest bitmap; an account that decodes to nothing has been
 * revoked and is dropped.
 */
export const getNameRolesAccounts = ResultFn(async function* ({
  resource,
  registryAddress,
}: NameRolesAccountsParameters) {
  // No resource, no rows to attest to. Callers gate the query on this, so it is
  // defence rather than a path anything relies on.
  if (resource === null) return ok(new Map() as GetNameRolesAccountsReturnType)

  const logs = yield* getRoleChangeLogs({ registryAddress, resource })

  const latest = new Map<Address, Role[]>()

  for (const log of logs) {
    const account = log.args.account
    if (account === zeroAddress) continue
    latest.set(account, decodeRoleBitmap(log.args.newRoleBitmap))
  }

  const result: GetNameRolesAccountsReturnType = new Map(
    [...latest].filter(([, roles]) => roles.length > 0),
  )

  return ok(result)
})

const getNameRolesAccountsQueryKey = createQueryKey<
  'get-name-roles-accounts',
  Record<string, unknown>
>('get-name-roles-accounts')

export const getNameRolesAccountsQueryOptions = (
  params: NameRolesAccountsParameters,
) =>
  resultQueryOptions({
    // The resource is a bigint, which the default key hash cannot serialise.
    queryKey: getNameRolesAccountsQueryKey({
      ...params,
      resource: params.resource?.toString() ?? null,
    }),
    queryFn: () => getNameRolesAccounts(params),
  })
