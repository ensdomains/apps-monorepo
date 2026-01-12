import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'

import {
  getRegistryNameData as ensjs_getRegistryNameData,
  type GetRegistryNameDataErrorType,
  type GetRegistryNameDataParameters,
} from '@ensdomains/ensjs/public/v2'

import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryNameDataError extends TaggedError('GetRegistryNameDataError')<{
  cause: GetRegistryNameDataErrorType
}> {}

const getRegistryNameData = ResultFn(async function* (
  params: GetRegistryNameDataParameters,
) {
  const client = yield* safeGetClient()

  const registryData = yield* await fromPromise(
    ensjs_getRegistryNameData(client, params),
    (e) =>
      new GetRegistryNameDataError({
        cause: e as GetRegistryNameDataErrorType,
      }),
  )

  return ok(registryData)
})

const getRegistryNameDataQueryKey = createQueryKey<
  'get-registry-name-data',
  GetRegistryNameDataParameters
>('get-registry-name-data')

export const getRegistryNameDataQueryOptions = (
  params: GetRegistryNameDataParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryNameDataQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryNameData(params),
  })
