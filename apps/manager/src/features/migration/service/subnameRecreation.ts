import { type BignameClient, readAllEnvelopes } from '@ens-apps/indexer/bigname'
import type { SubnameMigrationImpact, V1Domain } from '@ens-apps/migration'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
  type GetLogsReturnType,
  type Hex,
  isAddress,
  isAddressEqual,
  keccak256,
  labelhash,
  maxUint64,
  namehash,
  type PublicClient,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { normalize } from 'viem/ens'
import { envConfig } from '@/config'
import { bigname } from '@/lib/bigname'
import { V1_CONTRACTS } from '../contracts/addresses'
import {
  type ClassifiedName,
  type CopyClassifiedName,
  classifyNames,
} from './classifyNames'
import {
  type RpcSubnameInventory,
  readRpcSubnameInventory,
} from './readRpcSubnameInventory'
import { readRpcSubnameMigrationImpact } from './readRpcSubnameMigrationImpact'
import { getProvenSubnameName } from './rpcSubnameInventory'
import { isEmptyRpcSubnameTombstone } from './rpcSubnameMigrationImpact'
import {
  assertSubnameRecreationSnapshotCurrent,
  SubnameRecreationError,
} from './subnameRecreationError'

/** The reviewed import is immutable; it does not follow later legacy transfers. */
export type SubnameRecreationSnapshot = {
  readonly version: 1 | 2 | 3 | 4 | 5
  readonly roots: readonly string[]
  readonly names: readonly string[]
  readonly blockNumber: string
  readonly timestamp: string
  readonly blockHash: Hex
  readonly chainId?: number
  readonly inventoryDigest?: Hex
  readonly registryAddresses?: readonly Address[]
}

const SOURCE_MAX_AGE_SECONDS = 300n
const MAX_DIRECT_CHILDREN = 200
// Fits a full direct tree's owner/resolver reads; larger selections split at the same checkpoint.
const SOURCE_MULTICALL_BATCH_BYTES = 24_576
const SOURCE_LOG_BATCH_SIZE = 200
const newOwnerEvent = parseAbi([
  'event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)',
])[0]
const fail: (ensName: string, reason: string) => never = (ensName, reason) => {
  throw new SubnameRecreationError({
    ensName,
    detail: reason,
    message: `Cannot import subnames of "${ensName}": ${reason}`,
  })
}
const parentOf = (name: string): string => name.slice(name.indexOf('.') + 1)
const assertIdentity = (name: string, node: string): void => {
  if (
    name.includes('[') ||
    normalize(name) !== name ||
    namehash(name).toLowerCase() !== node.toLowerCase()
  ) {
    fail(name, 'an exact, valid subname label is required before migration.')
  }
}

const inventoryDigest = (domains: readonly V1Domain[]): Hex =>
  keccak256(
    stringToHex(
      JSON.stringify(
        [...domains]
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
          .map((domain) => ({
            name: domain.name,
            node: domain.id.toLowerCase(),
            label: domain.labelName,
            labelhash: domain.labelhash.toLowerCase(),
            owner: domain.owner.id.toLowerCase(),
            resolver: domain.resolver?.address.toLowerCase() ?? zeroAddress,
            wrapper: domain.wrappedDomain
              ? {
                  owner: domain.wrappedOwner?.id.toLowerCase(),
                  fuses: domain.wrappedDomain.fuses,
                  expiry: domain.wrappedDomain.expiryDate,
                }
              : null,
          })),
      ),
    ),
  )

