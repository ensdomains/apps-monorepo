import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import {
  nameWrapperGetDataSnippet,
  nameWrapperNamesSnippet,
} from '@ensdomains/ensjs-abi/v1/nameWrapper'
import * as v from 'valibot'
import {
  type Address,
  decodeAbiParameters,
  encodeFunctionData,
  type Hex,
  isAddress,
  labelhash,
  namehash,
  type PublicClient,
  parseAbi,
  toHex,
  withRetry,
  zeroAddress,
} from 'viem'
import {
  getKnownSubnamePreimages,
  getProvenSubnameName,
  getSubnameInventoryLimit,
  hasSubnameLogRangeLimit,
  isMissingRegistryFallbackGetter,
  NEW_OWNER_TOPIC,
  parseSubnameLogs,
  planSubnameLogReads,
  type RpcSubnameEdge,
  type SubnameLogRequest,
  shouldRetrySubnameInventoryRead,
} from './rpcSubnameInventory'

export class RpcSubnameInventoryError extends TaggedError(
  'RpcSubnameInventoryError',
)<{
  readonly cause?: unknown
  readonly reason: 'node-limit' | 'history-limit' | 'read-failed'
}> {}

export type RpcSubnameSource = {
  readonly node: Hex
  readonly registryOwner: Address
  readonly resolver: Address
  readonly wrappedData: readonly [Address, number, bigint] | null
  readonly name: string | null
}
export type RpcSubnameNode = RpcSubnameSource &
  RpcSubnameEdge & {
    readonly depth: number
  }
type RegistrySource = { readonly address: Address; readonly fromBlock: bigint }
type Root = { readonly node: Hex; readonly name?: string }
export type RpcSubnameInventory = {
  readonly chainId: number
  readonly registryAddress: Address
  readonly nameWrapperAddress: Address
  readonly checkpoint: {
    readonly number: bigint
    readonly hash: Hex
    readonly timestamp: bigint
  }
  readonly registries: readonly RegistrySource[]
  readonly roots: readonly Root[]
  readonly rootSources: readonly RpcSubnameSource[]
  /** Includes historical ownerless nodes; the consumer decides liveness explicitly. */
  readonly nodes: readonly RpcSubnameNode[]
  readonly scannedParentNodes: readonly Hex[]
  /** Parents omitted by the depth limit or scan policy; consumers must prove their required branches. */
  readonly unscannedParentNodes: readonly Hex[]
}
export type RpcSubnameInventoryParameters = {
  readonly publicClient: Pick<PublicClient, 'request' | 'multicall'>
  readonly verificationClient?: Pick<PublicClient, 'request' | 'multicall'>
  readonly chainId: number
  readonly registryAddress: Address
  readonly nameWrapperAddress: Address
  readonly roots: readonly Root[]
  readonly knownNames?: readonly string[]
  /** An earlier result from this reader, retained in memory by the caller. */
  readonly previousInventory?: RpcSubnameInventory
  readonly maxDepth?: number
  /** Pure pruning policy. Explicit roots are always scanned; omitted means full discovery. */
  readonly scanDescendants?: (
    source: RpcSubnameSource,
    checkpoint: RpcSubnameInventory['checkpoint'],
  ) => boolean
  readonly signal?: AbortSignal
  /** Loading can wait for RPC recovery; final signing checks keep immediate failure. */
  readonly retry?: 'until-success'
  readonly onProgress?: (progress: {
    readonly scannedParentNodes: readonly Hex[]
    readonly discoveredNodeCount: number
  }) => void | Promise<void>
}

const REQUEST_CONCURRENCY = 8
const NODE_BATCH_SIZE = 200
const LOG_NODE_BATCH_SIZE = 500
const SOURCE_BATCH_BYTES = 24_576
const OLD_REGISTRY_ABI = parseAbi(['function old() view returns (address)'])
const HASH_SCHEMA = v.custom<Hex>(
  (value) => typeof value === 'string' && /^0x[0-9a-f]{64}$/i.test(value),
)
const QUANTITY_SCHEMA = v.pipe(
  v.string(),
  v.regex(/^0x[0-9a-f]+$/i),
  v.transform((value) => BigInt(value)),
)
const BLOCK_SCHEMA = v.object({
  number: QUANTITY_SCHEMA,
  hash: HASH_SCHEMA,
  timestamp: QUANTITY_SCHEMA,
})

