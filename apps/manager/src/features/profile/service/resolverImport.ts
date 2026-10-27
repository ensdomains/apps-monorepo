import { readAllCollectionPages } from '@ens-apps/indexer/bigname'
import { isKnownPublicResolver } from '@ens-apps/migration'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { getSupportedInterfaces } from '@ensdomains/ensjs/public'
import {
  decodeAbiResult,
  decodeContentHashResult,
  decodeTextResult,
  encodeContentHash,
  getAbiParameters,
  getAddressParameters,
  getCoderFromCoin,
  getContentHashParameters,
  getTextParameters,
} from '@ensdomains/ensjs/utils'
import { dnsEncodeName } from '@ensdomains/ensjs/utils/v2'
import {
  publicResolverMultiAddrSnippet,
  publicResolverSingleAddrSnippet,
} from '@ensdomains/ensjs-abi/v1/publicResolver'
import { permissionedResolverResolveSnippet } from '@ensdomains/ensjs-abi/v2/permissionedResolver'
import {
  type Address,
  BaseError,
  decodeFunctionResult,
  ExecutionRevertedError,
  encodeFunctionData,
  type Hex,
  isAddressEqual,
  namehash,
  type PublicClient,
  parseAbi,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { envConfig } from '@/config'
import { V2_CONTRACTS } from '@/features/migration/contracts/addresses'
import { bigname } from '@/lib/bigname'
import { publicClient } from '@/lib/wagmi'
import {
  addressRecords,
  alwaysProbeAddressRecords,
  forceFetchRecords,
  staticTextRecords,
  textRecords,
} from '../data/records'
import {
  hasV2NameEntry,
  type NameRegistryLocation,
  readNameResolver,
  resolveNameRegistry,
} from './changeResolver'
import { decodeCoinResult } from './decodeCoinRecord'
import type { ProfileRecordsResult } from './profileRecords'
import type { ServiceRecordSnapshot } from './profileRecordTransactions'
import {
  getResolverSetterKind,
  type SupplementalResolverRecords,
} from './resolverRecordCalls'
import { canWriteEthAddressRecord } from './resolverWriteAccess'
import { canSetNameResolver } from './setResolverAccess'

const factoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])

const isContractRevert = (error: unknown) =>
  error instanceof BaseError &&
  Boolean(error.walk((cause) => cause instanceof ExecutionRevertedError))

export const isRateLimited = (error: unknown): boolean => {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause)
    if ((cause as { status?: unknown }).status === 429) return true
  return false
}

// A rejected request (400, 414, a 500 for an oversized URL) can still succeed
// in smaller reads; an overloaded or unreachable gateway cannot.
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

// viem wraps a failed CCIP-Read gateway call in this; an RPC failure is not.
const isOffchainLookupFailure = (error: unknown): boolean => {
  for (let cause = error; cause; cause = (cause as { cause?: unknown }).cause)
    if ((cause as { name?: string }).name === 'OffchainLookupError') return true
  return false
}

// Viewing keeps the records a struggling CCIP gateway did return, and fails
// only when none came back. Imports and RPC failures stay strict.
const viewableReadErrors = (
  results: readonly {
    readonly failedKeys: readonly string[]
    readonly readErrors: readonly unknown[]
  }[],
  shouldDecodeStrictly: boolean,
): unknown[] => {
  const readErrors = results.flatMap((record) => record.readErrors)
  const hasReadRecord = results.some((record) => !record.failedKeys.length)
  return shouldDecodeStrictly || !hasReadRecord
    ? readErrors
    : readErrors.filter((error) => !isOffchainLookupFailure(error))
}

// Calldata doubles in size when hex-encoded in a provider's GET URL, with
// further overhead for resolve(name, data). Stay comfortably below URL limits.
const MAX_RESOLVER_BATCH_BYTES = 2048

