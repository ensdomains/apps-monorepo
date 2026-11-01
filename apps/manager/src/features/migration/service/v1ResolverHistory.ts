import { err, ok, Result } from 'neverthrow'
import { match } from 'ts-pattern'
import * as v from 'valibot'
import {
  type Address,
  decodeEventLog,
  encodeAbiParameters,
  type Hex,
  keccak256,
  parseAbi,
  toBytes,
  toEventSelector,
} from 'viem'
import { UnsupportedResolverRecordsError } from './fetchV1Profiles.helpers'
import type { V1ProfileKeys, V1ProfileSource } from './v1ProfileKeys'

export const RESOLVER_HISTORY_ABI = parseAbi([
  'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key)',
  'event TextChanged(bytes32 indexed node, string indexed indexedKey, string key, string value)',
  'event AddrChanged(bytes32 indexed node, address a)',
  'event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)',
  'event ABIChanged(bytes32 indexed node, uint256 indexed contentType)',
  'event ContenthashChanged(bytes32 indexed node, bytes hash)',
  'event InterfaceChanged(bytes32 indexed node, bytes4 indexed interfaceID, address implementer)',
  'event NameChanged(bytes32 indexed node, string name)',
  'event DNSRecordChanged(bytes32 indexed node, bytes name, uint16 resource, bytes record)',
  'event DNSRecordDeleted(bytes32 indexed node, bytes name, uint16 resource)',
  'event DNSZoneCleared(bytes32 indexed node)',
  'event DNSZonehashChanged(bytes32 indexed node, bytes lastzonehash, bytes zonehash)',
])

export const RESOLVER_HISTORY_TOPICS = RESOLVER_HISTORY_ABI.map(toEventSelector)
const UNINDEXED_TEXT_CHANGED_ABI = parseAbi([
  'event TextChanged(bytes32 indexed node, string indexedKey, string key)',
])
const UNINDEXED_TEXT_CHANGED_TOPIC = toEventSelector(
  UNINDEXED_TEXT_CHANGED_ABI[0],
)
const NODES_PER_REQUEST = 200
const BLOCKS_PER_REQUEST = 1_000_000n

// First blocks with code, verified with eth_getCode on both sides of each
// deployment. Other resolvers and networks are scanned from genesis.
const MAINNET_RESOLVER_STARTS: Readonly<Record<string, bigint>> = {
  '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41': 9_412_610n,
  '0x231b0ee14048e9dccd1d247744d114a4eb5e8e63': 16_925_619n,
  '0xf29100983e058b709f3d539b0c765937b804ac15': 22_764_828n,
}

export type ResolverHistoryRequest = {
  readonly resolver: Address
  readonly sources: readonly V1ProfileSource[]
  readonly fromBlock: bigint
  readonly toBlock: bigint
}

export type ResolverHistoryRecord = {
  readonly resolver: Address
  readonly node: Hex
} & (
  | { readonly kind: 'text'; readonly key: string }
  | { readonly kind: 'address'; readonly coinType: bigint }
  | { readonly kind: 'abi'; readonly contentType: bigint }
  | { readonly kind: 'contenthash' }
  | { readonly kind: 'interface'; readonly interfaceId: Hex }
  | { readonly kind: 'name' }
)

const parseTextHistoryRecord = ({
  record,
  indexedKey,
  data,
  isUnindexedText,
}: {
  readonly record: Extract<ResolverHistoryRecord, { kind: 'text' }>
  readonly indexedKey: string
  readonly data: Hex
  readonly isUnindexedText: boolean
}): Result<ResolverHistoryRecord, Error> => {
  if (isUnindexedText) {
    if (
      encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }],
        [indexedKey, record.key],
      ).toLowerCase() !== data.toLowerCase()
    )
      return err(new Error('Malformed unindexed resolver text history'))
    if (record.key !== indexedKey)
      return err(new Error('Resolver text history keys do not match'))
  } else if (keccak256(toBytes(record.key)) !== indexedKey) {
    return err(
      new Error('Resolver text history key does not match its indexed hash'),
    )
  }
  return ok(record)
}

