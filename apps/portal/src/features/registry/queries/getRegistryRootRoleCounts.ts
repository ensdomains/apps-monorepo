import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { decodeRoleCounts, registryRoles } from '@ensdomains/ensjs/utils/v2'
import { permissionedRegistryRoleCountSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { ROOT_RESOURCE } from '@/lib/roles/roleHistory'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryRootRoleCountsError extends TaggedError(
  'GetRegistryRootRoleCountsError',
)<{
  cause: unknown
}> {}

type GetRegistryRootRoleCountsParameters = {
  readonly registryAddress: Address
}

/** How many accounts hold each role at the registry root, read on-chain. */
const getRegistryRootRoleCounts = ResultFn(async function* ({
  registryAddress,
}: GetRegistryRootRoleCountsParameters) {
  const client = yield* safeGetClient()

  const counts = yield* fromPromise(
    readContract(client, {
      address: registryAddress,
      abi: permissionedRegistryRoleCountSnippet,
      functionName: 'roleCount',
      args: [ROOT_RESOURCE],
    }),
    (cause) => new GetRegistryRootRoleCountsError({ cause }),
  )

  return ok(decodeRoleCounts(counts, registryRoles))
})

export const getRegistryRootRoleCountsQueryKey = createQueryKey<
  'registry-root-role-counts',
  GetRegistryRootRoleCountsParameters
>('registry-root-role-counts')

export const getRegistryRootRoleCountsQueryOptions = (
  params: GetRegistryRootRoleCountsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryRootRoleCountsQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getRegistryRootRoleCounts(queryParams),
    staleTime: 0,
  })
