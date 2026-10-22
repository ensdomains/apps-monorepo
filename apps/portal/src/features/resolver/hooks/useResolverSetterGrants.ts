import { fromSync, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { Address } from 'viem'
import { decodeSetterGrants } from '@/lib/roles/resolverRoles'
import { getResolverRoleGrants } from './useResolverOverview'

class GetResolverSetterGrantsError extends TaggedError(
  'GetResolverSetterGrantsError',
)<{
  readonly cause: unknown
}> {}

type GetResolverSetterGrantsParameters = {
  readonly resolverAddress: Address
  readonly account: Address
}

const getResolverSetterGrants = (
  { resolverAddress, account }: GetResolverSetterGrantsParameters,
  signal?: AbortSignal,
) =>
  getResolverRoleGrants({ address: resolverAddress, account }, signal)
    .mapErr((cause) => new GetResolverSetterGrantsError({ cause }))
    .andThen(({ roles, namedResources }) =>
      fromSync(
        () =>
          decodeSetterGrants(
            roles.flatMap(({ resource, roleBitmap }) =>
              resource === null
                ? []
                : [
                    {
                      resource: BigInt(resource),
                      roleBitmap: BigInt(roleBitmap),
                    },
                  ],
            ),
            namedResources,
          ),
        (cause) => new GetResolverSetterGrantsError({ cause }),
      ),
    )

const getResolverSetterGrantsQueryKey = createQueryKey<
  'get-resolver-setter-grants',
  GetResolverSetterGrantsParameters
>('get-resolver-setter-grants')

/** The setter scopes `account` is granted on `resolverAddress`, per bigname. */
export const getResolverSetterGrantsQueryOptions = (
  params: GetResolverSetterGrantsParameters,
) =>
  resultQueryOptions({
    queryKey: getResolverSetterGrantsQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getResolverSetterGrants(params, signal),
  })
