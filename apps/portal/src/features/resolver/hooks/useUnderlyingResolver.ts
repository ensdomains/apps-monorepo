import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getUnderlyingAddress as ensjs_getUnderlyingAddress,
  type GetUnderlyingResolverErrorType,
  type GetUnderlyingResolverParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { getSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import { RESOLVER_INTERFACE_IDS } from '@/lib/constants/resolverInterfaceIds'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetUnderlyingResolverError extends TaggedError(
  'GetUnderlyingResolverError',
)<{
  cause: GetUnderlyingResolverErrorType
}> {}

export const getUnderlyingResolver = ResultFn(async function* (
  params: GetUnderlyingResolverParameters,
) {
  const client = yield* safeGetClient()

  const [isComposite] = yield* getSupportsInterfaces({
    address: params.resolverAddress,
    interfaces: [RESOLVER_INTERFACE_IDS.CompositeExtendedResolver],
  })

  if (!isComposite) return ok(null)

  const result = yield* fromPromise(
    // until it gets properly deployed
    ensjs_getUnderlyingAddress(client, params),
    (e) => {
      return new GetUnderlyingResolverError({
        cause: e as GetUnderlyingResolverErrorType,
      })
    },
  )

  return ok(result)
})

export const getUnderlyingAddressQueryKey = createQueryKey<
  'get-underlying-resolver',
  GetUnderlyingResolverParameters
>('get-underlying-resolver')

export const getUnderlyingAddressQueryOptions = (
  params: GetUnderlyingResolverParameters,
) =>
  resultQueryOptions({
    queryKey: getUnderlyingAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getUnderlyingResolver(params),
  })
