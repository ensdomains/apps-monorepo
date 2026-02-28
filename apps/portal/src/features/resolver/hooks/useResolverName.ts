import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetResolverNameErrorType,
  GetResolverNameParameters,
} from '@ensdomains/ensjs/public/v2'
import { getResolverName as ensjs_getResolverName } from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getIsDedicatedResolver } from './useIsDedicatedResolver'

class GetResolverNameError extends TaggedError('GetResolverNameError')<{
  cause: GetResolverNameErrorType
}> {}

const getResolverName = ResultFn(async function* (
  params: GetResolverNameParameters,
) {
  const client = yield* safeGetClient()

  const supportsDedicatedResolver = yield* getIsDedicatedResolver({
    resolverAddress: params.resolverAddress,
  })

  if (!supportsDedicatedResolver) return ok(null)

  const name = yield* fromPromise(
    ensjs_getResolverName(client, params),
    (e) => {
      return new GetResolverNameError({
        cause: e as GetResolverNameErrorType,
      })
    },
  )

  return ok(name)
})

const getResolverNameQueryKey = createQueryKey<
  'get-resolver-name',
  GetResolverNameParameters
>('get-resolver-name')

export const getResolverNameQueryOptions = (
  params: GetResolverNameParameters,
) =>
  resultQueryOptions({
    queryKey: getResolverNameQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getResolverName(params),
  })
