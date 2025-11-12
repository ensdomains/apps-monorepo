import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getNameRegistries as ensjs_getNameRegistries,
  type GetNameRegistriesErrorType,
  type GetNameRegistriesParameters,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetNameRegistriesError extends TaggedError(
  'GetNameRegistriesError',
)<{
  cause: GetNameRegistriesErrorType
}> {}

export const getNameRegistries = ResultFn(async function* (
  params: GetNameRegistriesParameters,
) {
  const client = yield* safeGetClient()

  const registries = yield* await fromPromise(
    ensjs_getNameRegistries(client, params),
    (e) =>
      new GetNameRegistriesError({
        cause: e as GetNameRegistriesErrorType,
      }),
  )
  console.log('🚀 ~ registries:', registries)
  return ok(registries)
})

export const getNameRegistriesQueryKey = createQueryKey<
  'get-name-registries',
  GetNameRegistriesParameters
>('get-name-registries')

export const getNameRegistriesQueryOptions = (
  params: GetNameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: getNameRegistriesQueryKey(params),
    queryFn: ({
      queryKey: [, params],
    }: {
      queryKey: readonly [string, GetNameRegistriesParameters]
    }) => getNameRegistries(params),
  })