const isRecognizedV2Resolver = async (
  resolver: Address,
  client: PublicClient,
): Promise<boolean> => {
  if (isAddressEqual(resolver, V2_CONTRACTS.DefaultResolver)) return true
  try {
    const implementation = await client.readContract({
      address: V2_CONTRACTS.VerifiableFactory,
      abi: factoryAbi,
      functionName: 'verifyContract',
      args: [resolver],
    })
    return isAddressEqual(implementation, V2_CONTRACTS.PermissionedResolverImpl)
  } catch (error) {
    if (!isContractRevert(error)) throw error
    return false
  }
}

export type ResolverCopySource = {
  readonly kind: 'copy' | 'setup'
  readonly resolver: Address
  readonly location: NameRegistryLocation
  readonly wallet: Address
  readonly chainId: number
}

export const getResolverEditSource = async (
  name: string,
  wallet: Address,
): Promise<ResolverCopySource | null> => {
  const client = publicClient as PublicClient
  const location = await resolveNameRegistry(name, client)
  const resolver = await readNameResolver(location, client)
  if (isAddressEqual(resolver, zeroAddress)) {
    if (
      !(await hasV2NameEntry(location, client)) ||
      !(await canSetNameResolver({
        location,
        resolver,
        ownerAddress: wallet,
        publicClient: client,
      }))
    )
      return null
    return {
      kind: 'setup',
      resolver,
      location,
      wallet,
      chainId: envConfig.chain.id,
    }
  }
  const isLegacy = isKnownPublicResolver(resolver, envConfig.chain.id)
  const isRecognized =
    isLegacy || (await isRecognizedV2Resolver(resolver, client))
  const code = isRecognized
    ? await client.getCode({ address: resolver })
    : undefined
  if (!code || code === '0x') return null
  if (
    !(await canSetNameResolver({
      location,
      resolver,
      ownerAddress: wallet,
      publicClient: client,
    }))
  )
    return null
  if (!isLegacy && (await canWriteEthAddressRecord(resolver, name, wallet)))
    return null
  return {
    kind: 'copy',
    resolver,
    location,
    wallet,
    chainId: envConfig.chain.id,
  }
}

export const getResolverCopySource = async (
  name: string,
  wallet: Address,
): Promise<ResolverCopySource | null> => {
  const source = await getResolverEditSource(name, wallet)
  return source?.kind === 'copy' ? source : null
}

export const resolverCopySourceQuery = (name: string, wallet?: Address) => ({
  queryKey: qk('profile', 'resolver_copy_source', { name, wallet }),
  queryFn: () => (wallet ? getResolverEditSource(name, wallet) : null),
  staleTime: 0,
  retry: false,
})

type RecordRead = { readonly key: string; readonly data: Hex }

const supplementalAbi = parseAbi([
  'function pubkey(bytes32 node) view returns (bytes32 x, bytes32 y)',
  'function interfaceImplementer(bytes32 node, bytes4 interfaceId) view returns (address)',
  'function data(bytes32 node, string key) view returns (bytes)',
])
const multicallAbi = parseAbi([
  'function multicall(bytes[] data) returns (bytes[] results)',
])
const supportsInterfaceAbi = parseAbi([
  'function supportsInterface(bytes4) view returns (bool)',
])

export type ImportedResolverRecords = ProfileRecordsResult &
  SupplementalResolverRecords & {
    readonly pubkey?: { readonly x: Hex; readonly y: Hex }
  }

const decodeImportedCoin = (
  coinType: number,
  data: Hex,
): Partial<ProfileRecordsResult> => {
  const coin = decodeCoinResult(coinType, data)
  if (coin) return { coins: [coin] }
  const raw = decodeFunctionResult({
    abi:
      coinType === 60
        ? publicResolverSingleAddrSnippet
        : publicResolverMultiAddrSnippet,
    functionName: 'addr',
    data,
  })
  if (raw !== '0x' && !/^0x0+$/.test(raw))
    throw new Error('Invalid nonempty address record')
  return { coins: [] }
}

