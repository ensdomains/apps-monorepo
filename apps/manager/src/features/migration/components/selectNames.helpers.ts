import type { CopyClassifiedName } from '../service/classifyNames'
import type { NameTreeNode } from '../service/groupByParent'

const BULK_SELECTION_THRESHOLD = 15
const NAME_SEARCH_THRESHOLD = 9
const SMALL_SELECTION_LAYOUT_THRESHOLD = 6
const COMPACT_SELECTION_LAYOUT_THRESHOLD = 10

export const shouldShowBulkSelection = (eligibleCount: number): boolean =>
  eligibleCount >= BULK_SELECTION_THRESHOLD

export const shouldShowNameSearch = (eligibleCount: number): boolean =>
  eligibleCount >= NAME_SEARCH_THRESHOLD

export const shouldUseCompactSelectionLayout = (
  eligibleCount: number,
): boolean => eligibleCount >= COMPACT_SELECTION_LAYOUT_THRESHOLD

export const shouldUseSmallSelectionCard = (eligibleCount: number): boolean =>
  eligibleCount > 0 && eligibleCount <= SMALL_SELECTION_LAYOUT_THRESHOLD

// Mirrors when the footer quotes the upgrade: shown only once there is
// something to send from the wallet.
export const shouldShowSmartTransactionsNotice = ({
  isMetaMaskWallet,
  totalSelected,
  isFinishingRecovery,
}: {
  readonly isMetaMaskWallet: boolean
  readonly totalSelected: number
  readonly isFinishingRecovery: boolean
}): boolean => isMetaMaskWallet && (totalSelected > 0 || isFinishingRecovery)

export const collectAllSelectable = (
  groups: readonly NameTreeNode[],
  orphans: readonly NameTreeNode[],
): Set<string> => {
  const all = new Set<string>()

  const collect = (nodes: readonly NameTreeNode[]) => {
    for (const node of nodes) {
      all.add(node.item.domain.name)
      collect(node.children)
    }
  }

  collect(groups)
  collect(orphans)
  return all
}

export const buildRootSubtreeIndex = (
  groups: readonly NameTreeNode[],
  orphans: readonly NameTreeNode[],
): ReadonlyMap<string, ReadonlySet<string>> => {
  const rootSubtrees = new Map<string, ReadonlySet<string>>()
  const collectSubtree = (node: NameTreeNode): ReadonlySet<string> => {
    const subtreeNames = new Set<string>([node.item.domain.name])
    for (const child of node.children) {
      const childSubtree = collectSubtree(child)
      for (const childName of childSubtree) subtreeNames.add(childName)
    }
    return subtreeNames
  }

  for (const root of [...groups, ...orphans]) {
    rootSubtrees.set(root.item.domain.name, collectSubtree(root))
  }
  return rootSubtrees
}

export const toggleRootSubtree = (
  prev: ReadonlySet<string>,
  name: string,
  rootSubtrees: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> => {
  const subtreeNames = rootSubtrees.get(name)
  if (!subtreeNames) return new Set(prev)

  const next = new Set(prev)
  if (next.has(name)) {
    for (const subtreeName of subtreeNames) next.delete(subtreeName)
    return next
  }

  for (const subtreeName of subtreeNames) next.add(subtreeName)
  return next
}

const matchesQuery = (name: string, q: string): boolean =>
  name.toLowerCase().includes(q)

export const includeSubnamesInTree = (
  nodes: readonly NameTreeNode[],
  includedSubnames: ReadonlyMap<string, readonly CopyClassifiedName[]>,
): readonly NameTreeNode[] =>
  nodes.map((node) => {
    const children = new Map(
      node.children.map((child) => [child.item.domain.name, child]),
    )
    for (const item of includedSubnames.get(node.item.domain.name) ?? []) {
      children.set(item.domain.name, {
        item,
        children: children.get(item.domain.name)?.children ?? [],
      })
    }
    return {
      ...node,
      children: includeSubnamesInTree(
        [...children.values()].sort((a, b) =>
          a.item.domain.name.localeCompare(b.item.domain.name),
        ),
        includedSubnames,
      ),
    }
  })

const filterNodeBySearch = (
  node: NameTreeNode,
  searchLower: string,
): NameTreeNode | null => {
  if (matchesQuery(node.item.domain.name, searchLower)) return node

  const children = node.children.flatMap((child) => {
    const filtered = filterNodeBySearch(child, searchLower)
    return filtered ? [filtered] : []
  })
  return children.length > 0 ? { ...node, children } : null
}

const filterTreesBySearch = (
  nodes: readonly NameTreeNode[],
  searchLower: string,
): readonly NameTreeNode[] => {
  if (!searchLower) return nodes
  return nodes.flatMap((node) => {
    const filtered = filterNodeBySearch(node, searchLower)
    return filtered ? [filtered] : []
  })
}

export const filterGroupsBySearch = filterTreesBySearch

export const filterOrphansBySearch = filterTreesBySearch
