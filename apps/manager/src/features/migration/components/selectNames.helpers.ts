import type { NameTreeNode } from '../service/groupByParent'

export const BULK_SELECTION_THRESHOLD = 15
export const NAME_SEARCH_THRESHOLD = 9
export const SMALL_SELECTION_LAYOUT_THRESHOLD = 6
export const COMPACT_SELECTION_LAYOUT_THRESHOLD = 10

export const shouldShowBulkSelection = (eligibleCount: number): boolean =>
  eligibleCount >= BULK_SELECTION_THRESHOLD

export const shouldShowNameSearch = (eligibleCount: number): boolean =>
  eligibleCount >= NAME_SEARCH_THRESHOLD

export const shouldUseCompactSelectionLayout = (
  eligibleCount: number,
): boolean => eligibleCount >= COMPACT_SELECTION_LAYOUT_THRESHOLD

export const shouldUseSmallSelectionCard = (eligibleCount: number): boolean =>
  eligibleCount > 0 && eligibleCount <= SMALL_SELECTION_LAYOUT_THRESHOLD

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

export type NameTreeIndex = {
  readonly ancestorsByName: ReadonlyMap<string, readonly string[]>
  readonly subtreeNamesByName: ReadonlyMap<string, ReadonlySet<string>>
}

export const buildNameTreeIndex = (
  groups: readonly NameTreeNode[],
  orphans: readonly NameTreeNode[],
): NameTreeIndex => {
  const ancestorsByName = new Map<string, readonly string[]>()
  const subtreeNamesByName = new Map<string, ReadonlySet<string>>()

  const indexNode = (
    node: NameTreeNode,
    ancestors: readonly string[],
  ): ReadonlySet<string> => {
    const name = node.item.domain.name
    ancestorsByName.set(name, ancestors)

    const subtreeNames = new Set<string>([name])
    for (const child of node.children) {
      const childSubtree = indexNode(child, [...ancestors, name])
      for (const childName of childSubtree) subtreeNames.add(childName)
    }
    subtreeNamesByName.set(name, subtreeNames)
    return subtreeNames
  }

  for (const root of [...groups, ...orphans]) indexNode(root, [])
  return { ancestorsByName, subtreeNamesByName }
}

export const toggleTreeNode = (
  prev: ReadonlySet<string>,
  name: string,
  index: NameTreeIndex,
): Set<string> => {
  const subtreeNames = index.subtreeNamesByName.get(name)
  if (!subtreeNames) return new Set(prev)

  const next = new Set(prev)
  if (next.has(name)) {
    for (const subtreeName of subtreeNames) next.delete(subtreeName)
    return next
  }

  for (const ancestor of index.ancestorsByName.get(name) ?? []) {
    next.add(ancestor)
  }
  for (const subtreeName of subtreeNames) next.add(subtreeName)
  return next
}

const matchesQuery = (name: string, q: string): boolean =>
  name.toLowerCase().includes(q)

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

const countTreeRows = (nodes: readonly NameTreeNode[]): number =>
  nodes.reduce((count, node) => count + 1 + countTreeRows(node.children), 0)

export const countVisibleRows = (
  groups: readonly NameTreeNode[],
  orphans: readonly NameTreeNode[],
): number => countTreeRows(groups) + countTreeRows(orphans)
