import { bytesToPacket } from '@ensdomains/ensjs/utils'
import { Result } from 'neverthrow'
import { match, P } from 'ts-pattern'
import * as v from 'valibot'
import {
  type Address,
  BaseError,
  concat,
  type Hex,
  HttpRequestError,
  hexToBytes,
  keccak256,
  labelhash,
  namehash,
  parseAbi,
  RpcError,
  RpcRequestError,
  TimeoutError,
  toEventSelector,
} from 'viem'
import { normalize } from 'viem/ens'

export const NEW_OWNER_ABI = parseAbi([
  'event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)',
])
const MAX_INVENTORY_NODES = 100_000

export const getSubnameInventoryLimit = (params: {
  readonly phase: 'nodes' | 'history'
  readonly count: number
}): 'node-limit' | 'history-limit' | null => {
  const limit =
    params.phase === 'nodes' ? MAX_INVENTORY_NODES : MAX_INVENTORY_NODES * 10
  if (params.count <= limit) return null
  return params.phase === 'nodes' ? 'node-limit' : 'history-limit'
}

export type SubnameLogRequest = {
  readonly registries: readonly [Address, ...Address[]]
  readonly parentNodes: readonly Hex[]
  readonly fromBlock: bigint
  readonly toBlock: bigint
}
export type RpcSubnameEdge = {
  readonly node: Hex
  readonly parentNode: Hex
  readonly labelhash: Hex
}

export const planSubnameLogReads = (params: {
  readonly registries: readonly {
    readonly address: Address
    readonly fromBlock: bigint
  }[]
  readonly parentNodes: readonly Hex[]
  readonly toBlock: bigint
  readonly blockRange: bigint
  readonly nodeBatchSize: number
}): readonly SubnameLogRequest[] => {
  const nodes = [...new Set(params.parentNodes)]
  const registryGroups = params.registries.filter(
    ({ fromBlock }, index, sources) =>
      sources.findIndex((source) => source.fromBlock === fromBlock) === index,
  )
  return registryGroups.flatMap(({ address, fromBlock }) =>
    Array.from(
      { length: Math.ceil(nodes.length / params.nodeBatchSize) },
      (_, batch) =>
        nodes.slice(
          batch * params.nodeBatchSize,
          (batch + 1) * params.nodeBatchSize,
        ),
    ).flatMap((parentNodes) =>
      Array.from(
        {
          length:
            fromBlock > params.toBlock
              ? 0
              : Number((params.toBlock - fromBlock) / params.blockRange + 1n),
        },
        (_, index) => {
          const start = fromBlock + BigInt(index) * params.blockRange
          const end = start + params.blockRange - 1n
          return {
            registries: [
              address,
              ...new Set(
                params.registries
                  .filter(
                    (source) =>
                      source.fromBlock === fromBlock &&
                      source.address.toLowerCase() !== address.toLowerCase(),
                  )
                  .map((source) => source.address),
              ),
            ] as const,
            parentNodes,
            fromBlock: start,
            toBlock: end < params.toBlock ? end : params.toBlock,
          }
        },
      ),
    ),
  )
}

const HASH_SCHEMA = v.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value),
)
const QUANTITY_SCHEMA = v.pipe(
  v.string(),
  v.regex(/^0x[0-9a-f]+$/i),
  v.transform((value) => BigInt(value)),
)
const LOG_SCHEMA = v.object({
  address: v.pipe(v.string(), v.regex(/^0x[0-9a-f]{40}$/i)),
  blockNumber: QUANTITY_SCHEMA,
  blockHash: HASH_SCHEMA,
  transactionHash: HASH_SCHEMA,
  logIndex: QUANTITY_SCHEMA,
  removed: v.literal(false),
  topics: v.tuple([HASH_SCHEMA, HASH_SCHEMA, HASH_SCHEMA]),
  data: v.pipe(v.string(), v.regex(/^0x0{24}[0-9a-f]{40}$/i)),
})
export const NEW_OWNER_TOPIC = toEventSelector(NEW_OWNER_ABI[0])

const rpcFailureMessages = (cause: unknown, depth = 0): readonly string[] => {
  if (depth > 8 || typeof cause !== 'object' || cause === null) return []
  const message =
    'message' in cause && typeof cause.message === 'string'
      ? [cause.message]
      : []
  const details =
    'details' in cause && typeof cause.details === 'string'
      ? [cause.details]
      : []
  return [
    ...message,
    ...details,
    ...('cause' in cause ? rpcFailureMessages(cause.cause, depth + 1) : []),
  ]
}

export const hasSubnameLogRangeLimit = (cause: unknown): boolean =>
  rpcFailureMessages(cause).some((message) =>
    /block range|too many results|query returned more than|response.{0,30}(too large|size limit)|maximum.{0,20}results/i.test(
      message,
    ),
  )

