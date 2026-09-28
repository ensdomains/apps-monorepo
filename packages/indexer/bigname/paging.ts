import { ResultAsync } from 'neverthrow'
import { BignameError, isStale } from './errors'
import type { Envelope } from './types'

export type AllPagesOptions = {
  /** Restarts from page one after a `409 stale` before giving up. */
  readonly restarts?: number
  /** Hard stop, so a misbehaving cursor cannot loop forever. */
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

  return ResultAsync.fromPromise(
    (async () => {
      let restarted = 0
      let rows: Row[] = []
      let cursor: string | undefined
      let pages = 0
      for (;;) {
        const page = await read(cursor)
        if (page.isErr()) {
          if (isStale(page.error) && restarted < restarts) {
            restarted += 1
            rows = []
            cursor = undefined
            continue
          }
          throw page.error
        }
        rows.push(...page.value.data)
        pages += 1
        const next = page.value.page?.next_cursor
        if (!page.value.page?.has_more || !next || pages >= maxPages)
          return rows
        cursor = next
      }
    })(),
    (error) =>
      error instanceof BignameError
        ? error
        : new BignameError({
            code: 'network',
            message: `bigname paging failed: ${String(error)}`,
            cause: error,
          }),
  )
}
