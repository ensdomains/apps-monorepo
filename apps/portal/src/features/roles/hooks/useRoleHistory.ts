import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  getRoleChangeLogs,
  toRoleHistoryEntries,
} from '@/lib/roles/roleChangeLogs'
import { getVersionedResource } from './useVersionedResource'

export type { RoleHistoryEntry } from '@/lib/roles/roleChangeLogs'

type GetRoleHistoryParameters = {
  readonly name: string
  readonly registryAddress: Address
  /** Narrows to one account's changes on this name. */
  readonly account?: Address
}

/**
 * Role-change history for one name.
 *
 * The resource comes from the registry rather than from the label, so it
 * carries the name's current `eacVersionId`. Pinning that as the topic scopes
 * the read to this registration: a previous owner's grants sit under the
 * pre-bump resource and the node never returns them.
 */
export const getRoleHistory = ResultFn(async function* ({
  name,
  registryAddress,
  account,
}: GetRoleHistoryParameters) {
  const resource = yield* getVersionedResource({ name, registryAddress })

  const logs = yield* getRoleChangeLogs({
    name,
    registryAddress,
    resource,
    account,
  })

  const entries = yield* toRoleHistoryEntries({ logs, resource })

  return ok(entries)
})

export const getRoleHistoryQueryKey = createQueryKey<
  'get-role-history',
  GetRoleHistoryParameters
>('get-role-history')

export const getRoleHistoryQueryOptions = (params: GetRoleHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRoleHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRoleHistory(params),
  })