/** Change only the approved direct children; ordinary migration classification stays intact. */
export const applySubnameRecreation = (params: {
  readonly domains: readonly V1Domain[]
  readonly classified: readonly ClassifiedName[]
  readonly snapshot: SubnameRecreationSnapshot
  readonly owner: Address
}): readonly ClassifiedName[] => {
  assertSubnameRecreationSnapshotCurrent(params.snapshot)
  if (
    params.snapshot.chainId !== envConfig.chain.id ||
    params.snapshot.inventoryDigest !== inventoryDigest(params.domains)
  )
    fail(
      'selection',
      'the saved import identity does not match the reviewed source.',
    )
  const names = new Set(params.domains.map(({ name }) => name))
  if (
    names.size !== params.domains.length ||
    names.size !== params.snapshot.names.length ||
    params.snapshot.names.some((name) => !names.has(name))
  ) {
    fail(
      'selection',
      'the saved source inventory is incomplete. Reconcile the original import first.',
    )
  }
  const roots = new Set(params.snapshot.roots)
  for (const root of roots) {
    const classified = params.classified.find(
      ({ domain }) => domain.name === root,
    )
    if (
      !classified ||
      classified.action !== 'migrate' ||
      !['unwrapped', 'unlocked'].includes(classified.tokenType) ||
      !isAddressEqual(classified.tokenHolder, params.owner)
    ) {
      fail(
        root,
        'only unwrapped or unlocked .eth parents can import subnames here.',
      )
    }
  }
  const copies: CopyClassifiedName[] = []
  for (const domain of params.domains) {
    if (roots.has(domain.name)) continue
    const parent = parentOf(domain.name)
    if (!roots.has(parent)) {
      if (
        params.snapshot.roots.some((root) => domain.name.endsWith(`.${root}`))
      ) {
        fail(
          parent,
          'fourth-level and deeper subnames are not supported yet. Keep the whole tree on ENSv1.',
        )
      }
      continue
    }
    assertIdentity(domain.name, domain.id)
    const label = domain.name.split('.')[0] ?? ''
    const holder = domain.wrappedDomain
      ? domain.wrappedOwner?.id
      : domain.owner.id
    if (
      domain.parent?.name !== parent ||
      domain.labelName !== label ||
      domain.labelhash.toLowerCase() !== labelhash(label).toLowerCase() ||
      !holder ||
      !isAddress(holder) ||
      isAddressEqual(holder, zeroAddress)
    ) {
      fail(parent, 'a child label, owner or parent could not be verified.')
    }
    if (BigInt(domain.wrappedDomain?.fuses ?? 0) !== 0n) {
      fail(
        domain.name,
        'this wrapped child has permissions that a UserRegistry cannot preserve.',
      )
    }
    copies.push({
      domain,
      label,
      parentName: parent,
      fuses: 0n,
      action: 'copy',
      tokenType: domain.wrappedDomain ? 'unlocked-child' : 'registry-child',
      copySource: domain.wrappedDomain ? 'name-wrapper' : 'registry',
      sourceExpiry: maxUint64,
      tokenHolder: holder,
      resolverStrategy: 'keep-v1',
      v1ResolverAddress: domain.resolver?.address ?? null,
      registryController: null,
      managerAddress: null,
      recreationRoot: parent,
    })
  }
  const copied = new Set(copies.map(({ domain }) => domain.name))
  return [
    ...params.classified.filter(({ domain }) => !copied.has(domain.name)),
    ...copies,
  ]
}

/** Indexer data supplies preimages only; RPC establishes every child identity. */
const readLabelHints = async (
  indexer: BignameClient,
  rootName: string,
  signal?: AbortSignal,
): Promise<readonly string[]> => {
  const result = await readAllEnvelopes(
    (cursor, requestSignal) =>
      indexer.subnames(
        rootName,
        {
          namespace: 'ens',
          include_expired: 'true',
          page_size: 200,
          sort: 'name',
          ...(cursor !== undefined && { cursor }),
        },
        { signal: requestSignal },
      ),
    { signal },
  )
  signal?.throwIfAborted()
  if (result.isErr())
    return fail(
      rootName,
      'an exact child label could not be resolved. Please refresh and try again.',
    )
  return result.value.flatMap(({ data }) => data.map(({ name }) => name))
}

type SubnameSource = {
  readonly registryOwner: Address
  readonly resolver: Address
  readonly wrapper: readonly [Address, number, bigint] | null
}

