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

class NameRegistriesError extends TaggedError('NameRegistriesError')<{
  cause: GetNameRegistriesErrorType
}> {}

/**
 * Fetches ENS name registries for a given list of names.
 */
export const getNameRegistries = ResultFn(async function* (
  params: GetNameRegistriesParameters,
) {
  const client = yield* safeGetClient()

  const registries = yield* await fromPromise(
    ensjs_getNameRegistries(client, params),
    (e) => new NameRegistriesError({ cause: e as GetNameRegistriesErrorType }),
  )

  return ok(registries)
})

// Query key factory
export const nameRegistriesQueryKey = createQueryKey<
  'nameRegistries',
  GetNameRegistriesParameters
>('nameRegistries')

// React Query options for fetching name registries
export const getNameRegistriesQueryOptions = (
  params: GetNameRegistriesParameters,
) =>
  resultQueryOptions({
    queryKey: nameRegistriesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameRegistries(params),
  })
