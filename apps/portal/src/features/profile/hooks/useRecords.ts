import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsErrorType,
  type GetRecordsParameters,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

/**
 * Fetches ENS records for a given name.
 */
export const getRecords = ResultFn(async function* (
  params: GetRecordsParameters,
) {
  const client = yield* safeGetClient()

  const records = yield* fromPromise(
    ensjs_getRecords(client, params),
    (e) => new RecordsError({ cause: e as GetRecordsErrorType }),
  )

  return ok(records)
})