const readSubnameSources = async (params: {
  readonly publicClient: PublicClient
  readonly nodes: readonly Hex[]
  readonly blockNumber: bigint
  readonly signal?: AbortSignal
}): Promise<ReadonlyMap<Hex, SubnameSource>> => {
  params.signal?.throwIfAborted()
  if (params.nodes.length === 0) return new Map()
  const records = await params.publicClient.multicall({
    allowFailure: false,
    blockNumber: params.blockNumber,
    batchSize: SOURCE_MULTICALL_BATCH_BYTES,
    contracts: params.nodes.flatMap((node) => [
      {
        address: V1_CONTRACTS.LegacyRegistry,
        abi: registryOwnerSnippet,
        functionName: 'owner' as const,
        args: [node] as const,
      },
      {
        address: V1_CONTRACTS.LegacyRegistry,
        abi: registryResolverSnippet,
        functionName: 'resolver' as const,
        args: [node] as const,
      },
    ]),
  })
  params.signal?.throwIfAborted()
  const sources = params.nodes.map((node, index) => {
    const registryOwner = records[index * 2]
    const resolver = records[index * 2 + 1]
    if (registryOwner === undefined || resolver === undefined)
      fail('selection', 'one or more source identities could not be read.')
    return { node, registryOwner, resolver }
  })
  const wrapped = sources.filter(({ registryOwner }) =>
    isAddressEqual(registryOwner, V1_CONTRACTS.NameWrapper),
  )
  const data =
    wrapped.length > 0
      ? await params.publicClient.multicall({
          allowFailure: false,
          blockNumber: params.blockNumber,
          batchSize: SOURCE_MULTICALL_BATCH_BYTES,
          contracts: wrapped.map(({ node }) => ({
            address: V1_CONTRACTS.NameWrapper,
            abi: nameWrapperGetDataSnippet,
            functionName: 'getData' as const,
            args: [BigInt(node)] as const,
          })),
        })
      : []
  params.signal?.throwIfAborted()
  const wrappers = new Map(
    wrapped.map(({ node }, index) => {
      const wrapper = data[index]
      if (wrapper === undefined)
        fail(
          'selection',
          'one or more wrapped source identities could not be read.',
        )
      return [node, wrapper] as const
    }),
  )
  return new Map(
    sources.map(({ node, ...source }) => [
      node,
      { ...source, wrapper: wrappers.get(node) ?? null },
    ]),
  )
}

const readNewOwnerChanges = async (params: {
  readonly publicClient: PublicClient
  readonly nodes: readonly Hex[]
  readonly fromBlock: bigint
  readonly toBlock: bigint
  readonly registryAddresses?: readonly Address[]
}): Promise<GetLogsReturnType<typeof newOwnerEvent>> => {
  let events: GetLogsReturnType<typeof newOwnerEvent> = []
  for (
    let offset = 0;
    offset < params.nodes.length;
    offset += SOURCE_LOG_BATCH_SIZE
  ) {
    events = [
      ...events,
      ...(await params.publicClient.getLogs({
        address: params.registryAddresses?.length
          ? [...params.registryAddresses]
          : V1_CONTRACTS.LegacyRegistry,
        event: newOwnerEvent,
        args: {
          node: params.nodes.slice(offset, offset + SOURCE_LOG_BATCH_SIZE),
        },
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
      })),
    ]
  }
  return events
}

const childDomainFromSource = (
  root: V1Domain,
  row: { readonly name: string; readonly namehash: Hex },
  source: SubnameSource,
): V1Domain => {
  const { registryOwner, resolver, wrapper } = source
  if (isAddressEqual(registryOwner, zeroAddress))
    fail(row.name, 'the child has no verifiable live controller.')
  if (wrapper && (wrapper[1] !== 0 || isAddressEqual(wrapper[0], zeroAddress)))
    fail(
      row.name,
      'this wrapped child has unsupported permissions or no live token owner.',
    )
  const label = row.name.split('.')[0] ?? ''
  return {
    id: row.namehash,
    name: row.name,
    labelName: label,
    labelhash: labelhash(label),
    owner: { id: registryOwner },
    wrappedOwner: wrapper ? { id: wrapper[0] } : null,
    wrappedDomain: wrapper
      ? { fuses: wrapper[1], expiryDate: wrapper[2].toString() }
      : null,
    resolver: isAddressEqual(resolver, zeroAddress)
      ? null
      : { address: resolver },
    parent: {
      name: root.name,
      wrappedDomain: root.wrappedDomain
        ? { fuses: root.wrappedDomain.fuses }
        : null,
    },
    registrant: null,
    registration: null,
  }
}

