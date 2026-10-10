import type { ResultAsync } from 'neverthrow'
import { readAllPages, retryStale } from '../bigname/paging'
import type { Page } from './common.types'
import type { IndexerReadError } from './errors'
import type {
  NameSummary,
  NamesForAddressQuery,
  ReadNamesForAddress,
} from './namesForAddress.types'

const FETCH_PAGE_SIZE = 200

const isStaleRead = (error: IndexerReadError) => error.kind === 'stale'

/** One page, sent again while bigname answers stale. */
export const readNamesPage = (
  readNames: ReadNamesForAddress,
  query: NamesForAddressQuery,
): ResultAsync<Page<NameSummary>, IndexerReadError> =>
  retryStale(() => readNames(query), isStaleRead)

/** Every page of a names read, in the order bigname returns them. */
export const readAllNames = (
  readNames: ReadNamesForAddress,
  query: Omit<NamesForAddressQuery, 'cursor' | 'pageSize'>,
  pageSize = FETCH_PAGE_SIZE,
): ResultAsync<readonly NameSummary[], IndexerReadError> =>
  readAllPages({
    readPage: (cursor) =>
      readNames({
        ...query,
        pageSize,
        ...(cursor !== undefined && { cursor }),
      }).map(({ items, nextCursor }) => ({ rows: items, nextCursor })),
    isStaleError: isStaleRead,
  })
