import type { BignameError } from '@ens-apps/indexer/bigname'
import {
  type BignameClient,
  isStale,
  type LookupRecord,
  type LookupResponse,
  type LookupResult,
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

/** The one `ok` record answering each input, or the first input without one. */
const recordsInOrder = (
  batch: readonly string[],
  results: readonly LookupResult[],
): Result<LookupRecord[], string> => {
  const records: LookupRecord[] = []
  for (const [index, name] of batch.entries()) {
    const answers = results.filter(
      ({ input }) => 'name' in input && input.id === String(index),
    )
    const record = answers[0]?.status === 'ok' ? answers[0].record : undefined
    if (answers.length !== 1 || !record)
      return err(`${name}: ${answers[0]?.status ?? 'no answer'}`)
    records.push(record)
  }
  return ok(records)
}

/** Detail records for every name, in order; a missing, repeated or failed answer fails the read rather than leaving a gap. */
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
      (signal) =>
        lookup(
          {
            namespace: 'ens',
            profile: 'detail',
            inputs: batch.map((name, index) => ({ id: String(index), name })),
          },
          { signal },
        ),
      isStale,
      { signal: options.signal },
    ).mapErr(toError)
    const batchRecords = yield* recordsInOrder(batch, response.data).mapErr(
      (failure) => toError(new Error(`bigname lookup failed for ${failure}`)),
    )
    records = [...records, ...batchRecords]
  }
  return ok(records)
})