/** Read complete RPC identities and source facts; use indexer labels only if needed. */
const hasRecreationCoverage = (
  inventory: RpcSubnameInventory,
  candidateNodes: readonly string[],
): boolean => {
  const roots = new Set(inventory.roots.map(({ node }) => node.toLowerCase()))
  const scanned = new Set(
    inventory.scannedParentNodes.map((node) => node.toLowerCase()),
  )
  const candidates = new Set(candidateNodes.map((node) => node.toLowerCase()))
  return (
    candidateNodes.every(
      (node) =>
        roots.has(node.toLowerCase()) && scanned.has(node.toLowerCase()),
    ) &&
    inventory.nodes.every(
      (node) =>
        !candidates.has(node.parentNode.toLowerCase()) ||
        scanned.has(node.node.toLowerCase()),
    )
  )
}

const readRecreationInventory = async (params: {
  readonly publicClient: PublicClient
  readonly inventory?: RpcSubnameInventory
  readonly names: readonly string[]
  readonly candidates: readonly V1Domain[]
  readonly signal?: AbortSignal
}): Promise<RpcSubnameInventory> => {
  const { publicClient, signal } = params
  const supplied = params.inventory
  if (
    supplied &&
    (supplied.chainId !== envConfig.chain.id ||
      supplied.registryAddress.toLowerCase() !==
        V1_CONTRACTS.LegacyRegistry.toLowerCase() ||
      supplied.nameWrapperAddress.toLowerCase() !==
        V1_CONTRACTS.NameWrapper.toLowerCase())
  )
    fail(
      'selection',
      'the source inventory belongs to another network or registry.',
    )
  const [actualChainId, latest, previousCheckpoint] = supplied
    ? await Promise.all([
        publicClient.request({ method: 'eth_chainId' }, { signal }),
        publicClient.getBlock({ blockTag: 'latest' }),
        publicClient.getBlock({ blockNumber: supplied.checkpoint.number }),
      ])
    : [null, null, null]
  signal?.throwIfAborted()
  if (
    actualChainId !== null &&
    BigInt(actualChainId) !== BigInt(envConfig.chain.id)
  )
    fail('selection', 'the inventory RPC is connected to another chain.')
  if (
    supplied &&
    (previousCheckpoint?.hash?.toLowerCase() !==
      supplied.checkpoint.hash.toLowerCase() ||
      (latest && latest.number < supplied.checkpoint.number))
  )
    fail(
      'selection',
      'the source checkpoint is no longer canonical. Please refresh.',
    )
  const hasCoverage =
    supplied &&
    hasRecreationCoverage(
      supplied,
      params.candidates.map(({ id }) => id),
    )
  const canReuse =
    supplied &&
    hasCoverage &&
    latest?.number === supplied.checkpoint.number &&
    latest.hash?.toLowerCase() === supplied.checkpoint.hash.toLowerCase()
  const previous =
    hasCoverage && supplied.unscannedParentNodes.length === 0
      ? supplied
      : undefined
  const inventory = canReuse
    ? supplied
    : await readRpcSubnameInventory({
        publicClient,
        chainId: envConfig.chain.id,
        registryAddress: V1_CONTRACTS.LegacyRegistry,
        nameWrapperAddress: V1_CONTRACTS.NameWrapper,
        roots:
          previous?.roots ??
          params.candidates.map(({ name }) => ({ node: namehash(name), name })),
        previousInventory: previous,
        knownNames: params.names,
        maxDepth: previous ? undefined : 2,
        signal,
      })
  if (
    inventory.chainId !== envConfig.chain.id ||
    inventory.registryAddress.toLowerCase() !==
      V1_CONTRACTS.LegacyRegistry.toLowerCase() ||
    inventory.nameWrapperAddress.toLowerCase() !==
      V1_CONTRACTS.NameWrapper.toLowerCase()
  )
    fail(
      'selection',
      'the source inventory belongs to another network or registry.',
    )
  return inventory
}

