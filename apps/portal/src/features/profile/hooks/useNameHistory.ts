import type {
  HistoryEvent,
  IndexerReadError,
  NameHistoryQuery,
} from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { dropUnassignedRecords } from '@/features/history/assignedResolvers'
import { requireIndexed } from '@/features/history/requireIndexed'
import { indexer } from '@/lib/indexer'

export class GetNameHistoryError extends TaggedError('GetNameHistoryError')<{
  cause: IndexerReadError
}> {}

/** Page size for history queries that render a full event list. */
export const NAME_HISTORY_PAGE_SIZE = 100

export type GetNameHistoryParameters = {
  readonly name: string
} & Pick<NameHistoryQuery, 'scope' | 'types' | 'order' | 'pageSize'>

/**
 * One page of a name's history, ENSv1 and ENSv2 in one stream, with the typed
 * `data` payload and the raw upstream `kind` on every row. Rows carry their
 * block `timestamp`, so no block-timestamp RPC is needed to date them.
 *
 * The ENSv1 subgraph's categories map to `scope` / `type`: `domain` is
 * `scope: 'name'`, `registration` is `scope: 'registration'`, and `resolver`
 * is `types: ['record', 'resolver']`.
 */
export type NameHistoryPage = {
  readonly rows: readonly HistoryEvent[]
  /** Undefined when the indexer does not count the history. */
  readonly totalCount: number | undefined
  readonly hasMore: boolean
}

const getNameHistory = (params: GetNameHistoryParameters) =>
  indexer
    .getNameHistory(params)
    .andThen(requireIndexed(params.name))
    .andThen((page) =>
      dropUnassignedRecords(page.items).map((items) => ({
        ...page,
        items,
      })),
    )
    .map(
      ({ items, nextCursor, totalCount }): NameHistoryPage => ({
        rows: items,
        totalCount: totalCount ?? undefined,
        hasMore: nextCursor !== null,
      }),
    )
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
