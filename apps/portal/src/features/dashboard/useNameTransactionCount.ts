import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetSupportedInterfacesErrorType } from '@ensdomains/ensjs/public'
import type {
  GetNameHistoryErrorType,
  GetNameHistoryParameters,
} from '@ensdomains/ensjs/subgraph'
import { getNameHistory } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetNameTransactionCountError extends TaggedError(
  'GetNameTransactionCountError',
)<{
  cause: GetNameHistoryErrorType
}> {}

export const getNameTransactionCount = ResultFn(async function* (
  params: GetNameHistoryParameters,
) {
  const client = yield* safeGetClient()

  const events = yield* await fromPromise(
    getNameHistory(client, params),
    (e) =>
      new GetNameTransactionCountError({
        cause: e as GetSupportedInterfacesErrorType,
      }),
  )

  if (!events) return ok(0)

  const transactionIds = new Set<string>()

  for (const event of [
    ...events.domainEvents,
    ...(events.registrationEvents || []),
    ...(events.resolverEvents || []),
  ]) {
    transactionIds.add(event.transactionID)
  }

  return ok(transactionIds.size)
})

export const supportsInterfacesQueryKey = createQueryKey<
  'get-name-tx-count',
  GetNameHistoryParameters
>('get-name-tx-count')

export const getNameTransactionCountQueryOptions = (
  params: GetNameHistoryParameters,
) =>
  resultQueryOptions({
    queryKey: supportsInterfacesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameTransactionCount(params),
  })
