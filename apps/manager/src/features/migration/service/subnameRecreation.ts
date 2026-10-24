import {
  type BignameClient,
  type Meta,
  readAllEnvelopes,
  type Subname,
} from '@ens-apps/indexer/bigname'
import { readSubnameMigrationImpact, type V1Domain } from '@ens-apps/migration'
import {
  registryOwnerSnippet,
  registryResolverSnippet,
} from '@ensdomains/ensjs-abi/registry'
import { nameWrapperGetDataSnippet } from '@ensdomains/ensjs-abi/v1/nameWrapper'
import {
  type Address,
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
}

const SOURCE_MAX_AGE_SECONDS = 300n
const MAX_DIRECT_CHILDREN = 200
const newOwnerEvent = parseAbi([
  'event NewOwner(bytes32 indexed node, bytes32 indexed label, address owner)',
])[0]
const fail: (ensName: string, reason: string) => never = (ensName, reason) => {
  throw new SubnameRecreationError({
    ensName,
    message: `Cannot import subnames of "${ensName}": ${reason}`,
  })
}
const parentOf = (name: string): string => name.slice(name.indexOf('.') + 1)
const countOf = (name: string, count: number | null | undefined): number => {
  if (
    count === null ||
    count === undefined ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    return fail(
      name,
      'the subname inventory is incomplete. Please refresh and try again.',
    )
  }
  return count
}
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

const recordPublication = (
  meta: Meta,
  name: string,
  publications: Map<bigint, Hex>,
): void => {
  const position = meta.as_of?.[String(envConfig.chain.id)]
  if (
    meta.completeness === 'partial' ||
    meta.completeness === 'unsupported' ||
    ['partial', 'unsupported'].includes(
      meta.as_of_completeness?.[String(envConfig.chain.id)]?.completeness ??
        'full',
    ) ||
    !position ||
    !Number.isSafeInteger(position.block_number) ||
    !/^0x[0-9a-f]{64}$/i.test(position.block_hash)
  ) {
    fail(
      name,
      'a complete indexed inventory with a canonical checkpoint is required.',
    )
  }
  const number = BigInt(position.block_number)
  const prior = publications.get(number)
  if (prior && prior.toLowerCase() !== position.block_hash.toLowerCase())
    fail(name, 'the index returned inconsistent block identities.')
  publications.set(number, position.block_hash)
}

const readDirectInventory = async (
  indexer: BignameClient,
  name: string,
  publications: Map<bigint, Hex>,
  signal?: AbortSignal,
): Promise<readonly Subname[]> => {
  const detail = await indexer.name(name, { include: ['counts'] }, { signal })
  if (detail.isErr())
    fail(name, 'the indexed child inventory could not be read.')
  const rootRecord = detail.value
  recordPublication(rootRecord.meta, name, publications)
  assertIdentity(rootRecord.data.name, rootRecord.data.namehash)
  if (rootRecord.data.name !== name || rootRecord.data.read_status !== 'ok')
    fail(name, 'the parent inventory is unavailable.')
  const count = countOf(name, rootRecord.data.subname_count)
  if (count > MAX_DIRECT_CHILDREN)
    fail(name, 'this tree is too large for a single safe import batch.')
  const pages = await readAllEnvelopes(
    (cursor, pageSignal) =>
      indexer.subnames(
        name,
        {
          namespace: 'ens',
          include: ['counts'],
          include_expired: 'true',
          page_size: 200,
          sort: 'name',
          ...(cursor ? { cursor } : {}),
        },
        { signal: pageSignal },
      ),
    { signal },
  )
  if (pages.isErr())
    fail(name, 'the complete child inventory could not be read.')
  const rows = pages.value.flatMap((page) => {
    recordPublication(page.meta, name, publications)
    if (countOf(name, page.page?.total_count) !== count)
      fail(
        name,
        'the indexed child count changed during discovery. Please refresh.',
      )
    return page.data
  })
  if (
    rows.length !== count ||
    new Set(rows.map((row) => row.namehash.toLowerCase())).size !== count
  )
    fail(name, 'one or more child identities are missing or duplicated.')
  for (const row of rows) {
    assertIdentity(row.name, row.namehash)
    if (parentOf(row.name) !== name)
      fail(
        name,
        'the inventory contains an unexpected parent or deeper subname.',
      )
    if (countOf(row.name, row.subname_count) > 0)
      fail(
        row.name,
        'fourth-level and deeper subnames are not supported yet. Keep the whole tree on ENSv1.',
      )
  }
  return rows
}