export const planResolverHistory = ({
  sources,
  chainId,
  toBlock,
}: {
  readonly sources: readonly V1ProfileSource[]
  readonly chainId: number
  readonly toBlock: bigint
}): readonly ResolverHistoryRequest[] =>
  [...new Set(sources.map(({ resolver }) => resolver.toLowerCase()))].flatMap(
    (resolver) => {
      const group = sources.filter(
        (source) => source.resolver.toLowerCase() === resolver,
      )
      const start =
        chainId === 1 ? (MAINNET_RESOLVER_STARTS[resolver] ?? 0n) : 0n
      const windows = Array.from(
        { length: Number((toBlock - start) / BLOCKS_PER_REQUEST + 1n) },
        (_, index) => start + BigInt(index) * BLOCKS_PER_REQUEST,
      )
      return Array.from(
        { length: Math.ceil(group.length / NODES_PER_REQUEST) },
        (_, index) =>
          group.slice(
            index * NODES_PER_REQUEST,
            (index + 1) * NODES_PER_REQUEST,
          ),
      ).flatMap((batch) =>
        windows.flatMap((fromBlock) => {
          const first = batch[0]
          if (!first || fromBlock > toBlock) return []
          const end = fromBlock + BLOCKS_PER_REQUEST - 1n
          return [
            {
              resolver: first.resolver,
              sources: batch,
              fromBlock,
              toBlock: end < toBlock ? end : toBlock,
            },
          ]
        }),
      )
    },
  )

const isHex = (value: unknown): value is Hex =>
  typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})*$/.test(value)
const hexSchema = v.custom<Hex>(isHex)
const hashSchema = v.pipe(hexSchema, v.length(66))
const quantitySchema = v.pipe(
  v.string(),
  v.regex(/^0x[0-9a-fA-F]+$/),
  v.transform((value: string) => BigInt(value)),
)
const logSchema = v.object({
  address: v.custom<Address>(
    (value) => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value),
  ),
  topics: v.tupleWithRest([hashSchema], hashSchema),
  data: hexSchema,
  blockNumber: quantitySchema,
  blockHash: hashSchema,
  transactionHash: hashSchema,
  logIndex: quantitySchema,
  removed: v.literal(false),
})

