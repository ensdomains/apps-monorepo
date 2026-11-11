import {
  FUSES,
  hasFuse,
  MAX_UNRECOVERABLE_SUBNAMES,
  type SubnameMigrationImpact,
  unknownLabelhashOf,
} from '@ens-apps/migration'
import { err, ok, type Result } from 'neverthrow'
import {
  type Address,
  type Hex,
  keccak256,
  namehash,
  toHex,
  zeroAddress,
} from 'viem'
import type {
  RpcSubnameInventory,
  RpcSubnameSource,
} from './readRpcSubnameInventory'

type ImpactResult =
  | { readonly status: 'complete'; readonly impact: SubnameMigrationImpact }
  | { readonly status: 'incomplete'; readonly reason: string }
type Branch = {
  readonly node: Hex
  readonly affectedParent: string | null
  readonly isPreserved: boolean
}
type Facts = { readonly isLive: boolean; readonly isIndependent: boolean }
const isDotEthRoot = (name: string | null): boolean =>
  name !== null && name.split('.').length === 2 && name.endsWith('.eth')

export const isResourceFreeRpcSubname = (source: RpcSubnameSource): boolean =>
  source.registryOwner.toLowerCase() === zeroAddress &&
  source.resolver.toLowerCase() === zeroAddress

type TombstoneInventory = Pick<
  RpcSubnameInventory,
  'nodes' | 'scannedParentNodes'
>
type TombstoneIndex = {
  readonly scanned: ReadonlySet<Hex>
  readonly children: ReadonlyMap<Hex, readonly Hex[]>
  readonly tombstones: ReadonlySet<Hex>
}

const isEmptyNode = (
  source: RpcSubnameSource,
  index: Omit<TombstoneIndex, 'tombstones'>,
  tombstones: ReadonlySet<Hex>,
): boolean =>
  isResourceFreeRpcSubname(source) &&
  index.scanned.has(source.node) &&
  (index.children.get(source.node) ?? []).every((child) =>
    tombstones.has(child),
  )

/** Deepest first, so each node's children are decided before the node itself. */
const buildTombstoneIndex = (inventory: TombstoneInventory): TombstoneIndex => {
  const scanned = new Set(inventory.scannedParentNodes)
  const children = new Map<Hex, Hex[]>()
  for (const { node, parentNode } of inventory.nodes) {
    const siblings = children.get(parentNode)
    if (siblings) siblings.push(node)
    else children.set(parentNode, [node])
  }
  const tombstones = new Set<Hex>()
  for (const node of [...inventory.nodes].sort((a, b) => b.depth - a.depth))
    if (isEmptyNode(node, { scanned, children }, tombstones))
      tombstones.add(node.node)
  return { scanned, children, tombstones }
}

const tombstoneIndexes = new WeakMap<TombstoneInventory, TombstoneIndex>()

/** Only a fully scanned, resource-free subtree proves a historical node is harmless. */
export const isEmptyRpcSubnameTombstone = (
  source: RpcSubnameSource,
  inventory: TombstoneInventory,
): boolean => {
  if (!isResourceFreeRpcSubname(source)) return false
  const index =
    tombstoneIndexes.get(inventory) ?? buildTombstoneIndex(inventory)
  tombstoneIndexes.set(inventory, index)
  return isEmptyNode(source, index, index.tombstones)
}
const ancestors = (name: string): readonly string[] => {
  const labels = name.split('.')
  return labels.slice(1).map((_, index) => labels.slice(index + 1).join('.'))
}
const topLevel = (names: readonly string[]): readonly string[] => {
  const selected = new Set(names)
  return names.filter(
    (name) => !ancestors(name).some((parent) => selected.has(parent)),
  )
}
const factsOf = (
  source: RpcSubnameSource,
  wrapper: Address,
  timestamp: bigint,
): Facts | undefined => {
  if (source.registryOwner.toLowerCase() === zeroAddress) return undefined
  if (source.registryOwner.toLowerCase() !== wrapper.toLowerCase())
    return {
      isLive: true,
      isIndependent: isDotEthRoot(source.name),
    }
  if (!source.wrappedData) return undefined
  const [holder, fuses, expiry] = source.wrappedData
  if (holder.toLowerCase() === zeroAddress) {
    // NameWrapper clears the holder and fuses of expired emancipated tokens.
    return fuses === 0 && expiry > 0n && expiry < timestamp
      ? { isLive: false, isIndependent: true }
      : undefined
  }
  const isIndependent = hasFuse(BigInt(fuses), FUSES.PARENT_CANNOT_CONTROL)
  return {
    isLive: !isIndependent || expiry > timestamp,
    isIndependent: isDotEthRoot(source.name) || isIndependent,
  }
}

