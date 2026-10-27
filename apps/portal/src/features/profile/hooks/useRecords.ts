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
  decodeAbiParameters,
  decodeErrorResult,
  type Hex,
  HttpRequestError,
  parseAbi,
  slice,
  type Transport,
  toFunctionSelector,
  zeroAddress,
} from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { isContractRevert } from '@/utils/errors/isContractRevert'

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

const isEmptyBytes = (data: Hex) =>
  decodeAbiParameters([{ type: 'bytes' }], data)[0] === '0x'

// What an unset record decodes to, by the record call's selector.
const isUnsetRecord: Readonly<Record<Hex, (data: Hex) => boolean>> = {
  [toFunctionSelector('text(bytes32,string)')]: (data) =>
    decodeAbiParameters([{ type: 'string' }], data)[0] === '',
  [toFunctionSelector('addr(bytes32)')]: (data) =>
    decodeAbiParameters([{ type: 'address' }], data)[0] === zeroAddress,
  [toFunctionSelector('addr(bytes32,uint256)')]: isEmptyBytes,
  [toFunctionSelector('contenthash(bytes32)')]: isEmptyBytes,
  [toFunctionSelector('ABI(bytes32,uint256)')]: (data) =>
    decodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }], data)[0] ===
    0n,
}

const decodesAsUnset = fromThrowable(
  (call: Hex, returnData: Hex) =>
    isUnsetRecord[slice(call, 0, 4)]?.(returnData) ?? false,
)

// An unset record does not show that the name has any records.
const hasValue = (
  call: Hex | undefined,
  { success, returnData }: RecordResult,
) => success && !!call && !decodesAsUnset(call, returnData).unwrapOr(true)

// A gateway error that left no records must not read as an empty profile, but
// one that failed only some keys still leaves a viewable profile.
const checkGatewayErrors = (
  calls: readonly Hex[],
  items: readonly RecordResult[],
) => {
  if (items.some((item, index) => hasValue(calls[index], item))) return
  for (const item of items) checkGatewayError(item.returnData)
}

const toRecordResults = (
  calls: readonly Hex[],
  values: readonly Hex[],
): RecordResult[] => {
  const results = values.map((returnData) => ({
    success: returnData !== '0x' && (returnData.length - 2) % 64 === 0,
    returnData,
  }))
  checkGatewayErrors(calls, results)
  return results
}

// A rejected batch (Namespace answers an oversized GET with a 500) can still
// resolve record by record; an overloaded or unreachable gateway cannot.
const isGatewayUnavailable = (error: unknown): boolean => {
  let cause = error
  for (let depth = 0; depth < 10 && cause; depth += 1) {
    const failure = cause as { name?: string; status?: number }
    if (
      failure.name === 'HttpRequestError' &&
      (!failure.status || failure.status === 429 || failure.status === 503)
    )
      return true
    cause = (cause as { cause?: unknown }).cause
  }
  return false
}

type RecordReadClient = Client<Transport, EnsChain>

const getBatchResolver = async (
  client: RecordReadClient,
  parameters: ResolveNameDataParameters<Hex | Hex[]>,
) => {
  if (typeof parameters.data === 'string' || parameters.gatewayUrls) return null
  // A name with no resolver (an unimported DNS name) reverts here; the
  // UniversalResolver path below already reports it as unresolved.
  const resolver = await getResolver(client, {
    name: parameters.name,
    blockNumber: parameters.blockNumber,
  }).catch((error: unknown) => {
    if (isContractRevert(error)) return null
    throw error
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
        resolvedData: toRecordResults(parameters.data, values),
      }
    } catch (error) {
      // Unsupported calls and rejected batches use the UniversalResolver
      // fallback; per-record requests would only deepen an overload.
      if (isGatewayUnavailable(error)) throw error
    }
  }
  const result = await resolveNameData(client, parameters)
  if (
    result &&
    typeof result.resolvedData !== 'string' &&
    typeof parameters.data !== 'string'
  )
    checkGatewayErrors(parameters.data, result.resolvedData)
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