const fail = (
  message: string,
  reason: RpcSubnameInventoryError['reason'] = 'read-failed',
): never => {
  throw new RpcSubnameInventoryError({ message, reason })
}
const retryInventoryRpcRead = <T>(
  params: Pick<RpcSubnameInventoryParameters, 'signal' | 'retry'>,
  read: () => Promise<T>,
): Promise<T> =>
  withRetry(read, {
    retryCount: params.retry === 'until-success' ? Number.POSITIVE_INFINITY : 0,
    delay: ({ count }) => Math.min(1_000 * 2 ** Math.min(count, 5), 30_000),
    shouldRetry: ({ error }) => shouldRetrySubnameInventoryRead(error),
    signal: params.signal,
  })

/** Discover fallback registries at the same checkpoint. Genesis is always a safe lower bound. */
const readRegistries = async (
  params: RpcSubnameInventoryParameters,
  blockNumber: bigint,
): Promise<readonly RegistrySource[]> => {
  let address = params.registryAddress
  let sources: readonly RegistrySource[] = []
  while (address.toLowerCase() !== zeroAddress) {
    params.signal?.throwIfAborted()
    if (
      sources.length >= 8 ||
      sources.some(
        (source) => source.address.toLowerCase() === address.toLowerCase(),
      )
    )
      fail('The registry fallback chain is cyclic or unsupported')
    const [code, response] = await Promise.all([
      retryInventoryRpcRead(params, () =>
        params.publicClient.request(
          { method: 'eth_getCode', params: [address, toHex(blockNumber)] },
          { signal: params.signal },
        ),
      ),
      retryInventoryRpcRead(params, () =>
        params.publicClient
          .request(
            {
              method: 'eth_call',
              params: [
                {
                  to: address,
                  data: encodeFunctionData({
                    abi: OLD_REGISTRY_ABI,
                    functionName: 'old',
                  }),
                },
                toHex(blockNumber),
              ],
            },
            { signal: params.signal },
          )
          .catch((cause: unknown) => {
            if (
              isMissingRegistryFallbackGetter({
                chainId: params.chainId,
                address,
                cause,
              })
            )
              return '0x' as const
            throw cause
          }),
      ),
    ])
    if (!code || code === '0x')
      fail('A source registry has no code at the inventory checkpoint')
    sources = [...sources, { address, fromBlock: 0n }]
    if (response === '0x') break
    const [old] = decodeAbiParameters([{ type: 'address' }], response)
    address = old
  }
  return sources
}

const readLogRange = async (
  params: RpcSubnameInventoryParameters,
  request: SubnameLogRequest,
): Promise<readonly RpcSubnameEdge[]> => {
  params.signal?.throwIfAborted()
  const response = await retryInventoryRpcRead(params, () =>
    params.publicClient.request(
      {
        method: 'eth_getLogs',
        params: [
          {
            address:
              request.registries.length === 1
                ? request.registries[0]
                : [...request.registries],
            fromBlock: toHex(request.fromBlock),
            toBlock: toHex(request.toBlock),
            topics: [NEW_OWNER_TOPIC, [...request.parentNodes]],
          },
        ],
      },
      { signal: params.signal },
    ),
  ).then(
    (logs) => ({ status: 'read', logs }) as const,
    (cause: unknown) => ({ status: 'failed', cause }) as const,
  )
  params.signal?.throwIfAborted()
  if (response.status === 'failed') {
    if (!hasSubnameLogRangeLimit(response.cause)) throw response.cause
    if (request.fromBlock < request.toBlock) {
      const midpoint = (request.fromBlock + request.toBlock) / 2n
      const first = await readLogRange(params, {
        ...request,
        toBlock: midpoint,
      })
      const second = await readLogRange(params, {
        ...request,
        fromBlock: midpoint + 1n,
      })
      return [...first, ...second]
    }
    if (request.parentNodes.length > 1) {
      const midpoint = Math.ceil(request.parentNodes.length / 2)
      const first = await readLogRange(params, {
        ...request,
        parentNodes: request.parentNodes.slice(0, midpoint),
      })
      const second = await readLogRange(params, {
        ...request,
        parentNodes: request.parentNodes.slice(midpoint),
      })
      return [...first, ...second]
    }
    const [registry, nextRegistry, ...remainingRegistries] = request.registries
    if (nextRegistry) {
      const first = await readLogRange(params, {
        ...request,
        registries: [registry],
      })
      const second = await readLogRange(params, {
        ...request,
        registries: [nextRegistry, ...remainingRegistries],
      })
      return [...first, ...second]
    }
    throw response.cause
  }
  const parsed = parseSubnameLogs(response.logs, request)
  if (parsed.status === 'invalid') return fail(parsed.reason)
  return parsed.edges
}

