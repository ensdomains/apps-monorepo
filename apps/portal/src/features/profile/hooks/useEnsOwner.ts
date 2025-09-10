import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetOwnerErrorType,
  type GetOwnerParameters,
  getOwner,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetEnsOwnerError extends TaggedError('GetEnsOwnerError')<{
  cause: GetOwnerErrorType
}> {}

export const getEnsOwner = ResultFn(async function* (
  params: GetOwnerParameters,
) {
  const client = yield* safeGetClient()

  const owner = yield* await fromPromise(
    getOwner(client, params),
    (e) =>
      new GetEnsOwnerError({
        cause: e as GetOwnerErrorType,
      }),
  )
  return ok(owner)
})

export const getEnsOwnerQueryKey = createQueryKey<
  'get-ens-owner',
  GetOwnerParameters
>('get-ens-owner')

export const getEnsOwnerQueryOptions = (params: GetOwnerParameters) =>
  resultQueryOptions({
    queryKey: getEnsOwnerQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getEnsOwner(params),
  })
