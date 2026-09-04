import { fromSync, ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNameRolesAccountsReturnType,
  GetResourceErrorType,
} from '@ensdomains/ensjs/public/v2'
import { getResource as ensjs_getResource } from '@ensdomains/ensjs/public/v2'
import { type NormalizeErrorType, normalize } from '@ensdomains/ensjs/utils'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { getRoleChangeLogs } from '@/lib/roles/roleChangeLogs'
import { safeGetClient } from '@/lib/wagmi/helpers'

class NameNotNormalizableError extends TaggedError('NameNotNormalizableError')<{
  cause: NormalizeErrorType
}> {}

class GetResourceError extends TaggedError('GetResourceError')<{
  cause: GetResourceErrorType
}> {}

type NameRolesAccountsParameters = {
  /** The full name. The label is derived from it, so the two always agree. */
  readonly name: string
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
  name,
  registryAddress,
}: NameRolesAccountsParameters) {
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
  NameRolesAccountsParameters
>('get-name-roles-accounts')

/**
 * Normalized for the cache key so two spellings of one name share an entry.
 * Deliberately falls back to the raw name rather than throwing: this runs while
 * building query options during render, and a malformed name should surface as
 * the query's tagged error, which it does when the fetcher normalizes it again.
 */
const cacheableName = (name: string): string => {
  try {
    return normalize(name)
  } catch {
    return name
  }
}

export const getNameRolesAccountsQueryOptions = ({
  name,
  ...params
}: NameRolesAccountsParameters) =>
  resultQueryOptions({
    queryKey: getNameRolesAccountsQueryKey({
      name: cacheableName(name),
      ...params,
    }),
    queryFn: ({ queryKey: [, params] }) => getNameRolesAccounts(params),
  })
