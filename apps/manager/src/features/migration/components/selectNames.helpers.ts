import type { ClassifiedName } from '../service/classifyNames'
import type { NameGroup } from '../service/groupByParent'

const DESELECT_ALL_THRESHOLD = 15

export type BulkSelectionAction = 'select-all' | 'deselect-all'

export const collectAllSelectable = (
  groups: readonly NameGroup[],
  orphans: readonly ClassifiedName[],
): Set<string> => {
  const all = new Set<string>()
  for (const group of groups) {
    all.add(group.parent.domain.name)
    for (const sub of group.subnames) all.add(sub.domain.name)
  }
  for (const orphan of orphans) all.add(orphan.domain.name)
  return all
}

export const toggleName = (
  prev: ReadonlySet<string>,
  name: string,
): Set<string> => {
  const next = new Set(prev)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  return next
}

export const toggleGroup = (
  prev: ReadonlySet<string>,
  parentName: string,
  subnameNames: readonly string[],
): Set<string> => {
  const next = new Set(prev)
  if (next.has(parentName)) {
    next.delete(parentName)
    for (const sub of subnameNames) next.delete(sub)
  } else {
    next.add(parentName)
    for (const sub of subnameNames) next.add(sub)
  }
  return next
}

const matchesQuery = (name: string, q: string): boolean =>
  name.toLowerCase().includes(q)

export const filterGroupsBySearch = (
  groups: readonly NameGroup[],
  searchLower: string,
): readonly NameGroup[] => {
  if (!searchLower) return groups
  return groups.filter(
    (g) =>
      matchesQuery(g.parent.domain.name, searchLower) ||
      g.subnames.some((s) => matchesQuery(s.domain.name, searchLower)),
  )
}

export const filterOrphansBySearch = (
  orphans: readonly ClassifiedName[],
  searchLower: string,
): readonly ClassifiedName[] => {
  if (!searchLower) return orphans
  return orphans.filter((o) => matchesQuery(o.domain.name, searchLower))
}

export const countVisibleRows = (
  groups: readonly NameGroup[],
  orphans: readonly ClassifiedName[],
): number =>
  groups.reduce((acc, g) => acc + 1 + g.subnames.length, 0) + orphans.length

export const shouldShowBulkSelection = (totalNames: number): boolean =>
  totalNames >= DESELECT_ALL_THRESHOLD

export const getBulkSelectionAction = (
  totalSelected: number,
): BulkSelectionAction => (totalSelected === 0 ? 'select-all' : 'deselect-all')
