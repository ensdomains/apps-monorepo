import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { decodeRoleCounts, registryRoles } from '@ensdomains/ensjs/utils/v2'
import { permissionedRegistryRoleCountSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import type { Address, ReadContractErrorType } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryRootRoleCountsError extends TaggedError(
  'GetRegistryRootRoleCountsError',
)<{
  cause: ReadContractErrorType
}> {}

type GetRegistryRootRoleCountsParameters = {
  readonly registryAddress: Address
}

/** `ROOT_RESOURCE`, the EAC scope whose roles apply to every name in a registry. */
const ROOT_RESOURCE = 0n

/**
 * How many accounts hold each role at a registry's root.
 *
 * Read on chain rather than by replaying `EACRolesChanged`: root grants carry no
 * name on the indexer, so they cannot be found by name, and finding them by
 * registry would mean paging that registry's whole event history (169,793 on the
 * `.eth` registry). `roleCount` answers it exactly in one call.
 *
 * Counts, not accounts. `EnhancedAccessControl` tracks per-role assignee counts
 * but not the addresses, so naming the holders needs the indexer.
 *
 * ensjs's `getRoleCounts` hashes a label to reach the resource, so it cannot
 * address `ROOT_RESOURCE`; the read is done directly here.
 */
const getRegistryRootRoleCounts = ResultFn(async function* ({
  registryAddress,
}: GetRegistryRootRoleCountsParameters) {
  const client = yield* safeGetClient()

  const raw = yield* fromPromise(
    getAction(
      client,
      readContract,
      'readContract',
    )({
      address: registryAddress,
      abi: permissionedRegistryRoleCountSnippet,
      functionName: 'roleCount',
      args: [ROOT_RESOURCE],
    }),
    (e) =>
      new GetRegistryRootRoleCountsError({ cause: e as ReadContractErrorType }),
  )

  return ok(decodeRoleCounts(raw, registryRoles))
})

const getRegistryRootRoleCountsQueryKey = createQueryKey<
  'get-registry-root-role-counts',
  GetRegistryRootRoleCountsParameters
>('get-registry-root-role-counts')

export const getRegistryRootRoleCountsQueryOptions = (
  params: GetRegistryRootRoleCountsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleCountsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryRootRoleCounts(params),
  })
