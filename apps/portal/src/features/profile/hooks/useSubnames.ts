import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetSubnamesErrorType,
  type GetSubnamesParameters,
  getSubnames,
} from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetSubnamesError extends TaggedError('GetSubnamesError')<{
  cause: GetSubnamesErrorType
}> {}

export const getSubnamesResult = ResultFn(async function* (
  params: GetSubnamesParameters,
) {
  const client = yield* safeGetClient()

  const subnames = yield* await fromPromise(
    getSubnames(client, params),
    (e) =>
      new GetSubnamesError({
        cause: e as GetSubnamesErrorType,
      }),
  )
  return ok(subnames)
})

export const getSubnamesQueryKey = createQueryKey<
  'get-subnames',
  GetSubnamesParameters
>('get-subnames')

export const getSubnamesQueryOptions = (params: GetSubnamesParameters) =>
  resultQueryOptions({
    queryKey: getSubnamesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getSubnamesResult(params),
  })
