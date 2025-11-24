import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getOwner as ensjs_getOwner,
  type GetOwnerErrorType,
  type GetOwnerParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetRegistryOwnerError extends TaggedError(
  'GetRegistryOwnerError',
)<{
  cause: GetOwnerErrorType
}> {}

export const getRegistryOwner = ResultFn(async function* (
  params: GetOwnerParameters, // ✅ { registryAddress, label }
) {
  const client = yield* safeGetClient()

  const owner = yield* await fromPromise(
    ensjs_getOwner(client, params),
    (e) =>
      new GetRegistryOwnerError({
        cause: e as GetOwnerErrorType,
      }),
  )

  return ok(owner)
})

export const getRegistryOwnerQueryKey = createQueryKey<
  'get-registry-owner',
  GetOwnerParameters
>('get-registry-owner')

export const getRegistryOwnerQueryOptions = (params: GetOwnerParameters) =>
  resultQueryOptions({
    queryKey: getRegistryOwnerQueryKey(params),
    queryFn: ({
      queryKey: [, params],
    }: {
      queryKey: readonly [string, GetOwnerParameters]
    }) => getRegistryOwner(params),
  })
