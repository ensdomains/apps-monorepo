import type { BignameError } from '@ens-apps/indexer/bigname'
import {
  type BignameClient,
  isStale,
  type LookupRecord,
  type LookupResponse,
  retryStale,
} from '@ens-apps/indexer/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { err, ok, type Result } from 'neverthrow'

const LOOKUP_BATCH_SIZE = 250

export class BignameLookupError extends TaggedError('BignameLookupError')<{
  cause: BignameError | Error
}> {}

export type LookupOptions = {
  readonly signal?: AbortSignal
}

export const checkNotAborted = <E>(
  signal: AbortSignal | undefined,
  toError: (cause: Error) => E,
): Result<void, E> => {
  if (!signal?.aborted) return ok()
  const reason: unknown = signal.reason
  return err(
    toError(reason instanceof Error ? reason : new Error(String(reason))),
  )
}

const toError = (cause: BignameError | Error) =>
  new BignameLookupError({ cause })

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
    const response: LookupResponse = yield* retryStale(
      () =>
        lookup({
          namespace: 'ens',
          profile: 'detail',
          inputs: batch.map((name) => ({ name })),
        }),
      isStale,
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
