import type {
  BignameError,
  HistoryEvent,
  NameHistoryParams,
} from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { bigname } from '@/lib/bigname'

export class GetNameHistoryError extends TaggedError('GetNameHistoryError')<{
  cause: BignameError
}> {}

/** Page size for history queries that render a full event list. */
export const NAME_HISTORY_PAGE_SIZE = 100

export type GetNameHistoryParameters = {
  name: string
} & Pick<NameHistoryParams, 'scope' | 'type' | 'order' | 'page_size'>

/**
 * One page of a name's history, ENSv1 and ENSv2 in one stream, with the typed
 * `data` payload and the raw upstream `kind` on every row. Rows carry their
 * block `timestamp`, so no block-timestamp RPC is needed to date them.
 *
 * The ENSv1 subgraph's categories map to `scope` / `type`: `domain` is
 * `scope: 'name'`, `registration` is `scope: 'registration'`, and `resolver`
 * is `type: ['record', 'resolver']`.
 */
const getNameHistory = ResultFn(async function* ({
  name,
  ...params
}: GetNameHistoryParameters) {
  const { data } = yield* fromPromise(
    bigname.getNameHistory(name, { ...params, include: ['data', 'raw'] }),
    (e) => new GetNameHistoryError({ cause: e as BignameError }),
  )
  return ok<readonly HistoryEvent[]>(data)
})

const getNameHistoryQueryKey = createQueryKey<
  'get-name-history',
  GetNameHistoryParameters
>('get-name-history')

export const getNameHistoryQueryOptions = (params: GetNameHistoryParameters) =>
  resultQueryOptions({
    queryKey: getNameHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameHistory(params),
  })
