import { ResultFn } from '@ens-apps/utils/neverthrow'
import type { ResultAsync } from 'neverthrow'
import { err, ok } from 'neverthrow'
import { BignameError, isStale } from './errors'
import type { Envelope } from './types'

export type AllPagesOptions = {
  /** Restarts from page one after a `409 stale` before giving up. */
  readonly restarts?: number
  /** Hard stop; reaching it with rows remaining is a `page_limit` error. */
  readonly maxPages?: number
}

/**
 * Every row of a collection, following `next_cursor` to the end.
 *
 * A current-state collection's cursor is bound to the publication it was
 * issued under and answers `409 stale` once the index moves on. That is
 * expected on a live chain, so the read restarts from page one, a bounded
 * number of times, rather than surfacing the error. History cursors are
 * position-bound and never go stale.
 */
export const allPages = <Row>(
  read: (
    cursor?: string,
  ) => ResultAsync<Envelope<readonly Row[]>, BignameError>,
  options: AllPagesOptions = {},
): ResultAsync<readonly Row[], BignameError> => {
  const restarts = options.restarts ?? 2
  const maxPages = options.maxPages ?? 100

  return ResultFn(async function* () {
    let restarted = 0
    let rows: Row[] = []
    let cursor: string | undefined
    let pages = 0
    for (;;) {
      const page = await read(cursor)
      if (page.isErr() && isStale(page.error) && restarted < restarts) {
        restarted += 1
        rows = []
        cursor = undefined
        pages = 0
        continue
      }
      const { data, page: paging } = yield* page
      rows.push(...data)
      pages += 1
      const next = paging?.next_cursor
      if (!paging?.has_more || !next) return ok<readonly Row[]>(rows)
      if (pages >= maxPages) {
        return err(
          new BignameError({
            code: 'page_limit',
            message: `bigname collection has more than ${maxPages} pages`,
          }),
        )
      }
      cursor = next
    }
  })()
}