/** Independent branches need no deeper inventory unless the selection reaches into them. */
export const getRpcMigrationScanPolicy = (params: {
  readonly migratingNames: readonly string[]
  readonly copiedNames?: readonly string[]
  readonly nameWrapperAddress: Address
}) => {
  const required = new Set(
    [...params.migratingNames, ...(params.copiedNames ?? [])]
      .flatMap((name) => [name.toLowerCase(), ...ancestors(name.toLowerCase())])
      .map((name) => namehash(name)),
  )
  return (
    source: RpcSubnameSource,
    checkpoint: RpcSubnameInventory['checkpoint'],
  ): boolean => {
    if (required.has(source.node)) return true
    const facts = factsOf(
      source,
      params.nameWrapperAddress,
      checkpoint.timestamp,
    )
    return !facts || (facts.isLive && !facts.isIndependent)
  }
}

type ImpactParameters = {
  readonly inventory: RpcSubnameInventory
  readonly migratingNames: readonly string[]
  readonly copiedNames: readonly string[]
  readonly renewingNames: readonly string[]
  readonly nameWrapperAddress: Address
  readonly upgradedNodes: ReadonlySet<Hex>
  readonly expiredRootNodes: ReadonlySet<Hex>
  readonly checkedAt: number
  /** `[labelhash].parent` names whose label was never published; a leaf among them is dropped. */
  readonly unknownLabelNames?: readonly string[]
}

const initialBranches = (
  params: ImpactParameters,
  sources: ReadonlyMap<Hex, RpcSubnameSource>,
  migratingNames: readonly string[],
  renewing: ReadonlySet<Hex>,
): Result<readonly Branch[], string> => {
  const queue = [...topLevel(migratingNames)]
  let branches: readonly Branch[] = []
  while (queue.length > 0) {
    const name = queue.shift()
    if (!name) continue
    const node = namehash(name)
    if (params.upgradedNodes.has(node)) {
      queue.push(
        ...topLevel(
          migratingNames.filter((child) => child.endsWith(`.${name}`)),
        ),
      )
      continue
    }
    const source = sources.get(node)
    const facts =
      source &&
      factsOf(
        source,
        params.nameWrapperAddress,
        params.inventory.checkpoint.timestamp,
      )
    const isRenewingRoot = isDotEthRoot(name) && renewing.has(node)
    if (
      !facts ||
      ((!facts.isLive || params.expiredRootNodes.has(node)) && !isRenewingRoot)
    )
      return err(
        `The migration source for ${name} is no longer active or could not be verified.`,
      )
    branches = [...branches, { node, affectedParent: name, isPreserved: true }]
  }
  return ok(branches)
}

const childBranch = (
  node: Hex,
  facts: Facts,
  parent: Branch,
  selectedName: string | undefined,
  copied: ReadonlySet<Hex>,
): Branch => ({
  node,
  affectedParent:
    selectedName ?? (facts.isIndependent ? null : parent.affectedParent),
  isPreserved:
    selectedName !== undefined ||
    facts.isIndependent ||
    (parent.isPreserved && copied.has(node)),
})

const descendantFacts = (
  source: RpcSubnameSource | undefined,
  inventory: RpcSubnameInventory,
  wrapper: Address,
): Facts | undefined => {
  if (!source) return undefined
  if (isEmptyRpcSubnameTombstone(source, inventory))
    return { isLive: false, isIndependent: false }
  return factsOf(source, wrapper, inventory.checkpoint.timestamp)
}

/** An unknown-label node with no live children is dropped rather than lost. */
const unknownLeafName = (
  node: Hex,
  params: {
    readonly inventory: RpcSubnameInventory
    readonly sources: ReadonlyMap<Hex, RpcSubnameSource>
    readonly children: ReadonlyMap<Hex, readonly Hex[]>
    readonly unknownLabels: ReadonlyMap<Hex, string>
  },
): string | undefined => {
  const isLeaf =
    params.inventory.scannedParentNodes.includes(node) &&
    !params.inventory.unscannedParentNodes.includes(node) &&
    (params.children.get(node) ?? []).every((child) => {
      const source = params.sources.get(child)
      return (
        source !== undefined &&
        isEmptyRpcSubnameTombstone(source, params.inventory)
      )
    })
  return isLeaf ? params.unknownLabels.get(node) : undefined
}

const affectedDescendants = (params: {
  readonly inventory: RpcSubnameInventory
  readonly wrapper: Address
  readonly initial: readonly Branch[]
  readonly sources: ReadonlyMap<Hex, RpcSubnameSource>
  readonly children: ReadonlyMap<Hex, readonly Hex[]>
  readonly migrating: ReadonlyMap<Hex, string>
  readonly copied: ReadonlySet<Hex>
  readonly selectedAncestors: ReadonlySet<Hex>
}): Result<ReadonlyMap<string, ReadonlySet<Hex>>, string> => {
  const affected = new Map<string, ReadonlySet<Hex>>()
  const visited = new Set<Hex>()
  const branches = [...params.initial]
  const scanned = new Set(params.inventory.scannedParentNodes)
  const unscanned = new Set(params.inventory.unscannedParentNodes)
  const visitChild = (node: Hex, parent: Branch): Result<void, string> => {
    if (visited.has(node)) return err('A repeated subtree was returned.')
    visited.add(node)
    const facts = descendantFacts(
      params.sources.get(node),
      params.inventory,
      params.wrapper,
    )
    if (!facts) return err(`Ownership or wrapper state is unknown for ${node}.`)
    if (!facts.isLive) return ok()
    const branch = childBranch(
      node,
      facts,
      parent,
      params.migrating.get(node),
      params.copied,
    )
    if (!branch.isPreserved && branch.affectedParent !== null)
      affected.set(
        branch.affectedParent,
        new Set([...(affected.get(branch.affectedParent) ?? []), node]),
      )
    if (branch.affectedParent !== null || params.selectedAncestors.has(node))
      branches.push(branch)
    return ok()
  }
  while (branches.length > 0) {
    const branch = branches.shift()
    if (!branch) continue
    if (!scanned.has(branch.node) || unscanned.has(branch.node))
      return err(
        'The descendant inventory is incomplete for this migration branch.',
      )
    for (const node of params.children.get(branch.node) ?? []) {
      const result = visitChild(node, branch)
      if (result.isErr()) return err(result.error)
    }
  }
  return ok(affected)
}

