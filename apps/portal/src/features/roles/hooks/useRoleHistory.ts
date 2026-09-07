import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetResourceErrorType } from '@ensdomains/ensjs/public/v2'
import { getResource as ensjs_getResource } from '@ensdomains/ensjs/public/v2'
import { type NormalizeErrorType, normalize } from '@ensdomains/ensjs/utils'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import {
  getRoleChangeLogs,
  toRoleHistoryEntries,
} from '@/lib/roles/roleChangeLogs'
import { safeGetClient } from '@/lib/wagmi/helpers'

export type { RoleHistoryEntry } from '@/lib/roles/roleChangeLogs'

class NameNotNormalizableError extends TaggedError('NameNotNormalizableError')<{
  cause: NormalizeErrorType
}> {}

class GetResourceError extends TaggedError('GetResourceError')<{
  cause: GetResourceErrorType
}> {}

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
  // Normalized before hashing: a raw route parameter would address a resource
  // the registry never wrote to.
  const normalized = yield* fromSync(
    () => normalize(name),
    (e) => new NameNotNormalizableError({ cause: e as NormalizeErrorType }),
  )
  const [label] = normalized.split('.')

  const client = yield* safeGetClient()

  const resource = yield* fromPromise(
    ensjs_getResource(client, { label, registryAddress }),
    (e) => new GetResourceError({ cause: e as GetResourceErrorType }),
  )

  const logs = yield* getRoleChangeLogs({ registryAddress, resource, account })

  const entries = yield* toRoleHistoryEntries({ logs, resource })

  return ok(entries)
})

const getRoleHistoryQueryKey = createQueryKey<
  'get-role-history',
  GetRoleHistoryParameters
>('get-role-history')

export const getRoleHistoryQueryOptions = (params: GetRoleHistoryParameters) =>
  resultQueryOptions({
    queryKey: getRoleHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRoleHistory(params),
  })
