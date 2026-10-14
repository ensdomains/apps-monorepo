import { errAsync, okAsync, ResultAsync } from 'neverthrow'

const MAX_STALE_ATTEMPTS = 3
const STALE_RETRY_DELAY_MS = 200
// A runaway guard, not a size limit: far past any address the apps list.
const MAX_PAGES = 500

/** Resolves after `ms`, or as soon as `signal` aborts. */
const wait = (ms: number, signal: AbortSignal | undefined) =>
  ResultAsync.fromSafePromise(
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve()
      const onAbort = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms)
      signal?.addEventListener('abort', onAbort, { once: true })
    }),
  )

type RetryOptions = Readonly<{ signal?: AbortSignal }>

const retry = <T, E>(
  read: (signal?: AbortSignal) => ResultAsync<T, E>,
  isStaleError: (error: E) => boolean,
  signal: AbortSignal | undefined,
  attempt: number,
): ResultAsync<T, E> =>
  read(signal).orElse((error) =>
    isStaleError(error) && attempt < MAX_STALE_ATTEMPTS && !signal?.aborted
      ? wait(STALE_RETRY_DELAY_MS * attempt, signal).andThen(() =>
          signal?.aborted
            ? errAsync(error)
            : retry(read, isStaleError, signal, attempt + 1),
        )
      : errAsync(error),
  )

/**
 * One request, sent again while bigname answers `stale`. Its documented
 * staleness is temporary (a namespace not yet published, an Interpret redo),
 * so the same request, cursor included, is what it asks for, after a pause.
 * `signal` reaches the request and ends the pause; an abort stops retrying.
 */
export const retryStale = <T, E>(
  read: (signal?: AbortSignal) => ResultAsync<T, E>,
  isStaleError: (error: E) => boolean,
  { signal }: RetryOptions = {},
): ResultAsync<T, E> => retry(read, isStaleError, signal, 1)

/** Why a walk stopped before the collection said it was done. */
export type PagingStop = 'aborted' | 'repeated_cursor' | 'too_many_pages'

type CollectionPage<Row> = Readonly<{
  rows: readonly Row[]
  nextCursor: string | null
}>

type ReadAllPagesParameters<Row, E> = Readonly<{
  readPage: (
    cursor: string | undefined,
    signal?: AbortSignal,
  ) => ResultAsync<CollectionPage<Row>, E>
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
  return retryStale(
    (signal) => params.readPage(cursor, signal),
    params.isStaleError,
    { signal: params.signal },
  )
    .mapErr((error) => ({ error, cursor }))
    .andThen(({ rows, nextCursor }) => {
      if (params.signal?.aborted) return stop('aborted')
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
      cursor !== undefined &&
      params.isStaleError(error) &&
      !params.signal?.aborted
        ? walk(params, undefined, [], new Set())
        : errAsync({ error, cursor }),
    )
    .mapErr(({ error }) => error)
