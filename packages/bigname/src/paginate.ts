import { isBignameError } from './errors'
import type { BignamePage, Meta, Page } from './types'

/** Fetch one page; `cursor` is `undefined` for the first page. */
export type PageFetcher<TPage extends BignamePage<unknown>> = (
  cursor: string | undefined,
) => Promise<TPage>

export interface IteratePagesOptions {
  /** Pages to fetch per pass (a restart begins a new pass). Default 100. */
  readonly maxPages?: number
  /** Restarts from the first page after a continuation that stays `409 stale`. Default 3. */
  readonly maxRestarts?: number
  readonly signal?: AbortSignal
}

/** A page plus whether it is the first page of a restarted pass. */
export type PageStep<TPage> = TPage & {
  /** True when earlier pages were discarded by a `409 stale` restart. */
  readonly restarted: boolean
}

/**
 * Walk `next_cursor` until `has_more` is false or `maxPages` is reached.
 *
 * The client already retries `409 stale` with the same cursor (bigname
 * cursors hold only a sort position). A continuation that is still stale
 * after those retries, such as a resolver collection pinned with `at` after
 * a later block, restarts from the first page, up to `maxRestarts` times,
 * and the first page of the new pass is yielded with `restarted: true`:
 * consumers must drop what they collected so far.
 */
export async function* iteratePages<TPage extends BignamePage<unknown>>(
  fetchPage: PageFetcher<TPage>,
  options: IteratePagesOptions = {},
): AsyncGenerator<PageStep<TPage>, void, undefined> {
  const maxPages = options.maxPages ?? 100
  const maxRestarts = options.maxRestarts ?? 3
  let cursor: string | undefined
  let restarts = 0
  let pagesThisPass = 0
  let isRestarted = false

  while (true) {
    options.signal?.throwIfAborted()
    let response: TPage
    try {
      response = await fetchPage(cursor)
    } catch (error) {
      const canRestart =
        cursor !== undefined &&
        isBignameError(error, 'stale') &&
        restarts < maxRestarts
      if (!canRestart) throw error
      restarts += 1
      cursor = undefined
      pagesThisPass = 0
      isRestarted = true
      continue
    }
    yield { ...response, restarted: isRestarted }
    isRestarted = false
    pagesThisPass += 1
    const nextCursor = response.page.next_cursor
    if (!response.page.has_more || !nextCursor || pagesThisPass >= maxPages)
      return
    cursor = nextCursor
  }
}

export interface FetchAllPagesOptions extends IteratePagesOptions {
  /** Stop collecting after this many rows. Default 10,000. */
  readonly maxRows?: number
}

export interface AllPages<TRow> {
  readonly rows: readonly TRow[]
  /** Page object of the last page fetched. */
  readonly page: Page
  /** Meta of the last page fetched. */
  readonly meta: Meta
  /** True when `maxPages` or `maxRows` stopped the walk before the end. */
  readonly truncated: boolean
}

type RowOf<TPage> = TPage extends BignamePage<infer TRow> ? TRow : never

/** Collect every row of a collection, restarting on `409 stale`, with page and row guards. */
export const fetchAllPages = async <TPage extends BignamePage<unknown>>(
  fetchPage: PageFetcher<TPage>,
  options: FetchAllPagesOptions = {},
): Promise<AllPages<RowOf<TPage>>> => {
  const maxRows = options.maxRows ?? 10_000
  let rows: RowOf<TPage>[] = []
  let last: PageStep<TPage> | undefined
  for await (const step of iteratePages(fetchPage, options)) {
    rows = step.restarted
      ? [...(step.data as RowOf<TPage>[])]
      : [...rows, ...(step.data as RowOf<TPage>[])]
    last = step
    if (rows.length >= maxRows) break
  }
  if (!last) throw new Error('bigname: pager finished without a page')
  const hasMore = last.page.has_more && last.page.next_cursor !== null
  return {
    rows: rows.slice(0, maxRows),
    page: last.page,
    meta: last.meta,
    truncated: hasMore || rows.length > maxRows,
  }
}
