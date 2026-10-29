import type {
  GetRecordsParameters,
  GetRecordsReturnType,
} from '@ensdomains/ensjs/public'
import {
  decodeAbiResult,
  decodeAddressResult,
  decodeContentHashResult,
  decodeTextResult,
  getAbiParameters,
  getAddressParameters,
  getContentHashParameters,
  getTextParameters,
} from '@ensdomains/ensjs/utils'
import {
  type Address,
  type Client,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  parseAbi,
  toHex,
} from 'viem'
import { getEnsResolver, readContract } from 'viem/actions'
import { packetToBytes } from 'viem/ens'

const OFFCHAIN_LOOKUP_SELECTOR = '0x556f1830'

const resolveAbi = parseAbi([
  'function resolve(bytes name, bytes data) view returns (bytes)',
  'function multicall(bytes[] data) returns (bytes[] results)',
])

type RecordCall =
  | { readonly kind: 'text'; readonly key: string; readonly data: Hex }
  | {
      readonly kind: 'coin'
      readonly coin: string | number
      readonly data: Hex
    }
  | { readonly kind: 'contentHash'; readonly data: Hex }
  | { readonly kind: 'abi'; readonly data: Hex }

const findRevertData = (error: unknown): Hex | undefined => {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
    const data = (cause as { data?: unknown }).data
    const hex =
      typeof data === 'object' ? (data as { data?: unknown })?.data : data
    if (typeof hex === 'string' && hex.startsWith('0x')) return hex as Hex
  }
  return undefined
}

/** A revert from the resolver's answer, not a gateway that failed to answer. */
export const hasContractRevert = (error: unknown): boolean => {
  const data = findRevertData(error)
  return data !== undefined && !data.startsWith(OFFCHAIN_LOOKUP_SELECTOR)
}

/** Whether a read failed because the resolver asked for a CCIP-Read lookup. */
export const isOffchainLookupError = (error: unknown): boolean =>
  findRevertData(error)?.startsWith(OFFCHAIN_LOOKUP_SELECTOR) ?? false

export const getRecordCalls = ({
  name,
  texts,
  coins,
  contentHash,
  abi,
  ignoreInvalidCoinTypes,
}: GetRecordsParameters): readonly RecordCall[] => [
  ...(texts ?? []).map((key) => ({
    kind: 'text' as const,
    key,
    data: encodeFunctionData(getTextParameters({ name, key })),
  })),
  ...(coins ?? []).map((coin) => ({
    kind: 'coin' as const,
    coin,
    data: encodeFunctionData(
      getAddressParameters({ name, coin, ignoreInvalidCoinTypes }),
    ),
  })),
  ...(contentHash
    ? [
        {
          kind: 'contentHash' as const,
          data: encodeFunctionData(getContentHashParameters({ name })),
        },
      ]
    : []),
  ...(abi
    ? [
        {
          kind: 'abi' as const,
          data: encodeFunctionData(getAbiParameters({ name })),
        },
      ]
    : []),
]

const decodeOrNull = <T>(decode: () => T): T | null => {
  try {
    return decode()
  } catch {
    return null
  }
}

/** Records in ensjs `getRecords` shape from one result per call; `0x` is unset. */
export const decodeRecordResults = async (params: {
  readonly calls: readonly RecordCall[]
  readonly results: readonly Hex[]
  readonly resolverAddress: Address
  readonly request: GetRecordsParameters
}): Promise<GetRecordsReturnType> => {
  const { calls, results, resolverAddress, request } = params
  const at = (index: number) => {
    const data = results[index]
    return data && data !== '0x' ? data : undefined
  }
  const texts = calls.flatMap((call, index) => {
    const data = at(index)
    if (call.kind !== 'text' || !data) return []
    const value = decodeOrNull(() => decodeTextResult(data, { strict: false }))
    return value ? [{ key: call.key, value }] : []
  })
  const coins = calls.flatMap((call, index) => {
    const data = at(index)
    if (call.kind !== 'coin' || !data) return []
    const coin = decodeOrNull(() =>
      decodeAddressResult(data, { coin: call.coin, strict: false }),
    )
    return coin ? [coin] : []
  })
  const contentHashIndex = calls.findIndex(
    (call) => call.kind === 'contentHash',
  )
  const contentHashData = at(contentHashIndex)
  const abiIndex = calls.findIndex((call) => call.kind === 'abi')
  const abiData = at(abiIndex)
  const abi = abiData
    ? await decodeAbiResult(abiData, { strict: false }).catch(() => null)
    : null
  return {
    ...(request.texts ? { texts } : {}),
    ...(request.coins ? { coins } : {}),
    ...(request.contentHash
      ? {
          contentHash: contentHashData
            ? decodeOrNull(() =>
                decodeContentHashResult(contentHashData, { strict: false }),
              )
            : null,
        }
      : {}),
    ...(request.abi ? { abi } : {}),
    resolverAddress,
  } as GetRecordsReturnType
}

/**
 * Reads an offchain name's records in one gateway request. The
 * UniversalResolver asks the gateway once per record when a resolver does not
 * report multicall support, which gateways rate-limit.
 */
export const readOffchainRecords = async (
  client: Client,
  request: GetRecordsParameters,
): Promise<GetRecordsReturnType> => {
  const resolverAddress = await getEnsResolver(client, { name: request.name })
  const calls = getRecordCalls(request)
  const response = await readContract(client, {
    address: resolverAddress,
    abi: resolveAbi,
    functionName: 'resolve',
    args: [
      toHex(packetToBytes(request.name)),
      encodeFunctionData({
        abi: resolveAbi,
        functionName: 'multicall',
        args: [calls.map(({ data }) => data)],
      }),
    ],
  })
  const results = decodeFunctionResult({
    abi: resolveAbi,
    functionName: 'multicall',
    data: response,
  })
  return decodeRecordResults({ calls, results, resolverAddress, request })
}
