import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { eacRolesChangedEventSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { fromPromise, ok } from 'neverthrow'
import { type Address, zeroAddress } from 'viem'
import { type GetLogsErrorType, getLogs } from 'viem/actions'
import { getAction } from 'viem/utils'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryRootRoleHoldersError extends TaggedError(
  'GetRegistryRootRoleHoldersError',
)<{
  cause: GetLogsErrorType
}> {}

type GetRegistryRootRoleHoldersParameters = {
  readonly registryAddress: Address
  /** Earliest block to scan. */
  readonly fromBlock: bigint
}

export type RootRoleHolder = {
  readonly account: Address
  readonly roles: readonly Role[]
}

/** `ROOT_RESOURCE` — roles held here apply to every name in the registry. */
const ROOT_RESOURCE = 0n

/**
 * Every account holding roles at a registry's root, with the roles they hold.
 *
 * Read from logs rather than the indexer. `EACRolesChanged` declares `resource`
 * as an indexed topic, so filtering on `ROOT_RESOURCE` returns just the root
 * grants for this registry, complete and in one call: 9 logs on the `.eth`
 * registry against 169,782 role rows. The indexer cannot express that filter,
 * because `roleConnection` takes no arguments and caps a page at 100 rows, and
 * root grants carry no name so they cannot be reached by `namehash` either.
 *
 * Filtered on the single event rather than ensjs's `eacRolesEvents` array: with
 * several events viem cannot apply the indexed `args` per event, so the filter
 * widens to every role event on the registry and the RPC rejects it outright.
 *
 * `newRoleBitmap` is absolute state at that log, and logs arrive oldest-first,
 * so writing each account as it is seen leaves its latest bitmap. An account
 * whose latest bitmap decodes to nothing has been revoked and is dropped.
 */
const getRegistryRootRoleHolders = ResultFn(async function* ({
  registryAddress,
  fromBlock,
}: GetRegistryRootRoleHoldersParameters) {
  const client = yield* safeGetClient()

  const logs = yield* fromPromise(
    getAction(
      client,
      getLogs,
      'getLogs',
    )({
      address: registryAddress,
      event: eacRolesChangedEventSnippet[0],
      args: { resource: ROOT_RESOURCE },
      fromBlock,
    }),
    (e) =>
      new GetRegistryRootRoleHoldersError({ cause: e as GetLogsErrorType }),
  )

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
