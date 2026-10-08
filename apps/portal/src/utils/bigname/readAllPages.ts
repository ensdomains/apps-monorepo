import {
  type BignameError,
  type Envelope,
  isStale,
} from '@ens-apps/indexer/bigname'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'

const MAX_RESTARTS = 3

type ReadPage<Row> = (
  cursor: string | undefined,
) => ResultAsync<Envelope<readonly Row[]>, BignameError>

/**
 * Every page of one bigname collection, in order. A continuation that comes
 * back stale restarts the walk from the first page, a few times at most.
 */
export const readAllPages = <Row>(
  read: ReadPage<Row>,
  cursor?: string,
  collected: readonly Row[] = [],
  restartsLeft = MAX_RESTARTS,
): ResultAsync<readonly Row[], BignameError> =>
  read(cursor)
    .andThen(({ data, page }) => {
      const rows = [...collected, ...data]
      const next = page?.next_cursor ?? null
      return next === null
        ? okAsync<readonly Row[], BignameError>(rows)
        : readAllPages(read, next, rows, restartsLeft)
    })
    .orElse((error) =>
      cursor !== undefined && isStale(error) && restartsLeft > 0
        ? readAllPages(read, undefined, [], restartsLeft - 1)
        : errAsync(error),
    )