/** Retry transport outages, never invalid evidence or a contract rejection. */
export const shouldRetrySubnameInventoryRead = (cause: unknown): boolean => {
  if (!(cause instanceof BaseError) || hasSubnameLogRangeLimit(cause))
    return false
  if (
    rpcFailureMessages(cause).some((message) =>
      /execution reverted|EVM error/i.test(message),
    )
  )
    return false
  const error = cause.walk(
    (error) =>
      error instanceof TimeoutError ||
      error instanceof HttpRequestError ||
      error instanceof RpcError ||
      error instanceof RpcRequestError,
  )
  return match(error)
    .with(P.instanceOf(TimeoutError), () => true)
    .with(
      P.instanceOf(HttpRequestError),
      ({ status }) =>
        status === undefined ||
        [403, 408, 429, 500, 502, 503, 504].includes(status),
    )
    .with(
      P.union(P.instanceOf(RpcError), P.instanceOf(RpcRequestError)),
      (error) =>
        [-1, -32603, -32002, -32005, -32007, 429].includes(error.code) ||
        // An archive-limited fallback can mask the primary's timeout.
        // A new attempt starts at the attributed primary again.
        (error.code === -32602 &&
          rpcFailureMessages(error).some((message) =>
            /archive requests require a personal token/i.test(message),
          )),
    )
    .otherwise(() => false)
}

/** The original mainnet registry's pre-REVERT compiler traps on a missing selector; geth and reth word it differently. */
export const isMissingRegistryFallbackGetter = (params: {
  readonly chainId: number
  readonly address: Address
  readonly cause: unknown
}): boolean =>
  rpcFailureMessages(params.cause).some(
    (message) =>
      /execution reverted(?:: (?:0x|0x0))?(?:\s|$|[.])/i.test(message) ||
      (params.chainId === 1 &&
        params.address.toLowerCase() ===
          '0x314159265dd8dbb310642f98f50c066173c1259b' &&
        /EVM error:?\s*InvalidJump|invalid jump destination/i.test(message)),
  )

/** Historical assignments establish identities, never current ownership or liveness. */
export const parseSubnameLogs = (
  logs: unknown,
  request: SubnameLogRequest,
):
  | { readonly status: 'ok'; readonly edges: readonly RpcSubnameEdge[] }
  | { readonly status: 'invalid'; readonly reason: string } => {
  const parsed = v.safeParse(v.array(LOG_SCHEMA), logs)
  if (!parsed.success)
    return { status: 'invalid', reason: 'Malformed or removed registry log' }
  const parents = new Set(request.parentNodes.map((node) => node.toLowerCase()))
  const registries = new Set(
    request.registries.map((address) => address.toLowerCase()),
  )
  if (
    parsed.output.some(
      (log) =>
        !registries.has(log.address.toLowerCase()) ||
        log.topics[0].toLowerCase() !== NEW_OWNER_TOPIC ||
        !parents.has(log.topics[1].toLowerCase()) ||
        log.blockNumber < request.fromBlock ||
        log.blockNumber > request.toBlock,
    )
  )
    return {
      status: 'invalid',
      reason: 'Registry log does not belong to the requested range or parent',
    }
  const identities = parsed.output.map(
    (log) => `${log.blockHash.toLowerCase()}:${log.logIndex}`,
  )
  if (new Set(identities).size !== identities.length)
    return { status: 'invalid', reason: 'Duplicate registry log identity' }
  const edges = parsed.output.map(({ topics }) => ({
    parentNode: topics[1].toLowerCase() as Hex,
    labelhash: topics[2].toLowerCase() as Hex,
    node: keccak256(concat([topics[1], topics[2]])),
  }))
  return {
    status: 'ok',
    edges: [...new Map(edges.map((edge) => [edge.node, edge])).values()],
  }
}

/** Only a normalized exact preimage can become an importable name. */
export const getProvenSubnameName = (params: {
  readonly node: Hex
  readonly parentNode: Hex
  readonly labelhash: Hex
  readonly knownNames: readonly string[]
  readonly wrapperName: Hex
}): string | null => {
  const decoded = Result.fromThrowable(() =>
    bytesToPacket(hexToBytes(params.wrapperName)),
  )()
  const candidates = [
    ...params.knownNames,
    ...(decoded.isOk() ? [decoded.value] : []),
  ]
  return (
    candidates.find((name) => {
      const result = Result.fromThrowable(() => {
        const separator = name.indexOf('.')
        return (
          separator > 0 &&
          !name.includes('[') &&
          normalize(name) === name &&
          namehash(name).toLowerCase() === params.node.toLowerCase() &&
          namehash(name.slice(separator + 1)).toLowerCase() ===
            params.parentNode.toLowerCase() &&
          labelhash(name.slice(0, separator)).toLowerCase() ===
            params.labelhash.toLowerCase()
        )
      })()
      return result.isOk() && result.value
    }) ?? null
  )
}

/** Validate hints once; callers may then avoid redundant on-chain preimage reads. */
export const getKnownSubnamePreimages = (
  names: readonly string[],
): ReadonlyMap<Hex, string> =>
  new Map(
    names.flatMap((name) => {
      const parsed = Result.fromThrowable(() =>
        !name.includes('[') && normalize(name) === name ? namehash(name) : null,
      )()
      return parsed.isOk() && parsed.value
        ? [[parsed.value, name] as const]
        : []
    }),
  )
