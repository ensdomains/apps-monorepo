import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getSubgraphRecords as ensjs_getSubgraphRecords,
  type GetSubgraphRecordsErrorType,
} from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetSubgraphRecordsError extends TaggedError('GetSubgraphRecordsError')<{
  cause: GetSubgraphRecordsErrorType
}> {}

export const getSubgraphRecords = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const subgraphRecords = yield* await fromPromise(
    ensjs_getSubgraphRecords(client, { name }),
    (e) =>
      new GetSubgraphRecordsError({ cause: e as GetSubgraphRecordsErrorType }),
  )

  return ok(subgraphRecords)
})

const subgraphRecordsQueryKey = createQueryKey<
  'subgraph-records',
  {
    name: string
  }
>('subgraph-records')

const getSubgraphRecordsQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: subgraphRecordsQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getSubgraphRecords(name),
  })