const decodeRecordRead = async (
  { key }: RecordRead,
  data: Hex,
  shouldDecodeStrictly: boolean,
): Promise<Partial<ImportedResolverRecords>> => {
  if (key === 'pubkey') {
    const [x, y] = decodeFunctionResult({
      abi: supplementalAbi,
      functionName: 'pubkey',
      data,
    })
    return x === zeroHash && y === zeroHash ? {} : { pubkey: { x, y } }
  }
  if (key.startsWith('interface:')) {
    const implementer = decodeFunctionResult({
      abi: supplementalAbi,
      functionName: 'interfaceImplementer',
      data,
    })
    return isAddressEqual(implementer, zeroAddress)
      ? {}
      : { interfaces: [{ interfaceId: key.slice(10) as Hex, implementer }] }
  }
  if (key.startsWith('data:')) {
    const value = decodeFunctionResult({
      abi: supplementalAbi,
      functionName: 'data',
      data,
    })
    return value === '0x' ? {} : { data: [{ key: key.slice(5), value }] }
  }
  if (key.startsWith('text:')) {
    const value = decodeTextResult(data, { strict: shouldDecodeStrictly })
    return { texts: value ? [{ key: key.slice(5), value }] : [] }
  }
  if (key.startsWith('addr:')) {
    const coinType = Number(key.slice(5))
    if (shouldDecodeStrictly) return decodeImportedCoin(coinType, data)
    const coin = decodeCoinResult(coinType, data)
    return { coins: coin ? [coin] : [] }
  }
  if (key === 'contenthash') {
    const value = decodeContentHashResult(data, {
      strict: shouldDecodeStrictly,
    })
    if (!value) return {}
    return {
      contentHash: value.protocolType
        ? `${value.protocolType}://${value.decoded}`
        : value.decoded,
    }
  }
  const value = await decodeAbiResult(data, { strict: shouldDecodeStrictly })
  return value
    ? {
        abi:
          typeof value.abi === 'string' ? value.abi : JSON.stringify(value.abi),
      }
    : {}
}