export const discoverSubnameRecreation = async (params: {
  readonly domains: readonly V1Domain[]
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly indexer?: BignameClient
  readonly inventory?: RpcSubnameInventory
  readonly signal?: AbortSignal
  readonly onNamesChecked?: (names: readonly string[]) => void | Promise<void>
}): Promise<{
  readonly domains: readonly V1Domain[]
  readonly snapshot: SubnameRecreationSnapshot
  readonly inventory: RpcSubnameInventory
}> => {
  const { publicClient, signal } = params
  signal?.throwIfAborted()
  const classified = classifyNames(
    [...params.domains],
    params.owner,
    envConfig.chain.id,
  ).classified
  const candidates = classified.filter(
    (name) =>
      name.action === 'migrate' &&
      name.parentName === 'eth' &&
      ['unwrapped', 'unlocked'].includes(name.tokenType),
  )
  const inventory = await readRecreationInventory({
    publicClient,
    inventory: params.inventory,
    names: params.domains.map(({ name }) => name),
    candidates: candidates.map(({ domain }) => domain),
    signal,
  })
  const rootsByNode = new Map(
    inventory.roots.map((root) => [root.node.toLowerCase(), root]),
  )
  const scanned = new Set(
    inventory.scannedParentNodes.map((node) => node.toLowerCase()),
  )
  if (
    candidates.some(
      ({ domain }) =>
        !rootsByNode.has(domain.id.toLowerCase()) ||
        !scanned.has(domain.id.toLowerCase()),
    )
  )
    fail('selection', 'the complete parent inventory has not been checked.')
  const [block, head] = await Promise.all([
    publicClient.getBlock({ blockNumber: inventory.checkpoint.number }),
    publicClient.getBlock({ blockTag: 'latest' }),
  ])
  signal?.throwIfAborted()
  if (block.hash?.toLowerCase() !== inventory.checkpoint.hash.toLowerCase())
    fail(
      'selection',
      'the source checkpoint is no longer canonical. Please refresh.',
    )
  if (
    head.timestamp < block.timestamp ||
    head.timestamp - block.timestamp > SOURCE_MAX_AGE_SECONDS
  )
    fail('selection', 'the source checkpoint is stale. Please refresh.')
  const candidateNames = new Set(candidates.map(({ domain }) => domain.name))
  let checkedNames: readonly string[] = params.domains
    .filter(({ name }) => !candidateNames.has(name))
    .map(({ name }) => name)
  await params.onNamesChecked?.(checkedNames)
  let imports: readonly V1Domain[] = []
  let importRoots: readonly string[] = []
  for (const root of candidates) {
    signal?.throwIfAborted()
    const children = inventory.nodes.filter(
      (node) =>
        node.parentNode.toLowerCase() === root.domain.id.toLowerCase() &&
        !isEmptyRpcSubnameTombstone(node, inventory),
    )
    if (children.length > MAX_DIRECT_CHILDREN)
      fail(
        root.domain.name,
        'this tree is too large for a single safe import batch.',
      )
    if (children.some((child) => !scanned.has(child.node.toLowerCase())))
      fail(
        root.domain.name,
        'the complete descendant inventory has not been checked.',
      )
    if (
      children.some((child) =>
        inventory.nodes.some(
          (node) =>
            node.parentNode === child.node &&
            !isEmptyRpcSubnameTombstone(node, inventory),
        ),
      )
    )
      fail(
        root.domain.name,
        'fourth-level and deeper subnames are not supported yet. Keep the whole tree on ENSv1.',
      )
    const hints = children.some(({ name }) => name === null)
      ? await readLabelHints(
          params.indexer ?? bigname,
          root.domain.name,
          signal,
        )
      : []
    const imported = children.map((child) => {
      const name =
        child.name ??
        getProvenSubnameName({ ...child, knownNames: hints, wrapperName: '0x' })
      if (!name)
        return fail(
          root.domain.name,
          'an exact, valid subname label is required before migration.',
        )
      assertIdentity(name, child.node)
      if (parentOf(name) !== root.domain.name)
        return fail(
          root.domain.name,
          'a child label, owner or parent could not be verified.',
        )
      return childDomainFromSource(
        root.domain,
        { name, namehash: child.node },
        {
          registryOwner: child.registryOwner,
          resolver: child.resolver,
          wrapper: child.wrappedData,
        },
      )
    })
    imports = [...imports, ...imported]
    if (children.length > 0) importRoots = [...importRoots, root.domain.name]
    checkedNames = [...checkedNames, root.domain.name]
    await params.onNamesChecked?.(checkedNames)
  }
  const values = [
    ...new Map(
      [...params.domains, ...imports].map((domain) => [domain.name, domain]),
    ).values(),
  ]
  const confirmed = await publicClient.getBlock({ blockNumber: block.number })
  signal?.throwIfAborted()
  if (confirmed.hash?.toLowerCase() !== inventory.checkpoint.hash.toLowerCase())
    fail(
      'selection',
      'the source checkpoint changed while reading the inventory. Please refresh.',
    )
  const snapshot: SubnameRecreationSnapshot = {
    version: 5,
    roots: importRoots,
    names: values.map(({ name }) => name),
    blockNumber: block.number.toString(),
    blockHash: inventory.checkpoint.hash,
    timestamp: block.timestamp.toString(),
    chainId: envConfig.chain.id,
    inventoryDigest: inventoryDigest(values),
    registryAddresses: inventory.registries.map(({ address }) => address),
  }
  return {
    domains: values,
    snapshot,
    inventory: withValidatedInventoryLabels(inventory, values),
  }
}

