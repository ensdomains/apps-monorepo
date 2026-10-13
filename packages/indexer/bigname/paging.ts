import type { ResultAsync } from 'neverthrow'
import { type PagingStop, readAllPages } from '../shared/paging'
import { BignameError, isStale } from './errors'
import type { Envelope } from './types'

const toBignameStopError = (reason: PagingStop) =>
  new BignameError({
    code: reason === 'aborted' ? 'network' : 'malformed_response',
    message: `Paging stopped: ${reason}`,
  })

/** Every page of a bigname collection route. */
export const readAllCollectionPages = <Row>(
  read: (
    cursor: string | undefined,
  ) => ResultAsync<Envelope<readonly Row[]>, BignameError>,
  options: Readonly<{ limit?: number; signal?: AbortSignal }> = {},
): ResultAsync<readonly Row[], BignameError> =>
  readAllPages({
    readPage: (cursor) =>
      read(cursor).map(({ data, page }) => ({
        rows: data,
        nextCursor: page?.next_cursor ?? null,
      })),
    isStaleError: isStale,
    toStopError: toBignameStopError,
    limit: options.limit,
    signal: options.signal,
  })

/** Every page of a bigname collection route, each with its own `meta`. */
export const readAllEnvelopes = <Row>(
  read: (
    cursor: string | undefined,
  ) => ResultAsync<Envelope<readonly Row[]>, BignameError>,
  options: Readonly<{ signal?: AbortSignal }> = {},
): ResultAsync<readonly Envelope<readonly Row[]>[], BignameError> =>
  readAllPages({
    readPage: (cursor) =>
      read(cursor).map((envelope) => ({
        rows: [envelope],
        nextCursor: envelope.page?.next_cursor ?? null,
      })),
    isStaleError: isStale,
    toStopError: toBignameStopError,
    signal: options.signal,
  })
