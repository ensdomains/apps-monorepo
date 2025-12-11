import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  type GetRegistrationDateErrorType,
  type GetRegistrationDateParameters,
  getRegistrationDate,
} from '@ensdomains/ensjs/public/v2'
import { fromPromise, ok } from 'neverthrow'
import { namechainSepolia } from '@/lib/wagmi'
import { safeGetNamechainSepoliaClient } from '@/lib/wagmi/helpers'

export class GetV2RegistrationDateError extends TaggedError(
  'GetV2RegistrationDateError',
)<{
  cause: GetRegistrationDateErrorType
}> {}

export const getV2RegistrationDate = ResultFn(async function* (
  params: GetRegistrationDateParameters,
) {
  const client = yield* safeGetNamechainSepoliaClient()

  const expiry = yield* await fromPromise(
    getRegistrationDate({ ...client, chain: namechainSepolia }, params),
    (e) =>
      new GetV2RegistrationDateError({
        cause: e as GetRegistrationDateErrorType,
      }),
  )
  return ok(expiry)
})

export const getV2RegistrationDateQueryKey = createQueryKey<
  'get-v2-reg',
  GetRegistrationDateParameters
>('get-v2-reg')

export const getV2RegistrationDateQueryOptions = (
  params: GetRegistrationDateParameters,
) =>
  resultQueryOptions({
    queryKey: getV2RegistrationDateQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV2RegistrationDate(params),
  })