const getSubnameSourceChange = (
  domain: V1Domain,
  source: SubnameSource,
): 'controller-or-resolver' | 'wrapped-state' | null => {
  if (
    source.registryOwner.toLowerCase() !== domain.owner.id.toLowerCase() ||
    source.resolver.toLowerCase() !==
      (domain.resolver?.address ?? zeroAddress).toLowerCase()
  )
    return 'controller-or-resolver'
  if (
    domain.wrappedDomain &&
    (!source.wrapper ||
      source.wrapper[0].toLowerCase() !==
        domain.wrappedOwner?.id.toLowerCase() ||
      source.wrapper[1] !== domain.wrappedDomain.fuses ||
      source.wrapper[2].toString() !== domain.wrappedDomain.expiryDate)
  )
    return 'wrapped-state'
  return null
}

const withValidatedInventoryLabels = (
  inventory: RpcSubnameInventory,
  domains: readonly V1Domain[],
): RpcSubnameInventory => {
  const names = new Map(domains.map(({ id, name }) => [id.toLowerCase(), name]))
  return {
    ...inventory,
    nodes: inventory.nodes.map((node) => {
      const name = names.get(node.node.toLowerCase())
      return {
        ...node,
        name:
          node.name ??
          getProvenSubnameName({
            ...node,
            knownNames: name ? [name] : [],
            wrapperName: '0x',
          }),
      }
    }),
  }
}

