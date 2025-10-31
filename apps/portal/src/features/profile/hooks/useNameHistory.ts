import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetSupportedInterfacesErrorType } from '@ensdomains/ensjs/public'
import type {
  GetNameHistoryErrorType,
  GetNameHistoryParameters,
} from '@ensdomains/ensjs/subgraph'
import { getNameHistory as ensjs_getNameHistory } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetNameHistoryError extends TaggedError('GetNameHistoryError')<{
  cause: GetNameHistoryErrorType
}> {}

export const getNameHistory = ResultFn(async function* (
  params: GetNameHistoryParameters,
) {
  const client = yield* safeGetClient()

  const events = yield* fromPromise(
    ensjs_getNameHistory(client, params),
    (e) =>
      new GetNameHistoryError({
        cause: e as GetSupportedInterfacesErrorType,
      }),
  )
  return ok(events)
})

export const getNameHistoryQueryKey = createQueryKey<
  'get-name-history',
  GetNameHistoryParameters
>('get-name-history')

export const getNameHistoryQueryOptions = (params: GetNameHistoryParameters) =>
  resultQueryOptions({
    queryKey: getNameHistoryQueryKey(params),
    queryFn: () => getNameHistory(params),
  })
