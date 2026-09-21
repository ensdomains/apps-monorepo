/**
 * Resolver record writes, encoded for the resolver they target.
 *
 * Two setter families are live on Sepolia, and each reverts on the other's
 * selectors:
 *  - name-based (`setAddress(bytes name, …)`): the V2 PermissionedResolver;
 *  - node-based (`setAddr(bytes32 node, …)`): the V1 PublicResolver, custom V1
 *    resolvers that migration keeps, and PublicResolverV2, which migration
 *    writes as the default resolver despite its name.
 *
 * So the encoding follows the resolver, and the write-access probe must use the
 * same encoding as the write it gates.
 */

import { getSupportedInterfaces } from '@ensdomains/ensjs/public'
import { resolverMulticallParameters as nodeSetterCalls } from '@ensdomains/ensjs/utils'
import {
  dnsEncodeName,
  resolverMulticallParameters as nameSetterCalls,
} from '@ensdomains/ensjs/utils/v2'
import { permissionedResolverLinkToRecordSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  type Address,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  toFunctionSelector,
} from 'viem'

export type ResolverSetterKind = 'name' | 'node'

/**
 * ERC-165 id of `IAddressSetter` (a single-function interface). Only resolvers
 * with the name-based setters report it; node-based ones report `addr` instead.
 */
const NAME_SETTER_INTERFACE_ID = toFunctionSelector(
  'setAddress(bytes,uint256,bytes)',
)

/** Both families expose the same `multicall(bytes[])`. */
const multicallAbi = parseAbi([
  'function multicall(bytes[] data) returns (bytes[] results)',
])

/** Record changes, in ensjs form, minus the name. */
export type ResolverRecords = Omit<
  Parameters<typeof nodeSetterCalls>[0],
  'name'
>

/**
 * Which setter family a resolver implements. A resolver that does not answer
 * ERC-165 is treated as node-based (the legacy shape); an RPC failure throws.
 */
export async function getResolverSetterKind(
  publicClient: PublicClient,
  resolverAddress: Address,
): Promise<ResolverSetterKind> {
  const [supportsNameSetters] = await getSupportedInterfaces(
    publicClient as unknown as Parameters<typeof getSupportedInterfaces>[0],
    { address: resolverAddress, interfaces: [NAME_SETTER_INTERFACE_ID] },
  )
  return supportsNameSetters ? 'name' : 'node'
}

const encodeCalls = (calls: readonly unknown[]): Hex[] =>
  calls.map((call) =>
    encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]),
  )

async function nameRecordCalls(
  name: string,
  { clearRecords, ...records }: ResolverRecords,
): Promise<Hex[]> {
  const setters = encodeCalls(await nameSetterCalls({ name, ...records }))
  if (!clearRecords) return setters
  // The name-based resolver has no `clearRecords`. Unlinking the name drops it
  // to the resolver's default record, and the setters that follow in the same
  // multicall allocate it a fresh one, which is the same clean slate.
  return [
    encodeFunctionData({
      abi: permissionedResolverLinkToRecordSnippet,
      functionName: 'linkToRecord',
      args: [dnsEncodeName(name), 0n],
    }),
    ...setters,
  ]
}

/**
 * Encode a record update as the calldata for ONE resolver call: the lone setter
 * when there is only one, otherwise a `multicall`.
 *
 * @throws Error if `records` produces no calls
 */
export async function encodeResolverRecordsCall(params: {
  readonly kind: ResolverSetterKind
  readonly name: string
  readonly records: ResolverRecords
}): Promise<Hex> {
  const { kind, name, records } = params
  const calls =
    kind === 'name'
      ? await nameRecordCalls(name, records)
      : encodeCalls(await nodeSetterCalls({ name, ...records }))

  const [firstCall] = calls
  if (!firstCall) throw new Error('No resolver record changes to apply')
  if (calls.length === 1) return firstCall

  return encodeFunctionData({
    abi: multicallAbi,
    functionName: 'multicall',
    args: [calls],
  })
}
