import {
  type BignameClient,
  isStale,
  type LookupRecord,
  type LookupResponse,
} from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'

const LOOKUP_BATCH_SIZE = 250
const MAX_STALE_ATTEMPTS = 3

export class BignameLookupError extends TaggedError('BignameLookupError')<{
  cause: unknown
}> {}

export type LookupOptions = {
  readonly signal?: AbortSignal
}

export const checkNotAborted = <E>(
  signal: AbortSignal | undefined,
  toError: (cause: unknown) => E,
): Result<void, E> => (signal?.aborted ? err(toError(signal.reason)) : ok())

/** bigname's snapshot can move under a long read; a stale answer is retried from the start. */
export const retryOnStale = async <T, E>(
  read: () => PromiseLike<Result<T, E>>,
  isStaleError: (error: E) => boolean,
  attemptsLeft = MAX_STALE_ATTEMPTS,
): Promise<Result<T, E>> => {
  const result = await read()
  return result.isErr() && attemptsLeft > 1 && isStaleError(result.error)
    ? retryOnStale(read, isStaleError, attemptsLeft - 1)
    : result
}

const toError = (cause: unknown) => new BignameLookupError({ cause })

/** Detail records for every name; any answer that is not `ok` fails the read rather than leaving a gap. */
export const lookupNames = ResultFn(async function* (
  lookup: BignameClient['lookup'],
  names: readonly string[],
  options: LookupOptions = {},
) {
  let records: readonly LookupRecord[] = []
  for (let start = 0; start < names.length; start += LOOKUP_BATCH_SIZE) {
    yield* checkNotAborted(options.signal, toError)
    const batch = names.slice(start, start + LOOKUP_BATCH_SIZE)
    const response: LookupResponse = yield* (
      await retryOnStale(
        () =>
          lookup({
            namespace: 'ens',
            profile: 'detail',
            inputs: batch.map((name) => ({ name })),
          }),
        isStale,
      )
    ).mapErr(toError)
    const failed = response.data.find(
      (result) => result.status !== 'ok' || !result.record,
    )
    if (failed) {
      return yield* err(
        toError(new Error(`bigname lookup returned ${failed.status}`)),
      )
    }
    records = [
      ...records,
      ...response.data.flatMap((result) => result.record ?? []),
    ]
  }
  return ok(records)
})
