import type { EnsChain } from '@ens-apps/config'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { readResolverMulticall } from '@ens-apps/utils/readResolverMulticall'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsErrorType,
  type GetRecordsParameters,
  getResolver,
  getSupportedInterfaces,
  type ResolveNameDataParameters,
  resolveNameData,
} from '@ensdomains/ensjs/public'
import { fromPromise, fromThrowable, ok } from 'neverthrow'
import {
  type Client,
  decodeErrorResult,
  type Hex,
  HttpRequestError,
  parseAbi,
  type Transport,
  toFunctionSelector,
} from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

const gatewayErrorAbi = parseAbi([
  'error HttpError(uint16 status,string message)',
  'error ResolverError(bytes errorData)',
])
const decodeGatewayError = fromThrowable((data: Hex) =>
  decodeErrorResult({ abi: gatewayErrorAbi, data }),
)

const checkGatewayError = (data: Hex) => {
  // ENSv2's legacy adapter can wrap a gateway error in ResolverError.
  for (let depth = 0; depth < 10; depth += 1) {
    const error = decodeGatewayError(data).unwrapOr(null)
    if (!error) return
    if (error.errorName === 'ResolverError') {
      data = error.args[0]
      continue
    }
    const [status, message] = error.args
    if (status === 429 || status >= 500) {
      throw new HttpRequestError({
        status,
        details: message,
        url: 'CCIP gateway',
      })
    }
    return
  }
}

type RecordResult = { readonly success: boolean; readonly returnData: Hex }

// A gateway error that left no records must not read as an empty profile, but
// one that failed only some keys still leaves a viewable profile.
const checkGatewayErrors = (items: readonly RecordResult[]) => {
  if (items.some((item) => item.success)) return
  for (const item of items) checkGatewayError(item.returnData)
}

const toRecordResults = (values: readonly Hex[]): RecordResult[] => {
  const results = values.map((returnData) => ({
    success: returnData !== '0x' && (returnData.length - 2) % 64 === 0,
    returnData,
  }))
  checkGatewayErrors(results)
  return results
}

// A rejected batch (Namespace answers an oversized GET with a 500) can still
// resolve record by record; an overloaded or unreachable gateway cannot.
const isGatewayUnavailable = (error: unknown): boolean => {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
    const failure = cause as { name?: string; status?: number }
    if (
      failure.name === 'HttpRequestError' &&
      (!failure.status || failure.status === 429 || failure.status === 503)
    )
      return true
  }
  return false
}

type RecordReadClient = Client<Transport, EnsChain>

const getBatchResolver = async (
  client: RecordReadClient,
  parameters: ResolveNameDataParameters<Hex | Hex[]>,
) => {
  if (typeof parameters.data === 'string' || parameters.gatewayUrls) return null
  const resolver = await getResolver(client, {
    name: parameters.name,
    blockNumber: parameters.blockNumber,
  })
  if (!resolver) return null
  const [hasExtendedResolution, hasNameSetters] = await getSupportedInterfaces(
    client,
    {
      address: resolver,
      interfaces: [
        '0x9061b923',
        toFunctionSelector('setAddress(bytes,uint256,bytes)'),
      ],
      blockNumber: parameters.blockNumber,
    },
  )
  return hasExtendedResolution && !hasNameSetters ? resolver : null
}

const resolveRecordData = async (
  client: RecordReadClient,
  parameters: ResolveNameDataParameters<Hex | Hex[]>,
) => {
  const resolver = await getBatchResolver(client, parameters)
  if (resolver && typeof parameters.data !== 'string') {
    try {
      const values = await readResolverMulticall(client, {
        name: parameters.name,
        resolver,
        data: parameters.data,
        blockNumber: parameters.blockNumber,
      })
      return {
        resolverAddress: resolver,
        resolvedData: toRecordResults(values),
      }
    } catch (error) {
      // Unsupported calls and rejected batches use the UniversalResolver
      // fallback; per-record requests would only deepen an overload.
      if (isGatewayUnavailable(error)) throw error
    }
  }
  const result = await resolveNameData(client, parameters)
  if (result && typeof result.resolvedData !== 'string')
    checkGatewayErrors(result.resolvedData)
  return result
}

/**
 * Fetches ENS records for a given name.
 */
export const getRecords = ResultFn(async function* (
  params: GetRecordsParameters,
) {
  const client = yield* safeGetClient()

  const guardedClient = {
    ...client,
    // ENSjs otherwise filters failed record calls out and reports an empty
    // success. Preserve transient gateway errors so they cannot become a 404.
    resolveNameData: (parameters: ResolveNameDataParameters<Hex | Hex[]>) =>
      resolveRecordData(client, parameters),
  }

  const records = yield* fromPromise(
    ensjs_getRecords(guardedClient, params),
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
