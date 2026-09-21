import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { isVerifiedPermissionedResolver } from '@/features/resolver/utils/permissionedResolver'
import { safeGetClient } from '@/lib/wagmi/helpers'

class IsPermissionedResolverError extends TaggedError(
  'IsPermissionedResolverError',
)<{
  cause: unknown
}> {}

interface GetIsPermissionedResolverParams {
  readonly resolverAddress: Address
}

export const getIsPermissionedResolver = ResultFn(async function* (
  params: GetIsPermissionedResolverParams,
) {
  const client = yield* safeGetClient()
  const isVerified = yield* fromPromise(
    isVerifiedPermissionedResolver({
      client,
      address: params.resolverAddress,
    }),
    (error) => new IsPermissionedResolverError({ cause: error }),
  )
  return ok(isVerified)
})

const getIsPermissionedResolverQueryKey = createQueryKey<
  'is-permissioned-resolver',
  GetIsPermissionedResolverParams
>('is-permissioned-resolver')

export const getIsPermissionedResolverQueryOptions = (
  params: GetIsPermissionedResolverParams,
) =>
  resultQueryOptions({
    queryKey: getIsPermissionedResolverQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getIsPermissionedResolver(queryParams),
  })

export const useIsPermissionedResolver = (
  params: GetIsPermissionedResolverParams,
) => useQuery(getIsPermissionedResolverQueryOptions(params))
