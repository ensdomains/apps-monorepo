import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import { type BignameError, isStale } from './errors'
import type { Envelope } from './types'

const MAX_STALE_ATTEMPTS = 3

/**
 * One request, sent again while bigname answers `stale`. Its documented
 * staleness is temporary (a namespace not yet published, an Interpret redo),
 * so the same request, cursor included, is what it asks for.
 */
export const retryStale = <T, E>(
  read: () => ResultAsync<T, E>,
  isStaleError: (error: E) => boolean,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): ResultAsync<T, E> =>
  read().orElse((error) =>
    isStaleError(error) && attemptsLeft > 1
      ? retryStale(read, isStaleError, attemptsLeft - 1)
      : errAsync(error),
  )

export type CollectionPage<Row> = Readonly<{
  rows: readonly Row[]
  nextCursor: string | null
}>

type ReadAllPagesParameters<Row, E> = Readonly<{
  readPage: (cursor: string | undefined) => ResultAsync<CollectionPage<Row>, E>
  isStaleError: (error: E) => boolean
  /** Stop once this many rows are read; the rows read so far are returned. */
  limit?: number
}>

const walk = <Row, E>(
  params: ReadAllPagesParameters<Row, E>,
  cursor: string | undefined,
  collected: readonly Row[],
  canRestart: boolean,
): ResultAsync<readonly Row[], E> =>
  retryStale(() => params.readPage(cursor), params.isStaleError)
    .andThen(({ rows, nextCursor }) => {
      const read = [...collected, ...rows]
      const isDone =
        nextCursor === null ||
        (params.limit !== undefined && read.length > params.limit)
      return isDone
        ? okAsync<readonly Row[], E>(read)
        : walk(params, nextCursor, read, canRestart)
    })
    // A cursor still stale after its retries is one bigname no longer
    // accepts; the walk starts over once, without it.
    .orElse((error) =>
      cursor !== undefined && canRestart && params.isStaleError(error)
        ? walk(params, undefined, [], false)
        : errAsync(error),
    )

/** Every page of a collection, in order. */
export const readAllPages = <Row, E>(
  params: ReadAllPagesParameters<Row, E>,
): ResultAsync<readonly Row[], E> => walk(params, undefined, [], true)

/** Every page of a bigname collection route. */
export const readAllCollectionPages = <Row>(
  read: (
    cursor: string | undefined,
  ) => ResultAsync<Envelope<readonly Row[]>, BignameError>,
  options: Readonly<{ limit?: number }> = {},
): ResultAsync<readonly Row[], BignameError> =>
  readAllPages({
    readPage: (cursor) =>
      read(cursor).map(({ data, page }) => ({
        rows: data,
        nextCursor: page?.next_cursor ?? null,
      })),
    isStaleError: isStale,
    limit: options.limit,
  })