type ReadSource = {
  readonly node: Hex
  readonly registryOwner: Address
  readonly resolver: Address
  readonly wrapperName: Hex
  readonly wrappedData: readonly [Address, number, bigint] | null
}
const readSourceBatch = async (
  params: RpcSubnameInventoryParameters,
  batch: readonly Hex[],
  blockNumber: bigint,
  knownNames: ReadonlyMap<Hex, string>,
): Promise<readonly ReadSource[]> => {
  params.signal?.throwIfAborted()
  const unknownNames = batch.filter((node) => !knownNames.has(node))
  const records = await retryInventoryRpcRead(params, () =>
    params.publicClient.multicall({
      allowFailure: false,
      blockNumber,
      batchSize: SOURCE_BATCH_BYTES,
      contracts: [
        ...batch.flatMap((node) => [
          {
            address: params.registryAddress,
            abi: registryOwnerSnippet,
            functionName: 'owner' as const,
            args: [node] as const,
          },
          {
            address: params.registryAddress,
            abi: registryResolverSnippet,
            functionName: 'resolver' as const,
            args: [node] as const,
          },
        ]),
        ...unknownNames.map((node) => ({
          address: params.nameWrapperAddress,
          abi: nameWrapperNamesSnippet,
          functionName: 'names' as const,
          args: [node] as const,
        })),
      ],
    }),
  )
  params.signal?.throwIfAborted()
  const wrapperNames = new Map(
    unknownNames.map((node, index) => {
      const name = records[batch.length * 2 + index]
      if (typeof name !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(name))
        return fail('A wrapper name is missing at the inventory checkpoint')
      return [node, name as Hex] as const
    }),
  )
  const current = batch.map((node, index) => {
    const registryOwner = records[index * 2]
    const resolver = records[index * 2 + 1]
    if (
      typeof registryOwner !== 'string' ||
      !isAddress(registryOwner) ||
      typeof resolver !== 'string' ||
      !isAddress(resolver)
    )
      return fail('A source owner or resolver is missing')
    return {
      node,
      registryOwner,
      resolver,
      wrapperName: wrapperNames.get(node) ?? ('0x' as Hex),
    }
  })
  const wrapped = current.filter(
    ({ registryOwner }) =>
      registryOwner.toLowerCase() === params.nameWrapperAddress.toLowerCase(),
  )
  const wrapperData =
    wrapped.length === 0
      ? []
      : await retryInventoryRpcRead(params, () =>
          params.publicClient.multicall({
            allowFailure: false,
            blockNumber,
            batchSize: SOURCE_BATCH_BYTES,
            contracts: wrapped.map(({ node }) => ({
              address: params.nameWrapperAddress,
              abi: nameWrapperGetDataSnippet,
              functionName: 'getData' as const,
              args: [BigInt(node)] as const,
            })),
          }),
        )
  params.signal?.throwIfAborted()
  const wrappers = new Map(
    wrapped.map(({ node }, index) => {
      const data = wrapperData[index]
      if (!data)
        return fail('A wrapped source is missing at the inventory checkpoint')
      return [node, data] as const
    }),
  )
  return current.map((source) => ({
    ...source,
    wrappedData: wrappers.get(source.node) ?? null,
  }))
}

const readSources = async (
  params: RpcSubnameInventoryParameters,
  nodes: readonly Hex[],
  blockNumber: bigint,
  knownNames: ReadonlyMap<Hex, string>,
): Promise<readonly ReadSource[]> => {
  const batches = Array.from(
    { length: Math.ceil(nodes.length / NODE_BATCH_SIZE) },
    (_, index) =>
      nodes.slice(index * NODE_BATCH_SIZE, (index + 1) * NODE_BATCH_SIZE),
  )
  let sources: readonly ReadSource[] = []
  for (let offset = 0; offset < batches.length; offset += 4) {
    params.signal?.throwIfAborted()
    const next = await Promise.all(
      batches
        .slice(offset, offset + 4)
        .map((batch) =>
          readSourceBatch(params, batch, blockNumber, knownNames),
        ),
    )
    sources = [...sources, ...next.flat()]
  }
  return sources
}