/** Explicit resolver reads also use viem's CCIP-read support when required. */
export const readResolverRecords = async ({
  name,
  resolver,
  texts,
  coins,
  interfaceIds = [],
  dataKeys = [],
  shouldReadPubkey = false,
  shouldDecodeStrictly = true,
  publicClient: client,
}: {
  readonly name: string
  readonly resolver: Address
  readonly texts: readonly string[]
  readonly coins: readonly number[]
  readonly interfaceIds?: readonly Hex[]
  readonly dataKeys?: readonly string[]
  readonly shouldReadPubkey?: boolean
  /** Viewing skips malformed values; imports and replacement verification remain strict. */
  readonly shouldDecodeStrictly?: boolean
  readonly publicClient: PublicClient
}): Promise<{
  records: ImportedResolverRecords
  failedKeys: string[]
  unsupportedKeys: string[]
  readErrors: unknown[]
}> => {
  const [kind, [hasExtendedResolution]] = await Promise.all([
    getResolverSetterKind(client, resolver),
    getSupportedInterfaces(
      client as unknown as Parameters<typeof getSupportedInterfaces>[0],
      { address: resolver, interfaces: ['0x9061b923'] },
    ),
  ])
  const reads: RecordRead[] = [
    ...texts.map((key) => ({
      key: `text:${key}`,
      data: encodeFunctionData(getTextParameters({ name, key })),
    })),
    ...coins.map((coin) => ({
      key: `addr:${coin}`,
      data: encodeFunctionData(getAddressParameters({ name, coin })),
    })),
    {
      key: 'contenthash',
      data: encodeFunctionData(getContentHashParameters({ name })),
    },
    { key: 'ABI', data: encodeFunctionData(getAbiParameters({ name })) },
    ...interfaceIds.map((id) => ({
      key: `interface:${id}`,
      data: encodeFunctionData({
        abi: supplementalAbi,
        functionName: 'interfaceImplementer',
        args: [namehash(name), id],
      }),
    })),
    ...dataKeys.map((key) => ({
      key: `data:${key}`,
      data: encodeFunctionData({
        abi: supplementalAbi,
        functionName: 'data',
        args: [namehash(name), key],
      }),
    })),
    ...(shouldReadPubkey && kind === 'node'
      ? [
          {
            key: 'pubkey',
            data: encodeFunctionData({
              abi: supplementalAbi,
              functionName: 'pubkey',
              args: [namehash(name)],
            }),
          },
        ]
      : []),
  ]
  // A provider can embed the calldata in a GET URL. One large multicall
  // exceeds URL limits and used to fall back to one request per record.
  // Keep batches small enough for those gateways and submit them in order.
  const batchReads: RecordRead[][] = []
  for (const request of reads) {
    const current = batchReads.at(-1)
    const candidate = [...(current ?? []), request]
    const data = encodeFunctionData({
      abi: multicallAbi,
      functionName: 'multicall',
      args: [candidate.map(({ data }) => data)],
    })
    if (current && (data.length - 2) / 2 <= MAX_RESOLVER_BATCH_BYTES)
      current.push(request)
    else batchReads.push([request])
  }
  const readBatch = async (chunk: readonly RecordRead[]) =>
    decodeFunctionResult({
      abi: multicallAbi,
      functionName: 'multicall',
      data: await client.readContract({
        address: resolver,
        abi: permissionedResolverResolveSnippet,
        functionName: 'resolve',
        args: [
          dnsEncodeName(name),
          encodeFunctionData({
            abi: multicallAbi,
            functionName: 'multicall',
            args: [chunk.map(({ data }) => data)],
          }),
        ],
      }),
    })
  const readOne = async (data: Hex) =>
    kind === 'name' || hasExtendedResolution
      ? await client.readContract({
          address: resolver,
          abi: permissionedResolverResolveSnippet,
          functionName: 'resolve',
          args: [dnsEncodeName(name), data],
        })
      : (await client.call({ to: resolver, data })).data
  const read = async (
    request: RecordRead,
    batched?: Hex,
  ): Promise<
    Partial<ImportedResolverRecords> & {
      failedKeys: string[]
      unsupportedKeys: string[]
      readErrors: unknown[]
    }
  > => {
    let isDecoding = false
    try {
      const response = batched ?? (await readOne(request.data))
      // Legacy resolvers may return no data for record types they do not support.
      if (!response || response === '0x')
        return {
          failedKeys: [request.key],
          unsupportedKeys: [request.key],
          readErrors: [],
        }
      isDecoding = true
      return {
        ...(await decodeRecordRead(request, response, shouldDecodeStrictly)),
        failedKeys: [],
        unsupportedKeys: [],
        readErrors: [],
      }
    } catch (error) {
      return {
        failedKeys: [request.key],
        unsupportedKeys: isContractRevert(error) ? [request.key] : [],
        readErrors:
          isContractRevert(error) || (isDecoding && !shouldDecodeStrictly)
            ? []
            : [error],
      }
    }
  }
  // Batches run in order; a rejected batch falls back to single reads for its
  // own records only, so one oversized request does not discard the rest.
  const canBatch = hasExtendedResolution && kind === 'node'
  const results: Awaited<ReturnType<typeof read>>[] = []
  for (const chunk of batchReads) {
    const batched = canBatch
      ? await readBatch(chunk).catch((error: unknown) => {
          // Single reads would only deepen an overload or outage.
          if (isGatewayUnavailable(error)) throw error
          return null
        })
      : null
    results.push(
      ...(await Promise.all(
        chunk.map((request, index) =>
          read(
            request,
            batched?.length === chunk.length ? batched[index] : undefined,
          ),
        ),
      )),
    )
  }
  return {
    records: {
      texts: results.flatMap((record) => record.texts ?? []),
      coins: results.flatMap((record) => record.coins ?? []),
      contentHash: results.find((record) => record.contentHash)?.contentHash,
      abi: results.find((record) => record.abi)?.abi,
      resolverAddress: resolver,
      ...(interfaceIds.length
        ? { interfaces: results.flatMap((record) => record.interfaces ?? []) }
        : {}),
      ...(dataKeys.length
        ? { data: results.flatMap((record) => record.data ?? []) }
        : {}),
      ...(results.some((record) => record.pubkey)
        ? { pubkey: results.find((record) => record.pubkey)?.pubkey }
        : {}),
    },
    failedKeys: results.flatMap((record) => record.failedKeys),
    unsupportedKeys: results.flatMap((record) => record.unsupportedKeys),
    readErrors: viewableReadErrors(results, shouldDecodeStrictly),
  }
}