/** Revalidate source identities before signing. Receipt checks verify the reviewed import, not live V1 synchronisation. */
export const assertSubnameRecreationUnchanged = async (params: {
  readonly publicClient: PublicClient
  readonly snapshot: SubnameRecreationSnapshot
  readonly domains: readonly V1Domain[]
  readonly toBlock?: bigint
  readonly ownTransactionHash?: Hex
}): Promise<void> => {
  assertSubnameRecreationSnapshotCurrent(params.snapshot)
  if (params.snapshot.chainId !== params.publicClient.chain?.id)
    fail('selection', 'the saved import belongs to another network.')
  const block = await params.publicClient.getBlock({
    blockNumber: BigInt(params.snapshot.blockNumber),
  })
  if (block.hash?.toLowerCase() !== params.snapshot.blockHash.toLowerCase())
    fail(
      'selection',
      'the reviewed checkpoint is no longer canonical. Prepare the import again.',
    )
  // Confirmed transactions must be reconciled against their saved destination
  // expectations, even if a legacy owner transfers or Graveyard.clear runs later.
  if (params.ownTransactionHash) return
  const head = await params.publicClient.getBlock()
  const relevantRoots = params.snapshot.roots.filter((root) =>
    params.domains.some(
      (domain) => domain.name === root || domain.name.endsWith(`.${root}`),
    ),
  )
  const children = params.domains.filter((domain) =>
    relevantRoots.includes(parentOf(domain.name)),
  )
  if (head.number > BigInt(params.snapshot.blockNumber)) {
    const events = await readNewOwnerChanges({
      publicClient: params.publicClient,
      nodes: relevantRoots.map((root) => namehash(root)),
      fromBlock: BigInt(params.snapshot.blockNumber) + 1n,
      toBlock: head.number,
      registryAddresses: params.snapshot.registryAddresses,
    })
    if (events.length)
      fail(
        relevantRoots.find((root) =>
          events.some(
            ({ args }) =>
              args.node?.toLowerCase() === namehash(root).toLowerCase(),
          ),
        ) ?? 'selection',
        'the child inventory changed after review. Prepare and review a fresh import.',
      )
    const descendants = await readNewOwnerChanges({
      publicClient: params.publicClient,
      nodes: children.map(({ name }) => namehash(name)),
      fromBlock: BigInt(params.snapshot.blockNumber) + 1n,
      toBlock: head.number,
      registryAddresses: params.snapshot.registryAddresses,
    })
    if (descendants.length)
      fail(
        children.find(({ name }) =>
          descendants.some(
            ({ args }) =>
              args.node?.toLowerCase() === namehash(name).toLowerCase(),
          ),
        )?.name ?? 'selection',
        'its descendants changed after review. Prepare a fresh import.',
      )
  }
  const sources = await readSubnameSources({
    publicClient: params.publicClient,
    nodes: children.map(({ name }) => namehash(name)),
    blockNumber: head.number,
  })
  for (const domain of children) {
    const source = sources.get(namehash(domain.name))
    if (!source) fail(domain.name, 'the child source could not be verified.')
    const change = getSubnameSourceChange(domain, source)
    if (change === 'controller-or-resolver')
      fail(
        domain.name,
        'its V1 controller or resolver changed after review. Prepare a fresh import.',
      )
    if (change === 'wrapped-state')
      fail(
        domain.name,
        'its wrapped owner or permissions changed after review. Prepare a fresh import.',
      )
  }
  const [confirmedCutoff, confirmedHead] = await Promise.all([
    params.publicClient.getBlock({
      blockNumber: BigInt(params.snapshot.blockNumber),
    }),
    params.publicClient.getBlock({ blockNumber: head.number }),
  ])
  if (
    confirmedCutoff.hash?.toLowerCase() !==
      params.snapshot.blockHash.toLowerCase() ||
    confirmedHead.hash !== head.hash
  )
    fail(
      'selection',
      'the source chain changed during validation. Prepare and review a fresh import.',
    )
}

/** Every omitted dependent name is a blocker, including when import rollout is disabled. */
export const assertSupportedSubnameMigration = async (params: {
  readonly publicClient: PublicClient
  readonly ownerAddress?: Address
  readonly classified: readonly ClassifiedName[]
  readonly inventory?: RpcSubnameInventory
  readonly onInventory?: (
    inventory: RpcSubnameInventory,
  ) => void | Promise<void>
  readonly signal?: AbortSignal
}): Promise<SubnameMigrationImpact> => {
  const unreviewed = params.classified.find(
    (name) => name.action === 'copy' && !name.recreationRoot,
  )
  if (unreviewed)
    fail(
      unreviewed.domain.name,
      'select its unwrapped or unlocked .eth parent and review the complete direct-child import first.',
    )
  const migratingNames = params.classified
    .filter((name) => name.action === 'migrate')
    .map(({ domain }) => domain.name)
  const impact = await readRpcSubnameMigrationImpact({
    inventory: params.inventory,
    onInventory: params.onInventory,
    publicClient: params.publicClient,
    migratingNames,
    copiedNames: params.classified
      .filter((name) => name.action === 'copy')
      .map(({ domain }) => domain.name),
    signal: params.signal,
  })
  if (impact.affectedCount > 0)
    fail(
      impact.parents[0]?.name ?? 'selection',
      'this upgrade would leave dependent subnames behind. Deeper trees and unsupported wrapped permissions must stay on ENSv1 for now.',
    )
  return impact
}