const sourceFacts = (
  source: ReadSource,
  edge: RpcSubnameEdge,
  knownNames: ReadonlyMap<Hex, string>,
): RpcSubnameSource => {
  const knownName = knownNames.get(edge.node)
  return {
    node: source.node,
    registryOwner: source.registryOwner,
    resolver: source.resolver,
    wrappedData: source.wrappedData,
    name: getProvenSubnameName({
      ...edge,
      knownNames: knownName ? [knownName] : [],
      wrapperName: source.wrapperName,
    }),
  }
}

/** Explicit roots start their own scan boundary, even beneath a preserved ancestor. */
const requiredScanNodes = (
  frontier: readonly Hex[],
  roots: ReadonlySet<Hex>,
  edges: readonly (RpcSubnameEdge & { readonly depth: number })[],
  pruned: ReadonlySet<Hex>,
): readonly Hex[] => {
  const required = new Map([...roots].map((node) => [node, true]))
  for (const edge of [...edges].sort((a, b) => a.depth - b.depth)) {
    if (roots.has(edge.node)) continue
    required.set(
      edge.node,
      required.get(edge.parentNode) === true && !pruned.has(edge.node),
    )
  }
  return frontier.filter((node) => required.get(node) === true)
}

const readNodeGraph = async (
  params: RpcSubnameInventoryParameters,
  roots: readonly Root[],
  registries: readonly RegistrySource[],
  checkpoint: RpcSubnameInventory['checkpoint'],
  previous: RpcSubnameInventory | undefined,
  knownNames: ReadonlyMap<Hex, string>,
) => {
  const maxDepth = params.maxDepth
  let edges: readonly (RpcSubnameEdge & { readonly depth: number })[] =
    previous?.nodes.map(({ node, parentNode, labelhash, depth }) => ({
      node,
      parentNode,
      labelhash,
      depth,
    })) ?? []
  let scannedParentNodes: readonly Hex[] = []
  let skippedParentNodes: readonly Hex[] = []
  let sourceReads: readonly ReadSource[] = []
  let frontier: readonly Hex[] =
    previous?.scannedParentNodes ?? roots.map(({ node }) => node)
  let fromBlock = previous ? previous.checkpoint.number + 1n : 0n
  const rootNodes = new Set(roots.map(({ node }) => node))
  let depths = new Map(edges.map(({ node, depth }) => [node, depth]))
  const depthOf = (node: Hex) =>
    rootNodes.has(node) ? 0 : (depths.get(node) ?? 0)
  while (
    frontier.length > 0 &&
    (params.maxDepth === undefined ||
      frontier.every(
        (node) => depthOf(node) < (maxDepth ?? Number.POSITIVE_INFINITY),
      ))
  ) {
    if (params.scanDescendants) {
      const sourceBatch = await readSources(
        params,
        frontier.filter((node) => !rootNodes.has(node)),
        checkpoint.number,
        knownNames,
      )
      sourceReads = [...sourceReads, ...sourceBatch]
      const byNode = new Map(edges.map((edge) => [edge.node, edge]))
      const pruned = new Set(
        sourceBatch
          .filter((source) => {
            const edge = byNode.get(source.node)
            if (!edge) return fail('A scan boundary has no registry identity')
            return !params.scanDescendants?.(
              sourceFacts(source, edge, knownNames),
              checkpoint,
            )
          })
          .map(({ node }) => node),
      )
      const required = requiredScanNodes(frontier, rootNodes, edges, pruned)
      const requiredSet = new Set(required)
      skippedParentNodes = [
        ...skippedParentNodes,
        ...frontier.filter((node) => !requiredSet.has(node)),
      ]
      frontier = required
    }
    let discovered: readonly RpcSubnameEdge[] = []
    for (
      let parentOffset = 0;
      parentOffset < frontier.length;
      parentOffset += LOG_NODE_BATCH_SIZE
    ) {
      const parentBatch = frontier.slice(
        parentOffset,
        parentOffset + LOG_NODE_BATCH_SIZE,
      )
      const plan = planSubnameLogReads({
        registries: registries.map((source) => ({ ...source, fromBlock })),
        parentNodes: parentBatch,
        toBlock: checkpoint.number,
        blockRange: params.chainId === 1 ? 5_000_000n : 50_000n,
        nodeBatchSize: LOG_NODE_BATCH_SIZE,
      })
      for (let index = 0; index < plan.length; index += REQUEST_CONCURRENCY) {
        params.signal?.throwIfAborted()
        const batches = await Promise.all(
          plan
            .slice(index, index + REQUEST_CONCURRENCY)
            .map((request) => readLogRange(params, request)),
        )
        discovered = [...discovered, ...batches.flat()]
        const historyLimit = getSubnameInventoryLimit({
          phase: 'history',
          count: discovered.length,
        })
        if (historyLimit)
          fail('The historical subname inventory is too large', historyLimit)
      }
      await params.onProgress?.({
        scannedParentNodes: [
          ...scannedParentNodes,
          ...frontier.slice(0, parentOffset + parentBatch.length),
        ],
        discoveredNodeCount: new Set(
          [...edges, ...discovered].map(({ node }) => node),
        ).size,
      })
    }
    const newEdges = [
      ...new Map(discovered.map((edge) => [edge.node, edge])).values(),
    ]
    edges = [
      ...new Map(
        [
          ...edges,
          ...newEdges
            .filter((edge) => !depths.has(edge.node))
            .map((edge) => ({ ...edge, depth: depthOf(edge.parentNode) + 1 })),
        ].map((edge) => [edge.node, edge]),
      ).values(),
    ]
    depths = new Map(edges.map(({ node, depth }) => [node, depth]))
    const nodeLimit = getSubnameInventoryLimit({
      phase: 'nodes',
      count: edges.length,
    })
    if (nodeLimit) fail('The subname inventory is too large', nodeLimit)
    scannedParentNodes = [...scannedParentNodes, ...frontier]
    const scanned = new Set(scannedParentNodes)
    frontier = newEdges
      .map(({ node }) => node)
      .filter((node) => !scanned.has(node))
    fromBlock = 0n
  }
  return {
    edges,
    scannedParentNodes,
    frontier: [...new Set([...skippedParentNodes, ...frontier])],
    sourceReads,
  }
}

