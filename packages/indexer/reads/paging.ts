import type { ResultAsync } from 'neverthrow'
import { type PagingStop, readAllPages, retryStale } from '../shared/paging'
import type { Page, ReadOptions } from './common.types'
import { IndexerReadError } from './errors'
import type {
  NameSummary,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from './namesForAddress.types'

const FETCH_PAGE_SIZE = 200

const isStaleRead = (error: IndexerReadError) => error.kind === 'stale'

const toReadStopError = (reason: PagingStop) =>
  new IndexerReadError({
    kind: 'unavailable',
    message: `Paging stopped: ${reason}`,
    cause: reason,
  })

/** One page, sent again while bigname answers stale. */
export const readNamesPage = (
  readNames: ReadNamesForAddress,
  query: NamesForAddressQuery,
  options: ReadOptions = {},
): ResultAsync<Page<NameSummary>, IndexerReadError> =>
  retryStale((signal) => readNames(query, { signal }), isStaleRead, options)

/** Every page of a names read, in the order bigname returns them. */
export const readAllNames = (
  readNames: ReadNamesForAddress,
  query: Omit<NamesForAddressQuery, 'cursor' | 'pageSize'>,
  {
    pageSize = FETCH_PAGE_SIZE,
    signal,
  }: Readonly<{ pageSize?: number; signal?: AbortSignal }> = {},
): ResultAsync<readonly NameSummary[], IndexerReadError> =>
  readAllPages({
    readPage: (cursor, signal) =>
      readNames(
        {
          ...query,
          pageSize,
          ...(cursor !== undefined && { cursor }),
        },
        { signal },
      ).map(({ items, nextCursor }) => ({ rows: items, nextCursor })),
    isStaleError: isStaleRead,
    toStopError: toReadStopError,
    signal,
  })
