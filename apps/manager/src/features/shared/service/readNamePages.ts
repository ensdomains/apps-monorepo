import type {
  IndexerReadError,
  NameSummary,
  NamesForAddressQuery,
  Page,
  ReadNamesForAddress,
} from '@ens-apps/indexer/reads'
import { ResultFn } from '@ens-apps/utils/neverthrow'
import { errAsync, ok, type ResultAsync } from 'neverthrow'

const MAX_STALE_ATTEMPTS = 3
const FETCH_PAGE_SIZE = 200

/** One page; a stale answer is retried as sent, since the cursor holds no snapshot. */
export const readNamesPage = (
  readNames: ReadNamesForAddress,
  query: NamesForAddressQuery,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): ResultAsync<Page<NameSummary>, IndexerReadError> =>
  readNames(query).orElse((error) =>
    error.kind === 'stale' && attemptsLeft > 1
      ? readNamesPage(readNames, query, attemptsLeft - 1)
      : errAsync(error),
  )

/** Every page of a names read, in the order bigname returns them. */
export const readAllNames = ResultFn(async function* (
  readNames: ReadNamesForAddress,
  query: Omit<NamesForAddressQuery, 'cursor' | 'pageSize'>,
) {
  let names: readonly NameSummary[] = []
  let cursor: string | null = null
  do {
    const page: Page<NameSummary> = yield* readNamesPage(readNames, {
      ...query,
      pageSize: FETCH_PAGE_SIZE,
      ...(cursor !== null && { cursor }),
    })
    names = [...names, ...page.items]
    cursor = page.nextCursor
  } while (cursor !== null)
  return ok(names)
})
