import type {
  NameHistoryQuery,
  NameHistoryRow,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

export class GetNameHistoryError extends TaggedError('GetNameHistoryError')<{
  cause: unknown
}> {}

/** Page size for history queries that render a full event list. */
export const NAME_HISTORY_PAGE_SIZE = 100

export type GetNameHistoryParameters = {
  readonly name: string
} & Pick<NameHistoryQuery, 'scope' | 'type' | 'order' | 'page_size'>

/**
 * One page of a name's history, ENSv1 and ENSv2 in one stream, with the typed
 * `data` payload and the raw upstream `kind` on every row. Rows carry their
 * block `timestamp`, so no block-timestamp RPC is needed to date them.
 *
 * The ENSv1 subgraph's categories map to `scope` / `type`: `domain` is
 * `scope: 'name'`, `registration` is `scope: 'registration'`, and `resolver`
 * is `type: ['record', 'resolver']`.
 */
const getNameHistory = ({ name, ...params }: GetNameHistoryParameters) =>
  bigname
    .nameHistory(name, { ...params, include: ['data', 'raw'] })
    .map(({ data }): readonly NameHistoryRow[] => data)
    .mapErr((cause) => new GetNameHistoryError({ cause }))

const getNameHistoryQueryKey = createQueryKey<
  'get-name-history',
  GetNameHistoryParameters
>('get-name-history')

export const getNameHistoryQueryOptions = (params: GetNameHistoryParameters) =>
  resultQueryOptions({
    queryKey: getNameHistoryQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameHistory(params),
  })
