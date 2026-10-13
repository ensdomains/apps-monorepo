import { errAsync, okAsync, ResultAsync } from 'neverthrow'

const MAX_STALE_ATTEMPTS = 3
const STALE_RETRY_DELAY_MS = 200
// A runaway guard, not a size limit: far past any address the apps list.
const MAX_PAGES = 500

const wait = (ms: number) =>
  ResultAsync.fromSafePromise(
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  )

/**
 * One request, sent again while bigname answers `stale`. Its documented
 * staleness is temporary (a namespace not yet published, an Interpret redo),
 * so the same request, cursor included, is what it asks for, after a pause.
 */
export const retryStale = <T, E>(
  read: () => ResultAsync<T, E>,
  isStaleError: (error: E) => boolean,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): ResultAsync<T, E> =>
  read().orElse((error) =>
    isStaleError(error) && attemptsLeft > 1
      ? wait(
          STALE_RETRY_DELAY_MS * (MAX_STALE_ATTEMPTS - attemptsLeft + 1),
        ).andThen(() => retryStale(read, isStaleError, attemptsLeft - 1))
      : errAsync(error),
  )

/** Why a walk stopped before the collection said it was done. */
export type PagingStop = 'aborted' | 'repeated_cursor' | 'too_many_pages'

type CollectionPage<Row> = Readonly<{
  rows: readonly Row[]
  nextCursor: string | null
}>

type ReadAllPagesParameters<Row, E> = Readonly<{
  readPage: (cursor: string | undefined) => ResultAsync<CollectionPage<Row>, E>
  isStaleError: (error: E) => boolean
  toStopError: (reason: PagingStop) => E
  /**
   * Stop once more than this many rows are read, so a caller can tell the
   * collection was cut short; the rows read so far are returned.
   */
  limit?: number
  signal?: AbortSignal
}>

type WalkFailure<E> = Readonly<{ error: E; cursor: string | undefined }>

const walk = <Row, E>(
  params: ReadAllPagesParameters<Row, E>,
  cursor: string | undefined,
  collected: readonly Row[],
  seen: ReadonlySet<string>,
): ResultAsync<readonly Row[], WalkFailure<E>> => {
  const stop = (reason: PagingStop) =>
    errAsync({ error: params.toStopError(reason), cursor: undefined })
  if (params.signal?.aborted) return stop('aborted')
  if (seen.size >= MAX_PAGES) return stop('too_many_pages')
  return retryStale(() => params.readPage(cursor), params.isStaleError)
    .mapErr((error) => ({ error, cursor }))
    .andThen(({ rows, nextCursor }) => {
      const read = [...collected, ...rows]
      const isDone =
        nextCursor === null ||
        (params.limit !== undefined && read.length > params.limit)
      if (isDone) return okAsync<readonly Row[], WalkFailure<E>>(read)
      if (seen.has(nextCursor)) return stop('repeated_cursor')
      return walk(params, nextCursor, read, new Set(seen).add(nextCursor))
    })
}

/** Every page of a collection, in order. */
export const readAllPages = <Row, E>(
  params: ReadAllPagesParameters<Row, E>,
): ResultAsync<readonly Row[], E> =>
  walk(params, undefined, [], new Set())
    // A cursor still stale after its retries is one bigname no longer
    // accepts; the read starts over once, without it.
    .orElse(({ error, cursor }) =>
      cursor !== undefined && params.isStaleError(error)
        ? walk(params, undefined, [], new Set())
        : errAsync({ error, cursor }),
    )
    .mapErr(({ error }) => error)
