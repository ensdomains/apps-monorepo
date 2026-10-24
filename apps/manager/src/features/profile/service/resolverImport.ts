import { isKnownPublicResolver } from '@ens-apps/migration'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
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
  type PublicClient,
  parseAbi,
  toHex,
  zeroAddress,
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
import { getResolverSetterKind } from './resolverRecordCalls'
import { canWriteEthAddressRecord } from './resolverWriteAccess'
import { canSetNameResolver } from './setResolverAccess'

const factoryAbi = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])

const isContractRevert = (error: unknown) =>
  error instanceof BaseError &&
  Boolean(error.walk((cause) => cause instanceof ExecutionRevertedError))

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
): Promise<Partial<ProfileRecordsResult>> => {
  if (key.startsWith('text:')) {
    const value = decodeTextResult(data, { strict: true })
    return { texts: value ? [{ key: key.slice(5), value }] : [] }
  }
  if (key.startsWith('addr:'))
    return decodeImportedCoin(Number(key.slice(5)), data)
  if (key === 'contenthash') {
    const value = decodeContentHashResult(data, { strict: true })
    if (!value) return {}
    return {
      contentHash: value.protocolType
        ? `${value.protocolType}://${value.decoded}`
        : value.decoded,
    }
  }
  const value = await decodeAbiResult(data, { strict: true })
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
  publicClient: client,
}: {
  readonly name: string
  readonly resolver: Address
  readonly texts: readonly string[]
  readonly coins: readonly number[]
  readonly publicClient: PublicClient
}): Promise<{
  records: ProfileRecordsResult
  failedKeys: string[]
  readErrors: unknown[]
}> => {
  const kind = await getResolverSetterKind(client, resolver)
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
  ]
  const read = async (
    request: RecordRead,
  ): Promise<
    Partial<ProfileRecordsResult> & {
      failedKeys: string[]
      readErrors: unknown[]
    }
  > => {
    try {
      const response =
        kind === 'name'
          ? await client.readContract({
              address: resolver,
              abi: permissionedResolverResolveSnippet,
              functionName: 'resolve',
              args: [dnsEncodeName(name), request.data],
            })
          : (await client.call({ to: resolver, data: request.data })).data
      // Legacy resolvers may return no data for record types they do not support.
      if (!response || response === '0x')
        return { failedKeys: [request.key], readErrors: [] }
      return {
        ...(await decodeRecordRead(request, response)),
        failedKeys: [],
        readErrors: [],
      }
    } catch (error) {
      return {
        failedKeys: [request.key],
        readErrors: isContractRevert(error) ? [] : [error],
      }
    }
  }
  // Bound RPC concurrency without losing successful reads to a failed batch.
  const readChunks = Array.from(
    { length: Math.ceil(reads.length / 8) },
    (_, index) => reads.slice(index * 8, (index + 1) * 8),
  )
  const results = await readChunks.reduce(
    async (pending, chunk) => [
      ...(await pending),
      ...(await Promise.all(chunk.map(read))),
    ],
    Promise.resolve([] as Awaited<ReturnType<typeof read>>[]),
  )
  return {
    records: {
      texts: results.flatMap((record) => record.texts ?? []),
      coins: results.flatMap((record) => record.coins ?? []),
      contentHash: results.find((record) => record.contentHash)?.contentHash,
      abi: results.find((record) => record.abi)?.abi,
      resolverAddress: resolver,
    },
    failedKeys: results.flatMap((record) => record.failedKeys),
    readErrors: results.flatMap((record) => record.readErrors),
  }
}

export type ResolverImport = {
  readonly source: ResolverCopySource
  readonly records: ProfileRecordsResult
  readonly warnings: readonly string[]
}

export const importResolverRecords = async (
  name: string,
  source: ResolverCopySource,
): Promise<ResolverImport> => {
  if (source.kind !== 'copy')
    throw new Error('Initial resolver setup has no source records to import.')
  const warnings = [
    'Only discovered and commonly used records can be imported. Review the recovered records and add any missing records before replacing the resolver.',
  ]
  const inventory = await bigname.nameRecords(name, {
    namespace: 'ens',
    include: ['inventory'],
  })
  const indexedKeys = inventory.isOk()
    ? inventory.value.data.inventory?.known_keys
    : undefined
  if (!indexedKeys)
    warnings.push(
      'The record index is unavailable or incomplete. Custom records may be missing from this import.',
    )
  const texts = [
    ...new Set([
      ...staticTextRecords,
      ...textRecords.map((record) => record.key),
      ...forceFetchRecords.always,
      ...forceFetchRecords.whenNotIndexed,
      'links',
      ...(indexedKeys ?? [])
        .filter((key) => key.startsWith('text:'))
        .map((key) => key.slice(5)),
    ]),
  ]
  const allCoins = [
    ...new Set([
      ...alwaysProbeAddressRecords.map(Number),
      ...addressRecords.map((record) => record.coinType),
      ...(indexedKeys ?? [])
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
  if (coins.length !== allCoins.length)
    warnings.push(
      'Some indexed address formats are not supported and could not be imported.',
    )
  const { records, failedKeys } = await readResolverRecords({
    name,
    resolver: source.resolver,
    texts,
    coins,
    publicClient: publicClient as PublicClient,
  })
  if (failedKeys.length)
    warnings.push(
      `Some records could not be read: ${failedKeys.join(', ')}. Their values have not been copied.`,
    )
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
  return { source, records, warnings }
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
    normalizedAbi(records.abi) === normalizedAbi(expected.abi)
  if (failedKeys.length || !matches)
    throw new Error(
      'The replacement records could not be verified. Your source resolver is still active. Review the draft and retry.',
    )
}