export type ResolverImport = {
  readonly source: ResolverCopySource
  readonly records: ImportedResolverRecords
  readonly warnings: readonly string[]
  readonly blockedKeys: readonly string[]
}

export const importResolverRecords = async (
  name: string,
  source: ResolverCopySource,
): Promise<ResolverImport> => {
  if (source.kind !== 'copy')
    throw new Error('Initial resolver setup has no source records to import.')
  const warnings = [
    'Source records are shown for reference. Only records you edit will be saved to the replacement resolver.',
  ]
  const blockedKeys: string[] = []
  const inventory = await bigname.nameRecords(name, {
    namespace: 'ens',
    include: ['inventory'],
  })
  const indexedKeys = inventory.isOk()
    ? inventory.value.data.inventory
      ? [
          ...inventory.value.data.inventory.known_keys,
          ...inventory.value.data.inventory.unset_keys,
        ]
      : undefined
    : undefined
  // Interface and data keys are recorded in resolver events, not every inventory.
  // Use the same paginated event source as migration replay, including cleared keys.
  const events = await readAllCollectionPages((cursor, signal) =>
    bigname.events(
      {
        name,
        resolver: `${envConfig.chain.id}:${source.resolver.toLowerCase()}`,
        type: ['record'],
        include: ['data'],
        page_size: 200,
        ...(cursor !== undefined && { cursor }),
      },
      { signal },
    ),
  )
  const eventKeys = events.isOk()
    ? events.value.flatMap((row) =>
        row.type === 'record' && row.data?.key ? [row.data.key] : [],
      )
    : []
  if (!indexedKeys || events.isErr()) {
    blockedKeys.push('record inventory')
    warnings.push(
      'The record inventory could not be loaded. Retry before replacing the resolver.',
    )
  }
  const keys = [...new Set([...(indexedKeys ?? []), ...eventKeys])]
  const interfaceKeys = keys.filter((key) => key.startsWith('interface:'))
  const interfaceIds = interfaceKeys
    .filter((key) => /^interface:0x[0-9a-fA-F]{8}$/.test(key))
    .map((key) => key.slice(10) as Hex)
  blockedKeys.push(
    ...interfaceKeys.filter((key) => !/^interface:0x[0-9a-fA-F]{8}$/.test(key)),
  )
  const dataKeys = keys
    .filter((key) => key.startsWith('data:'))
    .map((key) => key.slice(5))
  let shouldReadPubkey = false
  if (
    (await getResolverSetterKind(
      publicClient as PublicClient,
      source.resolver,
    )) === 'node'
  ) {
    try {
      shouldReadPubkey = await publicClient.readContract({
        address: source.resolver,
        abi: supportsInterfaceAbi,
        functionName: 'supportsInterface',
        args: ['0xc8690233'],
      })
    } catch {
      blockedKeys.push('pubkey')
      warnings.push(
        'Pubkey support could not be checked. Retry before replacing the resolver.',
      )
    }
  }
  const texts = [
    ...new Set([
      ...staticTextRecords,
      ...textRecords.map((record) => record.key),
      ...forceFetchRecords.always,
      ...forceFetchRecords.whenNotIndexed,
      'links',
      ...keys
        .filter((key) => key.startsWith('text:'))
        .map((key) => key.slice(5)),
    ]),
  ]
  const allCoins = [
    ...new Set([
      ...alwaysProbeAddressRecords.map(Number),
      ...addressRecords.map((record) => record.coinType),
      ...keys
        .filter((key) => key.startsWith('addr:'))
        .map((key) => Number(key.slice(5))),
    ]),
  ]
  const coins = allCoins.filter((coin) => {
    try {
      getCoderFromCoin(coin)
      return Number.isSafeInteger(coin)
    } catch {
      return false
    }
  })
  if (coins.length !== allCoins.length) {
    blockedKeys.push(
      ...allCoins
        .filter((coin) => !coins.includes(coin))
        .map((coin) => `addr:${coin}`),
    )
    warnings.push(
      'Some indexed address formats are not supported and could not be imported.',
    )
  }
  const { records, failedKeys, unsupportedKeys } = await readResolverRecords({
    name,
    resolver: source.resolver,
    texts,
    coins,
    interfaceIds,
    dataKeys,
    shouldReadPubkey,
    publicClient: publicClient as PublicClient,
  })
  const requiredKeys = new Set([
    ...keys.map((key) => (key.toLowerCase() === 'abi' ? 'ABI' : key)),
    ...(inventory.isOk() &&
    inventory.value.data.inventory?.abi_content_types?.length
      ? ['ABI']
      : []),
    ...(shouldReadPubkey ? ['pubkey'] : []),
  ])
  const failures = failedKeys.filter(
    (key) => requiredKeys.has(key) || !unsupportedKeys.includes(key),
  )
  blockedKeys.push(...failures)
  if (failures.length)
    warnings.push(
      `Some records could not be read: ${failures.join(', ')}. Retry before replacing the resolver.`,
    )
  if (records.pubkey) {
    blockedKeys.push('pubkey')
    warnings.push(
      'The source has a pubkey record. PermissionedResolver cannot store pubkeys, so this resolver cannot be replaced without losing that record.',
    )
  }
  const currentLocation = await resolveNameRegistry(name)
  const currentResolver = await readNameResolver(
    currentLocation,
    publicClient as PublicClient,
  )
  if (
    !isAddressEqual(
      currentLocation.registryAddress,
      source.location.registryAddress,
    ) ||
    !isAddressEqual(currentResolver, source.resolver)
  )
    throw new Error(
      'The source resolver changed. Open the editor again to import the current records.',
    )
  return { source, records, warnings, blockedKeys: [...new Set(blockedKeys)] }
}

