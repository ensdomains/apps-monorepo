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

import {
  getSupportedInterfaces,
  resolveNameData,
} from '@ensdomains/ensjs/public'
import {
  getAddressParameters,
  resolverMulticallParameters as nodeSetterCalls,
} from '@ensdomains/ensjs/utils'
import {
  dnsEncodeName,
  resolverMulticallParameters as nameSetterCalls,
} from '@ensdomains/ensjs/utils/v2'
import {
  permissionedResolverLinkToRecordSnippet,
  permissionedResolverResolveSnippet,
  permissionedResolverSetDataSnippet,
  permissionedResolverSetInterfaceSnippet,
} from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  type Address,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  encodeFunctionData,
  type Hex,
  type PublicClient,
  parseAbi,
  type Transport,
  toFunctionSelector,
} from 'viem'
import { call } from 'viem/actions'
import type { sepoliaWithEns } from '@/lib/wagmi'

export type ResolverSetterKind = 'name' | 'node'

/** Records preserved by resolver replacement, outside the editable profile fields. */
export type SupplementalResolverRecords = {
  readonly interfaces?: readonly {
    readonly interfaceId: Hex
    readonly implementer: Address
  }[]
  readonly data?: readonly { readonly key: string; readonly value: Hex }[]
}

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

const EXTENDED_RESOLVER_INTERFACE_ID = '0x9061b923'

const OFFCHAIN_LOOKUP_SELECTOR = '0x556f1830'

const findRevertData = (error: unknown): Hex | undefined => {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause) {
    const data = (cause as { data?: unknown }).data
    const hex =
      typeof data === 'object' ? (data as { data?: unknown })?.data : data
    if (typeof hex === 'string' && hex.startsWith('0x')) return hex as Hex
  }
  return undefined
}

/** Whether resolving `name` asks for a CCIP-Read lookup; the gateway is not called. */
export async function isOffchainResolver(
  publicClient: PublicClient,
  resolverAddress: Address,
  name: string,
): Promise<boolean> {
  const [isExtended] = await getSupportedInterfaces(
    publicClient as unknown as Parameters<typeof getSupportedInterfaces>[0],
    { address: resolverAddress, interfaces: [EXTENDED_RESOLVER_INTERFACE_ID] },
  )
  if (!isExtended) return false
  try {
    await call(
      { ...publicClient, ccipRead: false },
      {
        to: resolverAddress,
        data: encodeFunctionData({
          abi: permissionedResolverResolveSnippet,
          functionName: 'resolve',
          args: [
            dnsEncodeName(name),
            encodeFunctionData(getAddressParameters({ name, coin: 60 })),
          ],
        }),
      },
    )
    return false
  } catch (error) {
    const data = findRevertData(error)
    if (data === undefined) throw error
    return data.startsWith(OFFCHAIN_LOOKUP_SELECTOR)
  }
}

/** Whether the UniversalResolver resolves `name` through CCIP-Read; the gateway is not called. */
export async function isOffchainName(
  client: Client<Transport, typeof sepoliaWithEns>,
  name: string,
): Promise<boolean> {
  try {
    await resolveNameData(
      { ...client, ccipRead: false },
      {
        name,
        data: encodeFunctionData(getAddressParameters({ name, coin: 60 })),
      },
    )
    return false
  } catch (error) {
    const revert =
      error instanceof BaseError
        ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
        : null
    if (!(revert instanceof ContractFunctionRevertedError)) throw error
    return revert.signature === OFFCHAIN_LOOKUP_SELECTOR
  }
}

const encodeCalls = (calls: readonly unknown[]): Hex[] =>
  calls.map((call) =>
    encodeFunctionData(call as Parameters<typeof encodeFunctionData>[0]),
  )

async function nameRecordCalls(
  name: string,
  { clearRecords, ...records }: ResolverRecords,
  supplemental: SupplementalResolverRecords,
): Promise<Hex[]> {
  const setters = [
    ...encodeCalls(await nameSetterCalls({ name, ...records })),
    ...(supplemental.interfaces ?? []).map(({ interfaceId, implementer }) =>
      encodeFunctionData({
        abi: permissionedResolverSetInterfaceSnippet,
        functionName: 'setInterface',
        args: [dnsEncodeName(name), interfaceId, implementer],
      }),
    ),
    ...(supplemental.data ?? []).map(({ key, value }) =>
      encodeFunctionData({
        abi: permissionedResolverSetDataSnippet,
        functionName: 'setData',
        args: [dnsEncodeName(name), key, value],
      }),
    ),
  ]
  if (!clearRecords) return setters
  // Unlink alone reads the resolver's default record. Allocate a fresh empty
  // record even for an empty reviewed draft so unrelated defaults cannot leak.
  const freshSetters = setters.length
    ? setters
    : encodeCalls(
        await nameSetterCalls({
          name,
          texts: [{ key: 'description', value: '' }],
        }),
      )
  // The name-based resolver has no `clearRecords`. Unlinking the name drops it
  // to the resolver's default record, and the setters that follow in the same
  // multicall allocate it a fresh one, which is the same clean slate.
  return [
    encodeFunctionData({
      abi: permissionedResolverLinkToRecordSnippet,
      functionName: 'linkToRecord',
      args: [dnsEncodeName(name), 0n],
    }),
    ...freshSetters,
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
  readonly supplemental?: SupplementalResolverRecords
}): Promise<Hex> {
  const { kind, name, records, supplemental = {} } = params
  if (
    kind !== 'name' &&
    (supplemental.interfaces?.length || supplemental.data?.length)
  )
    throw new Error(
      'The target resolver cannot preserve interface and data records.',
    )
  const calls =
    kind === 'name'
      ? await nameRecordCalls(name, records, supplemental)
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
