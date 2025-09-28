import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type {
  GetNamesForAddressErrorType,
  GetNamesForAddressParameters,
} from '@ensdomains/ensjs/subgraph'
import { getNamesForAddress as ensjs_getNamesForAddress } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetNamesForAddressError extends TaggedError(
  'GetNamesForAddressError',
)<{
  cause: GetNamesForAddressErrorType
}> {}

export const getNamesForAddress = ResultFn(async function* (
  params: GetNamesForAddressParameters,
) {
  const client = yield* safeGetClient()

  const names = yield* await fromPromise(
    ensjs_getNamesForAddress(client, params),
    (e) =>
      new GetNamesForAddressError({
        cause: e as GetNamesForAddressErrorType,
      }),
  )
  return ok(names)
})

export const getNamesForAddressQueryKey = createQueryKey<
  'get-names-for-address',
  GetNamesForAddressParameters
>('get-names-for-address')

export const getNamesForAddressQueryOptions = (
  params: GetNamesForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getNamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNamesForAddress(params),
  })