const assertCanonicalPublications = async (
  publicClient: PublicClient,
  publications: ReadonlyMap<bigint, Hex>,
  block: { timestamp: bigint },
): Promise<void> => {
  for (const [number, hash] of publications) {
    const publication = await publicClient.getBlock({ blockNumber: number })
    if (
      publication.hash?.toLowerCase() !== hash.toLowerCase() ||
      publication.timestamp > block.timestamp ||
      block.timestamp - publication.timestamp > SOURCE_MAX_AGE_SECONDS
    )
      fail(
        'selection',
        'the indexed source checkpoint is stale or no longer canonical.',
      )
  }
}

const readChildSource = async (
  publicClient: PublicClient,
  root: V1Domain,
  row: Subname,
  oldestPublication: bigint,
  block: { number: bigint },
): Promise<V1Domain> => {
  const descendants = await publicClient.getLogs({
    address: V1_CONTRACTS.LegacyRegistry,
    event: newOwnerEvent,
    args: { node: row.namehash },
    fromBlock: oldestPublication,
    toBlock: block.number,
  })
  if (descendants.length)
    fail(
      row.name,
      'its descendants changed after indexing. Refresh the complete tree before continuing.',
    )
  const [registryOwner, resolver] = await Promise.all([
    publicClient.readContract({
      address: V1_CONTRACTS.LegacyRegistry,
      abi: registryOwnerSnippet,
      functionName: 'owner',
      args: [row.namehash],
      blockNumber: block.number,
    }),
    publicClient.readContract({
      address: V1_CONTRACTS.LegacyRegistry,
      abi: registryResolverSnippet,
      functionName: 'resolver',
      args: [row.namehash],
      blockNumber: block.number,
    }),
  ])
  if (isAddressEqual(registryOwner, zeroAddress))
    fail(row.name, 'the child has no verifiable live controller.')
  const wrapper = isAddressEqual(registryOwner, V1_CONTRACTS.NameWrapper)
    ? await publicClient.readContract({
        address: V1_CONTRACTS.NameWrapper,
        abi: nameWrapperGetDataSnippet,
        functionName: 'getData',
        args: [BigInt(row.namehash)],
        blockNumber: block.number,
      })
    : null
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

/** Reads labels from the index, but owner/resolver/permissions from a canonical RPC checkpoint. */
export const discoverSubnameRecreation = async (params: {
  readonly domains: readonly V1Domain[]
  readonly owner: Address
  readonly publicClient: PublicClient
  readonly indexer?: BignameClient
  readonly signal?: AbortSignal
}): Promise<{
  readonly domains: readonly V1Domain[]
  readonly snapshot: SubnameRecreationSnapshot
}> => {
  const { publicClient, signal } = params
  const indexer = params.indexer ?? bigname
  const classified = classifyNames(
    [...params.domains],
    params.owner,
    envConfig.chain.id,
  ).classified
  const roots = classified.filter(
    (name) =>
      name.action === 'migrate' &&
      name.parentName === 'eth' &&
      ['unwrapped', 'unlocked'].includes(name.tokenType),
  )
  const domains = new Map(params.domains.map((domain) => [domain.name, domain]))
  const publications = new Map<bigint, Hex>()
  const rowsByRoot = new Map<string, readonly Subname[]>()
  for (const root of roots) {
    signal?.throwIfAborted()
    const name = root.domain.name
    const rows = await readDirectInventory(indexer, name, publications, signal)
    rowsByRoot.set(name, rows)
  }
  const block = await publicClient.getBlock({ blockTag: 'latest' })
  if (!block.hash)
    fail('selection', 'the source block is not confirmed by the RPC.')
  await assertCanonicalPublications(publicClient, publications, block)
  const oldestPublication = [...publications.keys()].reduce(
    (oldest, number) => (number < oldest ? number : oldest),
    block.number,
  )
  for (const root of roots) {
    const name = root.domain.name
    const rows = rowsByRoot.get(name) ?? []
    const labels = new Set(
      rows.map((row) => labelhash(row.name.split('.')[0] ?? '').toLowerCase()),
    )
    const events = await publicClient.getLogs({
      address: V1_CONTRACTS.LegacyRegistry,
      event: newOwnerEvent,
      args: { node: namehash(name) },
      fromBlock: oldestPublication,
      toBlock: block.number,
    })
    if (
      events.some(
        (event) =>
          !event.args.label || !labels.has(event.args.label.toLowerCase()),
      )
    )
      fail(
        name,
        'the parent changed after indexing. Refresh the full inventory before continuing.',
      )
    for (const row of rows) {
      signal?.throwIfAborted()
      domains.set(
        row.name,
        await readChildSource(
          publicClient,
          root.domain,
          row,
          oldestPublication,
          block,
        ),
      )
    }
  }
  const values = [...domains.values()]
  // Number-pinned reads can span an RPC reorg. Do not label a mixture of
  // branches with the hash captured before the child reads started.
  const confirmed = await publicClient.getBlock({ blockNumber: block.number })
  if (confirmed.hash?.toLowerCase() !== block.hash.toLowerCase())
    fail(
      'selection',
      'the source checkpoint changed while reading the inventory. Please refresh.',
    )
  const snapshot: SubnameRecreationSnapshot = {
    version: 5,
    roots: roots.map(({ domain }) => domain.name),
    names: values.map(({ name }) => name),
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    timestamp: block.timestamp.toString(),
    chainId: envConfig.chain.id,
    inventoryDigest: inventoryDigest(values),
  }
  return { domains: values, snapshot }
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
  for (const root of relevantRoots) {
    if (head.number <= BigInt(params.snapshot.blockNumber)) continue
    const events = await params.publicClient.getLogs({
      address: V1_CONTRACTS.LegacyRegistry,
      event: newOwnerEvent,
      args: { node: namehash(root) },
      fromBlock: BigInt(params.snapshot.blockNumber) + 1n,
      toBlock: head.number,
    })
    if (events.length)
      fail(
        root,
        'the child inventory changed after review. Prepare and review a fresh import.',
      )
  }
  for (const domain of params.domains) {
    if (!relevantRoots.includes(parentOf(domain.name))) continue
    if (head.number > BigInt(params.snapshot.blockNumber)) {
      const descendants = await params.publicClient.getLogs({
        address: V1_CONTRACTS.LegacyRegistry,
        event: newOwnerEvent,
        args: { node: namehash(domain.name) },
        fromBlock: BigInt(params.snapshot.blockNumber) + 1n,
        toBlock: head.number,
      })
      if (descendants.length)
        fail(
          domain.name,
          'its descendants changed after review. Prepare a fresh import.',
        )
    }
    const [owner, resolver] = await Promise.all([
      params.publicClient.readContract({
        address: V1_CONTRACTS.LegacyRegistry,
        abi: registryOwnerSnippet,
        functionName: 'owner',
        args: [namehash(domain.name)],
        blockNumber: head.number,
      }),
      params.publicClient.readContract({
        address: V1_CONTRACTS.LegacyRegistry,
        abi: registryResolverSnippet,
        functionName: 'resolver',
        args: [namehash(domain.name)],
        blockNumber: head.number,
      }),
    ])
    if (
      !isAddressEqual(owner, domain.owner.id as Address) ||
      !isAddressEqual(
        resolver,
        (domain.resolver?.address ?? zeroAddress) as Address,
      )
    )
      fail(
        domain.name,
        'its V1 controller or resolver changed after review. Prepare a fresh import.',
      )
    if (domain.wrappedDomain) {
      const [holder, fuses, expiry] = await params.publicClient.readContract({
        address: V1_CONTRACTS.NameWrapper,
        abi: nameWrapperGetDataSnippet,
        functionName: 'getData',
        args: [BigInt(domain.id)],
        blockNumber: head.number,
      })
      if (
        !isAddressEqual(holder, domain.wrappedOwner?.id as Address) ||
        fuses !== domain.wrappedDomain.fuses ||
        expiry.toString() !== domain.wrappedDomain.expiryDate
      )
        fail(
          domain.name,
          'its wrapped owner or permissions changed after review. Prepare a fresh import.',
        )
    }
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
  readonly classified: readonly ClassifiedName[]
  readonly signal?: AbortSignal
}): Promise<void> => {
  const unreviewed = params.classified.find(
    (name) => name.action === 'copy' && !name.recreationRoot,
  )
  if (unreviewed)
    fail(
      unreviewed.domain.name,
      'select its unwrapped or unlocked .eth parent and review the complete direct-child import first.',
    )
  const impact = await readSubnameMigrationImpact({
    indexer: bigname,
    publicClient: params.publicClient,
    migratingNames: params.classified
      .filter((name) => name.action === 'migrate')
      .map(({ domain }) => domain.name),
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
}
