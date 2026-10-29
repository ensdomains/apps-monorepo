import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsErrorType,
  type GetRecordsParameters,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { type Client, createClient, custom, type Transport } from 'viem'
import type { ensChain } from '@/lib/wagmi'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  hasContractRevert,
  isOffchainLookupError,
  readOffchainRecords,
} from './offchainRecords'

class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

type RecordsClient = Client<Transport, typeof ensChain>

// Onchain names resolve in this first call. An offchain one reverts with
// OffchainLookup instead of fanning out one gateway request per record.
// Spreading `ccipRead: false` onto the client keeps its bound actions, which
// still follow the lookup, so this is a separate client on the same transport.
const readRecords = async (
  client: RecordsClient,
  params: GetRecordsParameters,
) => {
  const onchainOnly = createClient({
    chain: client.chain,
    transport: custom({ request: client.request }),
    ccipRead: false,
  })
  try {
    return await ensjs_getRecords(onchainOnly, params)
  } catch (error) {
    if (!isOffchainLookupError(error)) throw error
  }
  try {
    return await readOffchainRecords(client, params)
  } catch (error) {
    // A resolver without multicall support reverts; HTTP failures propagate.
    if (!hasContractRevert(error)) throw error
    return ensjs_getRecords(client, params)
  }
}

/**
 * Fetches ENS records for a given name.
 */
export const getRecords = ResultFn(async function* (
  params: GetRecordsParameters,
) {
  const client = yield* safeGetClient()

  const records = yield* fromPromise(
    readRecords(client, params),
    (e) => new RecordsError({ cause: e as GetRecordsErrorType }),
  )

  return ok(records)
})

// Query key factory
const recordsQueryKey = createQueryKey<'records', GetRecordsParameters>(
  'records',
)

// React Query options for fetching records
export const getRecordsQueryOptions = (params: GetRecordsParameters) =>
  resultQueryOptions({
    queryKey: recordsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRecords(params),
  })