/** Unknown-label leaves are dropped instead of lost, up to the limit per parent. */
const splitUnrecoverable = (
  affected: ReadonlyMap<string, ReadonlySet<Hex>>,
  isUnknownLeaf: (node: Hex) => string | undefined,
) => {
  const split = [...affected].map(([parent, nodes]) => {
    const dropped = [...nodes].flatMap((node) => {
      const name = isUnknownLeaf(node)
      return name === undefined ? [] : [{ node, name }]
    })
    const isWithinLimit = dropped.length <= MAX_UNRECOVERABLE_SUBNAMES
    const droppedNodes = new Set(dropped.map(({ node }) => node))
    return {
      parent,
      lost: isWithinLimit
        ? [...nodes].filter((node) => !droppedNodes.has(node))
        : [...nodes],
      dropped: isWithinLimit ? dropped.map(({ name }) => name) : [],
    }
  })
  return {
    affected: new Map(
      split
        .filter(({ lost }) => lost.length > 0)
        .map(({ parent, lost }) => [parent, new Set(lost)] as const),
    ),
    dropped: split.flatMap(({ dropped }) => dropped).sort(),
  }
}

/** The graph proves completeness; names only identify selected migration boundaries. */
export const computeRpcSubnameMigrationImpact = (
  params: ImpactParameters,
): ImpactResult => {
  const { inventory } = params
  const migratingNames = [
    ...new Set(params.migratingNames.map((name) => name.toLowerCase())),
  ].sort()
  const migrating = new Map(
    migratingNames.map((name) => [namehash(name), name]),
  )
  const copied = new Set(
    params.copiedNames.map((name) => namehash(name.toLowerCase())),
  )
  const renewing = new Set(
    params.renewingNames.map((name) => namehash(name.toLowerCase())),
  )
  const selectedAncestors = new Set(
    migratingNames.flatMap(ancestors).map((name) => namehash(name)),
  )
  const sources = new Map(
    [...inventory.rootSources, ...inventory.nodes].map((source) => [
      source.node,
      source,
    ]),
  )
  if (inventory.unscannedParentNodes.some((node) => !sources.has(node)))
    return {
      status: 'incomplete',
      reason:
        'The descendant inventory is incomplete: a frontier identity is missing.',
    }
  const children = new Map<Hex, readonly Hex[]>()
  for (const node of inventory.nodes)
    children.set(node.parentNode, [
      ...(children.get(node.parentNode) ?? []),
      node.node,
    ])
  const roots = initialBranches(params, sources, migratingNames, renewing)
  if (roots.isErr()) return { status: 'incomplete', reason: roots.error }
  const affected = affectedDescendants({
    inventory,
    wrapper: params.nameWrapperAddress,
    initial: roots.value,
    sources,
    children,
    migrating,
    copied,
    selectedAncestors,
  })
  if (affected.isErr()) return { status: 'incomplete', reason: affected.error }
  const unknownLabels = new Map(
    (params.unknownLabelNames ?? [])
      .filter((name) => unknownLabelhashOf(name) !== null)
      .map((name) => [namehash(name.toLowerCase()), name.toLowerCase()]),
  )
  const { affected: lost, dropped } = splitUnrecoverable(
    affected.value,
    (node) =>
      unknownLeafName(node, { inventory, sources, children, unknownLabels }),
  )
  const evidence = [...lost]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, hashes]) => ({ name, hashes: [...hashes].sort() }))
  const parents = evidence.map(({ name, hashes }) => ({
    name,
    affectedCount: hashes.length,
  }))
  return {
    status: 'complete',
    impact: {
      parents,
      affectedCount: parents.reduce(
        (sum, parent) => sum + parent.affectedCount,
        0,
      ),
      unrecoverable: dropped,
      fingerprint: keccak256(
        toHex(
          JSON.stringify({
            migrating: migratingNames,
            copied: [
              ...new Set(params.copiedNames.map((name) => name.toLowerCase())),
            ].sort(),
            renewing: [
              ...new Set(
                params.renewingNames.map((name) => name.toLowerCase()),
              ),
            ].sort(),
            evidence,
            ...(dropped.length > 0 && { unrecoverable: dropped }),
          }),
        ),
      ),
      checkedAt: params.checkedAt,
    },
  }
}