export const verifyResolverRecords = async (
  name: string,
  resolver: Address,
  expected: ServiceRecordSnapshot,
  client: PublicClient,
): Promise<void> => {
  const { records, failedKeys } = await readResolverRecords({
    name,
    resolver,
    texts: expected.texts.map((record) => record.key),
    coins: expected.coins.map((record) => record.coinType),
    interfaceIds: expected.interfaces?.map((record) => record.interfaceId),
    dataKeys: expected.data?.map((record) => record.key),
    publicClient: client,
  })
  const normalizedAbi = (value?: string) =>
    value?.trim() ? JSON.stringify(JSON.parse(value)) : ''
  const normalizedContentHash = (value?: string) =>
    value?.trim() ? encodeContentHash(value.trim()) : '0x'
  const matches =
    expected.texts.every(
      (record) =>
        (records.texts.find((value) => value.key === record.key)?.value ??
          '') === record.value,
    ) &&
    expected.coins.every((record) => {
      const actual =
        records.coins.find((value) => value.coinType === record.coinType)
          ?.value ?? ''
      if (!actual || !record.value.trim()) return actual === record.value.trim()
      const coder = getCoderFromCoin(record.coinType)
      return (
        toHex(coder.decode(actual)) === toHex(coder.decode(record.value.trim()))
      )
    }) &&
    normalizedContentHash(records.contentHash) ===
      normalizedContentHash(expected.contentHash) &&
    normalizedAbi(records.abi) === normalizedAbi(expected.abi) &&
    (expected.interfaces ?? []).every(({ interfaceId, implementer }) => {
      const actual = records.interfaces?.find(
        (record) =>
          record.interfaceId.toLowerCase() === interfaceId.toLowerCase(),
      )?.implementer
      return actual !== undefined && isAddressEqual(actual, implementer)
    }) &&
    (expected.data ?? []).every(
      ({ key, value }) =>
        records.data
          ?.find((record) => record.key === key)
          ?.value.toLowerCase() === value.toLowerCase(),
    )
  if (failedKeys.length || !matches)
    throw new Error(
      'The replacement records could not be verified. Your source resolver is still active. Review the draft and retry.',
    )
}
