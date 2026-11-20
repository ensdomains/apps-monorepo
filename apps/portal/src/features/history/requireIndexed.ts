import { IndexerReadError } from '@ens-apps/indexer/reads'
import { err, ok, type Result } from 'neverthrow'

/** A read that fails for a name the indexer has not indexed, as a bigname `404` did. */
export const requireIndexed =
  (name: string) =>
  <T>(value: T | null): Result<T, IndexerReadError> =>
    value === null
      ? err(
          new IndexerReadError({
            kind: 'unavailable',
            message: `Not indexed: ${name}`,
            cause: undefined,
          }),
        )
      : ok(value)