/** Validate and correlate every returned log; a failed read never means empty history. */
export const parseResolverHistory = (
  response: unknown,
  request: ResolverHistoryRequest,
): Result<readonly ResolverHistoryRecord[], Error> => {
  const parsed = v.safeParse(v.array(logSchema), response)
  if (!parsed.success) return err(new Error('Malformed resolver history logs'))
  return parsed.output.reduce<Result<readonly ResolverHistoryRecord[], Error>>(
    (result, log) =>
      result.andThen((records) => {
        const source = request.sources.find(
          ({ id }) => id.toLowerCase() === log.topics[1]?.toLowerCase(),
        )
        if (
          !source ||
          log.address.toLowerCase() !== request.resolver.toLowerCase() ||
          log.blockNumber < request.fromBlock ||
          log.blockNumber > request.toBlock
        ) {
          return err(
            new Error(
              'Resolver history returned a log outside the requested source or block range',
            ),
          )
        }
        // Indexing is absent from the event signature, so older deployments
        // share the topic while storing both copies of the key in data.
        const isUnindexedText =
          log.topics[0].toLowerCase() === UNINDEXED_TEXT_CHANGED_TOPIC &&
          log.topics.length === 2
        return Result.fromThrowable(
          () =>
            decodeEventLog({
              abi: isUnindexedText
                ? UNINDEXED_TEXT_CHANGED_ABI
                : RESOLVER_HISTORY_ABI,
              topics: log.topics,
              data: log.data,
              strict: true,
            }),
          (cause) => new Error('Unable to decode resolver history', { cause }),
        )().andThen((event) => {
          // Any DNS history, including deletion and zone clearing, blocks copying:
          // these events cannot prove that every DNS record has been removed.
          if (event.eventName.startsWith('DNS'))
            return err(
              new UnsupportedResolverRecordsError({
                ensName: source.name,
                recordType: 'dns',
              }),
            )
          const base = { resolver: log.address, node: event.args.node }
          return match(event)
            .with({ eventName: 'TextChanged' }, ({ args }) =>
              parseTextHistoryRecord({
                record: { ...base, kind: 'text', key: args.key },
                indexedKey: args.indexedKey,
                data: log.data,
                isUnindexedText,
              }),
            )
            .with({ eventName: 'AddrChanged' }, () =>
              ok<ResolverHistoryRecord>({
                ...base,
                kind: 'address',
                coinType: 60n,
              }),
            )
            .with({ eventName: 'AddressChanged' }, ({ args }) =>
              ok<ResolverHistoryRecord>({
                ...base,
                kind: 'address',
                coinType: args.coinType,
              }),
            )
            .with({ eventName: 'ABIChanged' }, ({ args }) =>
              // Pre-0.8 resolvers allowed zero; the live zero-mask getter is empty.
              (args.contentType & (args.contentType - 1n)) === 0n
                ? ok<ResolverHistoryRecord>({
                    ...base,
                    kind: 'abi',
                    contentType: args.contentType,
                  })
                : err(
                    new Error(
                      'Resolver ABI history contains an invalid content type',
                    ),
                  ),
            )
            .with({ eventName: 'ContenthashChanged' }, () =>
              ok<ResolverHistoryRecord>({ ...base, kind: 'contenthash' }),
            )
            .with({ eventName: 'InterfaceChanged' }, ({ args }) =>
              ok<ResolverHistoryRecord>({
                ...base,
                kind: 'interface',
                interfaceId: args.interfaceID,
              }),
            )
            .with({ eventName: 'NameChanged' }, () =>
              ok<ResolverHistoryRecord>({ ...base, kind: 'name' }),
            )
            .otherwise(() =>
              err(new Error('Unsupported resolver history event')),
            )
            .map((record) => [...records, record])
        })
      }),
    ok([]),
  )
}

export const supplementalKeysForSource = (
  source: V1ProfileSource,
  records: readonly ResolverHistoryRecord[],
) => {
  const matching = records.filter(
    ({ node, resolver }) =>
      node.toLowerCase() === source.id.toLowerCase() &&
      resolver.toLowerCase() === source.resolver.toLowerCase(),
  )
  return {
    interfaceIds: [
      ...new Set(
        matching.flatMap((record) =>
          record.kind === 'interface' ? [record.interfaceId] : [],
        ),
      ),
    ],
    hasName: matching.some(({ kind }) => kind === 'name'),
  }
}

/** History discovers keys, including cleared ones; current contract reads supply values. */
export const profileKeysForSource = (
  source: V1ProfileSource,
  records: readonly ResolverHistoryRecord[],
): V1ProfileKeys => {
  const matching = records.filter(
    ({ node, resolver }) =>
      node.toLowerCase() === source.id.toLowerCase() &&
      resolver.toLowerCase() === source.resolver.toLowerCase(),
  )
  const supplemental = supplementalKeysForSource(source, matching)
  return {
    id: source.id.toLowerCase(),
    texts: [
      ...new Set(
        matching.flatMap((record) =>
          record.kind === 'text' ? [record.key] : [],
        ),
      ),
    ].sort(),
    coinTypes: [
      ...new Set(
        matching.flatMap((record) =>
          record.kind === 'address' ? [record.coinType] : [],
        ),
      ),
    ].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
    hasContentHash: matching.some(({ kind }) => kind === 'contenthash'),
    abiContentTypes: [
      ...new Set(
        matching.flatMap((record) =>
          record.kind === 'abi' ? [record.contentType] : [],
        ),
      ),
    ],
    interfaceIds: supplemental.interfaceIds,
    ...(supplemental.hasName && { hasName: true }),
  }
}
