import { requireEnsChain } from '@ens-apps/config'
import {
  type SubnameMigrationImpact,
  SubnameMigrationImpactError,
} from '@ens-apps/migration'
import {
  computeWrapperRegistryAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { labelToCanonicalId } from '@ensdomains/ensjs/utils/v2'
import { baseRegistrarNameExpiresSnippet } from '@ensdomains/ensjs-abi/v1/baseRegistrar'
import {
  type Address,
  getChainContractAddress,
  type Hex,
  labelhash,
  namehash,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import {
  type RpcSubnameInventory,
  RpcSubnameInventoryError,
  type RpcSubnameSource,
  readRpcSubnameInventory,
} from './readRpcSubnameInventory'
import {
  computeRpcSubnameMigrationImpact,
  getRpcMigrationScanPolicy,
} from './rpcSubnameMigrationImpact'

const GRAVEYARD_ABI = parseAbi(['function GRAVEYARD() view returns (address)'])
const REGISTRY_STATE_ABI = parseAbi([
  'struct State { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (State state)',
])
const WRAPPER_IDENTITY_ABI = parseAbi([
  'function getWrappedNode() view returns (bytes32)',
])
const FACTORY_IDENTITY_ABI = parseAbi([
  'function verifyContract(address proxy) view returns (address implementation)',
])
const fail = (message: string): never => {
  throw new SubnameMigrationImpactError({ message })
}
const isDotEthRoot = (name: string) =>
  name.split('.').length === 2 && name.endsWith('.eth')
const sourcesByNode = (inventory: RpcSubnameInventory) =>
  new Map(
    [...inventory.rootSources, ...inventory.nodes].map((source) => [
      source.node,
      source,
    ]),
  )

const matchesCheckpoint = (
  block: { readonly number: bigint; readonly hash: Hex | null },
  checkpoint: RpcSubnameInventory['checkpoint'],
): boolean =>
  block.number === checkpoint.number &&
  block.hash?.toLowerCase() === checkpoint.hash.toLowerCase()

const matchesInventorySource = (
  inventory: RpcSubnameInventory,
  expected: Pick<
    RpcSubnameInventory,
    'chainId' | 'registryAddress' | 'nameWrapperAddress'
  >,
): boolean => {
  const sources = sourcesByNode(inventory)
  return (
    inventory.chainId === expected.chainId &&
    inventory.registryAddress.toLowerCase() ===
      expected.registryAddress.toLowerCase() &&
    inventory.nameWrapperAddress.toLowerCase() ===
      expected.nameWrapperAddress.toLowerCase() &&
    inventory.roots.every(({ node, name }) => {
      const source = sources.get(node)
      return (
        source !== undefined &&
        inventory.scannedParentNodes.includes(node) &&
        (name === undefined || namehash(name) === node) &&
        (source.name === null || namehash(source.name) === node)
      )
    })
  )
}

const requiredSelectionNames = (
  names: readonly string[],
): readonly string[] => {
  const selected = new Set(names)
  return names.flatMap((name) => {
    const labels = name.split('.')
    const ancestors = labels
      .slice(1)
      .map((_, index) => labels.slice(index + 1).join('.'))
    const selectedParent = ancestors.findIndex((ancestor) =>
      selected.has(ancestor),
    )
    return selectedParent < 0
      ? [name]
      : [name, ...ancestors.slice(0, selectedParent)]
  })
}

const hasRequiredInventoryCoverage = (
  inventory: RpcSubnameInventory,
  names: readonly string[],
): boolean => {
  const sources = sourcesByNode(inventory)
  const scanned = new Set(inventory.scannedParentNodes)
  return requiredSelectionNames(names).every((name) => {
    const node = namehash(name)
    const source = sources.get(node)
    return (
      source !== undefined &&
      scanned.has(node) &&
      (source.name === null || namehash(source.name) === node)
    )
  })
}

const verifiedInventoryNames = (
  inventory: RpcSubnameInventory | undefined,
): readonly string[] =>
  [...(inventory?.rootSources ?? []), ...(inventory?.nodes ?? [])].flatMap(
    ({ node, name }) =>
      name !== null && namehash(name) === node ? [name] : [],
  )

const hasStrictSupersetRoots = (
  inventory: RpcSubnameInventory | undefined,
  names: readonly string[],
): boolean => {
  const roots = new Set(inventory?.roots.map(({ node }) => node))
  const requested = new Set(names.map((name) => namehash(name)))
  return (
    roots.size > requested.size &&
    [...requested].every((node) => roots.has(node))
  )
}

const readCurrentInventory = async (params: {
  readonly publicClient: PublicClient
  readonly names: readonly string[]
  readonly copiedNames: readonly string[]
  readonly chainId: number
  readonly registryAddress: Address
  readonly nameWrapperAddress: Address
  readonly inventory?: RpcSubnameInventory
  readonly signal?: AbortSignal
}): Promise<RpcSubnameInventory> => {
  let previous = params.inventory
  if (previous) {
    if (!matchesInventorySource(previous, params))
      return fail(
        'The supplied inventory belongs to another migration source or selection.',
      )
    const [actualChainId, canonical, head] = await Promise.all([
      params.publicClient.request(
        { method: 'eth_chainId' },
        { signal: params.signal },
      ),
      params.publicClient.getBlock({ blockNumber: previous.checkpoint.number }),
      params.publicClient.getBlock(),
    ])
    params.signal?.throwIfAborted()
    if (BigInt(actualChainId) !== BigInt(params.chainId))
      return fail('The inventory RPC is connected to another chain.')
    if (
      !matchesCheckpoint(canonical, previous.checkpoint) ||
      head.number < previous.checkpoint.number ||
      (head.number === previous.checkpoint.number &&
        !matchesCheckpoint(head, previous.checkpoint))
    )
      return fail('The source checkpoint changed before the subname check.')
    if (!hasRequiredInventoryCoverage(previous, params.names))
      previous = undefined
    else if (head.number === previous.checkpoint.number) return previous
  }
  const requestedRoots = params.names.map((name) => ({
    node: namehash(name),
    name,
  }))
  const request: Parameters<typeof readRpcSubnameInventory>[0] = {
    publicClient: params.publicClient,
    chainId: params.chainId,
    registryAddress: params.registryAddress,
    nameWrapperAddress: params.nameWrapperAddress,
    roots: previous?.roots ?? requestedRoots,
    knownNames: [
      ...new Set([
        ...params.names,
        ...params.copiedNames,
        ...verifiedInventoryNames(params.inventory),
      ]),
    ],
    scanDescendants: getRpcMigrationScanPolicy({
      migratingNames: params.names,
      copiedNames: params.copiedNames,
      nameWrapperAddress: params.nameWrapperAddress,
    }),
    ...(previous && { previousInventory: previous }),
    signal: params.signal,
  }
  return readRpcSubnameInventory(request).catch((cause: unknown) => {
    params.signal?.throwIfAborted()
    if (
      !(cause instanceof RpcSubnameInventoryError) ||
      (cause.reason !== 'node-limit' && cause.reason !== 'history-limit') ||
      !hasStrictSupersetRoots(previous, params.names)
    )
      throw cause
    return readRpcSubnameInventory({
      ...request,
      roots: requestedRoots,
      previousInventory: undefined,
    })
  })
}

const hasCompletedMigration = async (params: {
  readonly publicClient: PublicClient
  readonly source: RpcSubnameSource & { readonly name: string }
  readonly destination: ReturnType<typeof getDestinationContracts>
  readonly blockNumber: bigint
}): Promise<boolean> => {
  const { publicClient, source, destination, blockNumber } = params
  const [label, ...parentLabels] = source.name.split('.')
  if (!label) return false
  if (isDotEthRoot(source.name)) {
    const state = await publicClient.readContract({
      address: destination.ethRegistry,
      abi: REGISTRY_STATE_ABI,
      functionName: 'getState',
      args: [BigInt(labelhash(label))],
      blockNumber,
    })
    return state.latestOwner.toLowerCase() !== zeroAddress
  }
  const parentName = parentLabels.join('.')
  const parentWrapper = computeWrapperRegistryAddress({
    name: parentName,
    contracts: destination,
  })
  if (!parentWrapper) return false
  // Both locked and detached children live in the certified parent wrapper.
  // A detached child does not deploy a wrapper of its own.
  const [node, implementation, state] = await Promise.all([
    publicClient.readContract({
      address: parentWrapper,
      abi: WRAPPER_IDENTITY_ABI,
      functionName: 'getWrappedNode',
      blockNumber,
    }),
    publicClient.readContract({
      address: destination.verifiableFactory,
      abi: FACTORY_IDENTITY_ABI,
      functionName: 'verifyContract',
      args: [parentWrapper],
      blockNumber,
    }),
    publicClient.readContract({
      address: parentWrapper,
      abi: REGISTRY_STATE_ABI,
      functionName: 'getState',
      args: [labelToCanonicalId(label)],
      blockNumber,
    }),
  ])
  return (
    node.toLowerCase() === namehash(parentName) &&
    implementation.toLowerCase() ===
      destination.wrapperRegistryImpl.toLowerCase() &&
    state.latestOwner.toLowerCase() !== zeroAddress
  )
}

type ReadImpactParameters = {
  readonly publicClient: PublicClient
  readonly migratingNames: readonly string[]
  readonly copiedNames?: readonly string[]
  readonly renewingNames?: readonly string[]
  readonly inventory?: RpcSubnameInventory
  readonly onInventory?: (
    inventory: RpcSubnameInventory,
  ) => void | Promise<void>
  readonly signal?: AbortSignal
}

type ImpactContext = Parameters<typeof computeRpcSubnameMigrationImpact>[0]

const readImpactContext = async (
  params: ReadImpactParameters,
): Promise<ImpactContext> => {
  const { publicClient, signal } = params
  signal?.throwIfAborted()
  const chain = requireEnsChain(publicClient, 'RPC subname migration impact')
  const destination = getDestinationContracts(chain.id)
  const names = [
    ...new Set(params.migratingNames.map((name) => name.toLowerCase())),
  ]
  const wrapper = getChainContractAddress({ chain, contract: 'ensNameWrapper' })
  const inventory = await readCurrentInventory({
    publicClient,
    names,
    copiedNames: params.copiedNames ?? [],
    chainId: chain.id,
    registryAddress: getChainContractAddress({
      chain,
      contract: 'ensLegacyRegistry',
    }),
    nameWrapperAddress: wrapper,
    inventory: params.inventory,
    signal,
  })
  signal?.throwIfAborted()
  const blockNumber = inventory.checkpoint.number
  const ethRoots = names.filter(isDotEthRoot)
  const [graveyard, expiries] = await Promise.all([
    publicClient.readContract({
      address: destination.unlockedMigrationController,
      abi: GRAVEYARD_ABI,
      functionName: 'GRAVEYARD',
      blockNumber,
    }),
    publicClient.multicall({
      allowFailure: false,
      blockNumber,
      contracts: ethRoots.map((name) => ({
        address: getChainContractAddress({
          chain,
          contract: 'ensBaseRegistrarImplementation',
        }),
        abi: baseRegistrarNameExpiresSnippet,
        functionName: 'nameExpires' as const,
        args: [BigInt(labelhash(name.split('.')[0] ?? ''))] as const,
      })),
    }),
  ])
  const expiredRootNodes = new Set(
    ethRoots.flatMap((name, index) => {
      const expiry = expiries[index]
      if (expiry === undefined)
        return fail(`The registrar expiry for ${name} is unavailable.`)
      return expiry <= inventory.checkpoint.timestamp ? [namehash(name)] : []
    }),
  )
  const sources = sourcesByNode(inventory)
  let upgradedNodes: ReadonlySet<Hex> = new Set()
  for (const name of names) {
    signal?.throwIfAborted()
    const source = sources.get(namehash(name))
    if (!source) return fail(`The migration source for ${name} is missing.`)
    if (
      source.registryOwner.toLowerCase() !== graveyard.toLowerCase() &&
      source.wrappedData?.[0].toLowerCase() !== graveyard.toLowerCase()
    )
      continue
    if (
      !(await hasCompletedMigration({
        publicClient,
        source: { ...source, name },
        destination,
        blockNumber,
      }))
    )
      return fail(`The completed migration for ${name} could not be verified.`)
    upgradedNodes = new Set([...upgradedNodes, source.node])
  }
  return {
    inventory,
    migratingNames: names,
    copiedNames: params.copiedNames ?? [],
    renewingNames: params.renewingNames ?? [],
    nameWrapperAddress: wrapper,
    upgradedNodes,
    expiredRootNodes,
    checkedAt: Date.now(),
  }
}

const confirmImpactCheckpoint = async (
  params: ReadImpactParameters,
  inventory: RpcSubnameInventory,
): Promise<void> => {
  const confirmed = await params.publicClient.getBlock({
    blockNumber: inventory.checkpoint.number,
  })
  params.signal?.throwIfAborted()
  if (!matchesCheckpoint(confirmed, inventory.checkpoint))
    return fail('The source checkpoint changed during the subname check.')
}

/** One RPC inventory serves the whole selection, including children held by other wallets. */
export const readRpcSubnameMigrationImpact = async (
  params: ReadImpactParameters,
): Promise<SubnameMigrationImpact> => {
  const context = await readImpactContext(params)
  const result = computeRpcSubnameMigrationImpact(context)
  await confirmImpactCheckpoint(params, context.inventory)
  if (result.status === 'incomplete') return fail(result.reason)
  await params.onInventory?.(context.inventory)
  params.signal?.throwIfAborted()
  return result.impact
}

/** Eligibility decisions stay independent while sharing the same verified RPC snapshot. */
export const readRpcSubnameMigrationImpacts = async (
  params: ReadImpactParameters,
): Promise<
  readonly {
    readonly name: string
    readonly result: ReturnType<typeof computeRpcSubnameMigrationImpact>
  }[]
> => {
  const context = await readImpactContext(params)
  const results = context.migratingNames.map((name) => ({
    name,
    result: computeRpcSubnameMigrationImpact({
      ...context,
      migratingNames: [name],
    }),
  }))
  await confirmImpactCheckpoint(params, context.inventory)
  if (results.every(({ result }) => result.status === 'complete'))
    await params.onInventory?.(context.inventory)
  params.signal?.throwIfAborted()
  return results
}
