import { type ClassifiedName, is2LD } from './classifyNames'

export type NameTreeNode = {
  readonly item: ClassifiedName
  readonly children: readonly NameTreeNode[]
}

export type GroupedForUi = {
  readonly groups: readonly NameTreeNode[]
  readonly orphans: readonly NameTreeNode[]
}

const compareByName = (a: ClassifiedName, b: ClassifiedName): number =>
  a.domain.name.localeCompare(b.domain.name)

const buildTreeNode = (
  item: ClassifiedName,
  childrenByParent: ReadonlyMap<string, readonly ClassifiedName[]>,
): NameTreeNode => ({
  item,
  children: [...(childrenByParent.get(item.domain.name) ?? [])]
    .sort(compareByName)
    .map((child) => buildTreeNode(child, childrenByParent)),
})

export const groupByParent = (
  eligible: readonly ClassifiedName[],
): GroupedForUi => {
  const namesByName = new Map<string, ClassifiedName>()
  for (const n of eligible) namesByName.set(n.domain.name, n)

  const subnamesByParent = new Map<string, ClassifiedName[]>()
  const roots: ClassifiedName[] = []

  for (const n of eligible) {
    const parent = n.parentName
    if (!parent || !namesByName.has(parent)) {
      roots.push(n)
      continue
    }

    const list = subnamesByParent.get(parent) ?? []
    list.push(n)
    subnamesByParent.set(parent, list)
  }

  const sortedRoots = [...roots].sort(compareByName)
  const groups = sortedRoots
    .filter(is2LD)
    .map((root) => buildTreeNode(root, subnamesByParent))
  const orphans = sortedRoots
    .filter((root) => !is2LD(root))
    .map((root) => buildTreeNode(root, subnamesByParent))

  return { groups, orphans }
}
