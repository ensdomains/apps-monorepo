import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRoleCounts } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
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
    getRoleCounts(client, { registryAddress }),
    (cause) => new GetRegistryRootRoleCountsError({ cause }),
  )

  return ok(counts.decoded)
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