const readInventory = async (
  params: RpcSubnameInventoryParameters,
): Promise<RpcSubnameInventory> => {
  params.signal?.throwIfAborted()
  const maxDepth = params.maxDepth
  if (
    params.maxDepth !== undefined &&
    (!Number.isSafeInteger(params.maxDepth) || params.maxDepth < 1)
  )
    fail('The subname discovery depth must be a positive integer')
  const readBlock = async (
    number: Hex | 'latest',
    client = params.publicClient,
  ) => {
    const response = await retryInventoryRpcRead(params, () =>
      client.request(
        { method: 'eth_getBlockByNumber', params: [number, false] },
        { signal: params.signal },
      ),
    )
    const block = v.safeParse(BLOCK_SCHEMA, response)
    if (!block.success)
      return fail('The inventory checkpoint is missing or malformed')
    return block.output
  }
  const [chainId, checkpoint] = await Promise.all([
    retryInventoryRpcRead(params, () =>
      params.publicClient.request(
        { method: 'eth_chainId' },
        { signal: params.signal },
      ),
    ),
    readBlock('latest'),
  ])
  if (BigInt(chainId) !== BigInt(params.chainId))
    fail('The inventory RPC is connected to another chain')
  const roots = [
    ...new Map(
      params.roots.map((root) => {
        if (!v.is(HASH_SCHEMA, root.node))
          return fail('An inventory root has an invalid node hash')
        if (
          root.name &&
          namehash(root.name).toLowerCase() !== root.node.toLowerCase()
        )
          return fail('An inventory root name does not match its node hash')
        return [
          root.node.toLowerCase(),
          { ...root, node: root.node.toLowerCase() as Hex },
        ] as const
      }),
    ).values(),
  ]
  const registries = await readRegistries(params, checkpoint.number)
  const suppliedPrevious = params.previousInventory
  const previousScanned = new Set(suppliedPrevious?.scannedParentNodes ?? [])
  if (
    suppliedPrevious &&
    (suppliedPrevious.chainId !== params.chainId ||
      suppliedPrevious.registryAddress.toLowerCase() !==
        params.registryAddress.toLowerCase() ||
      suppliedPrevious.nameWrapperAddress.toLowerCase() !==
        params.nameWrapperAddress.toLowerCase() ||
      suppliedPrevious.checkpoint.number > checkpoint.number ||
      suppliedPrevious.roots.length !== roots.length ||
      suppliedPrevious.roots.some(
        (root) => !roots.some(({ node }) => node === root.node.toLowerCase()),
      ) ||
      suppliedPrevious.registries.length !== registries.length ||
      suppliedPrevious.registries.some(
        (source, index) =>
          source.address.toLowerCase() !==
          registries[index]?.address.toLowerCase(),
      ))
  )
    fail(
      'The previous inventory belongs to a different selection or source chain',
    )
  const previous =
    suppliedPrevious &&
    suppliedPrevious.unscannedParentNodes.length === 0 &&
    [...suppliedPrevious.roots, ...suppliedPrevious.nodes].every(({ node }) =>
      previousScanned.has(node),
    ) &&
    (params.maxDepth === undefined ||
      suppliedPrevious.nodes.every(
        ({ depth }) => depth < (maxDepth ?? Number.POSITIVE_INFINITY),
      ))
      ? suppliedPrevious
      : undefined
  if (previous) {
    const oldCheckpoint = await readBlock(
      toHex(previous.checkpoint.number),
      params.verificationClient,
    )
    if (
      oldCheckpoint.hash.toLowerCase() !==
      previous.checkpoint.hash.toLowerCase()
    )
      fail('The previous inventory checkpoint is no longer canonical')
  }
  params.signal?.throwIfAborted()
  const knownNames = [
    ...(params.knownNames ?? []),
    ...[...(previous?.rootSources ?? []), ...(previous?.nodes ?? [])].flatMap(
      ({ name }) => (name ? [name] : []),
    ),
    ...roots.flatMap(({ name }) => (name ? [name] : [])),
  ]
  const namePreimages = getKnownSubnamePreimages(knownNames)
  const rootNodes = new Set(roots.map(({ node }) => node))
  const [rootFacts, graphFacts] = await Promise.all([
    readSources(params, [...rootNodes], checkpoint.number, namePreimages),
    readNodeGraph(
      params,
      roots,
      registries,
      checkpoint,
      previous,
      namePreimages,
    ).then(async (graph) => {
      const alreadyRead = new Set([
        ...rootNodes,
        ...graph.sourceReads.map(({ node }) => node),
      ])
      return {
        ...graph,
        sources: [
          ...graph.sourceReads,
          ...(await readSources(
            params,
            graph.edges
              .map(({ node }) => node)
              .filter((node) => !alreadyRead.has(node)),
            checkpoint.number,
            namePreimages,
          )),
        ],
      }
    }),
  ])
  const { edges, scannedParentNodes, frontier } = graphFacts
  const sources = [...rootFacts, ...graphFacts.sources]
  const byNode = new Map(sources.map((source) => [source.node, source]))
  const nodes = edges.map((edge): RpcSubnameNode => {
    const source = byNode.get(edge.node)
    if (!source) return fail('An inventory node has no source facts')
    return {
      ...edge,
      ...sourceFacts(source, edge, namePreimages),
    }
  })
  const rootSources = roots.map((root): RpcSubnameSource => {
    const source = byNode.get(root.node)
    if (!source) return fail('An inventory root has no source facts')
    const name = root.name
    const separator = name?.indexOf('.') ?? -1
    const verifiedName =
      name && separator > 0
        ? getProvenSubnameName({
            node: root.node,
            parentNode: namehash(name.slice(separator + 1)),
            labelhash: labelhash(name.slice(0, separator)),
            knownNames: [name],
            wrapperName: source.wrapperName,
          })
        : null
    return {
      node: root.node,
      registryOwner: source.registryOwner,
      resolver: source.resolver,
      wrappedData: source.wrappedData,
      name: verifiedName,
    }
  })
  const confirmed = await readBlock(
    toHex(checkpoint.number),
    params.verificationClient,
  )
  params.signal?.throwIfAborted()
  if (
    confirmed.number !== checkpoint.number ||
    confirmed.hash.toLowerCase() !== checkpoint.hash.toLowerCase()
  )
    fail('The inventory checkpoint changed during discovery')
  return {
    chainId: params.chainId,
    registryAddress: params.registryAddress,
    nameWrapperAddress: params.nameWrapperAddress,
    checkpoint,
    registries,
    roots,
    rootSources,
    nodes,
    scannedParentNodes,
    unscannedParentNodes: frontier,
  }
}

/** RPC identities at one canonical checkpoint, with every unscanned boundary explicit. */
export const readRpcSubnameInventory = (
  params: RpcSubnameInventoryParameters,
): Promise<RpcSubnameInventory> => {
  const controller = new AbortController()
  const signal = params.signal
    ? AbortSignal.any([params.signal, controller.signal])
    : controller.signal
  return readInventory({ ...params, signal }).catch((cause: unknown) => {
    controller.abort(cause)
    params.signal?.throwIfAborted()
    if (cause instanceof RpcSubnameInventoryError) throw cause
    throw new RpcSubnameInventoryError({
      message: 'Could not read the complete RPC subname inventory',
      reason: 'read-failed',
      cause,
    })
  })
}
