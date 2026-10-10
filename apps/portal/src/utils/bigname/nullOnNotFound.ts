import type { BignameError } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'

/** A read whose resource bigname does not know answers null instead of failing. */
export const nullOnNotFound = <T>(
  read: ResultAsync<T, BignameError>,
): ResultAsync<T | null, BignameError> =>
  read.orElse((error) =>
    error.code === 'not_found'
      ? okAsync<T | null, BignameError>(null)
      : errAsync(error),
  )
