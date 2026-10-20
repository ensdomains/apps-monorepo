import {
  type BignameError,
  isStale,
  retryStale,
} from '@ens-apps/indexer/bigname'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'

/**
 * One bigname read, sent again while it answers stale; a resource bigname
 * does not know answers null instead of failing.
 */
export const nullOnNotFound = <T>(
  read: (signal?: AbortSignal) => ResultAsync<T, BignameError>,
  { signal }: Readonly<{ signal?: AbortSignal }> = {},
): ResultAsync<T | null, BignameError> =>
  retryStale(read, isStale, { signal }).orElse((error) =>
    error.code === 'not_found'
      ? okAsync<T | null, BignameError>(null)
      : errAsync(error),
  )
