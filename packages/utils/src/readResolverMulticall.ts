import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import {
  type Address,
  type Client,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  parseAbi,
} from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'

const multicallAbi = parseAbi([
  'function multicall(bytes[] data) returns (bytes[] results)',
])
const resolveAbi = parseAbi([
  'function resolve(bytes name,bytes data) view returns (bytes)',
])
// A provider may put hex-encoded calldata in a GET URL. Leave room for the
// resolve(name, data) envelope as well as the gateway's own URL prefix.
const MAX_BATCH_BYTES = 2048

/** Group calls without exceeding a gateway-friendly encoded multicall size. */
export const splitResolverCalls = <T>(
  calls: readonly T[],
  getData: (call: T) => Hex,
): T[][] => {
  const batches: T[][] = []
  for (const call of calls) {
    const current = batches.at(-1)
    const data = encodeFunctionData({
      abi: multicallAbi,
      functionName: 'multicall',
      args: [[...(current ?? []), call].map(getData)],
    })
    if (current && (data.length - 2) / 2 <= MAX_BATCH_BYTES) current.push(call)
    else batches.push([call])
  }
  return batches
}

/** Read record calls directly through ENSIP-10 in bounded, sequential batches. */
export const readResolverMulticall = async (
  client: Client,
  {
    name,
    resolver,
    data,
    blockNumber,
  }: {
    readonly name: string
    readonly resolver: Address
    readonly data: readonly Hex[]
    readonly blockNumber?: bigint
  },
): Promise<Hex[]> => {
  const encode = (calls: readonly Hex[]) =>
    encodeFunctionData({
      abi: multicallAbi,
      functionName: 'multicall',
      args: [calls],
    })
  const batches = splitResolverCalls(data, (call) => call)
  const read = getAction(client, readContract, 'readContract')
  const results: Hex[] = []
  for (const batch of batches) {
    const response = await read({
      address: resolver,
      abi: resolveAbi,
      functionName: 'resolve',
      args: [dnsEncodeName(name), encode(batch)],
      blockNumber,
    })
    const values = decodeFunctionResult({
      abi: multicallAbi,
      functionName: 'multicall',
      data: response,
    })
    if (values.length !== batch.length)
      throw new Error(
        'Resolver multicall returned an unexpected number of records',
      )
    results.push(...values)
  }
  return results
}
