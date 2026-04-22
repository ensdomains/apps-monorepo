import { type ClassifiedName, is2LD } from './classifyNames'

export type NameGroup = {
  readonly parent: ClassifiedName
  readonly subnames: readonly ClassifiedName[]
}

export const groupByParent = (
  eligible: readonly ClassifiedName[],
): readonly NameGroup[] => {
  const byName = new Map<string, ClassifiedName>()
  for (const n of eligible) byName.set(n.domain.name, n)

  const subnamesByParent = new Map<string, ClassifiedName[]>()
  const roots: ClassifiedName[] = []

  for (const n of eligible) {
    if (is2LD(n)) {
      roots.push(n)
      continue
    }
    const parent = n.parentName
    if (!parent || !byName.has(parent)) continue
    const list = subnamesByParent.get(parent) ?? []
    list.push(n)
    subnamesByParent.set(parent, list)
  }

  roots.sort((a, b) => a.domain.name.localeCompare(b.domain.name))

  return roots.map((parent) => {
    const subnames = (subnamesByParent.get(parent.domain.name) ?? [])
      .slice()
      .sort((a, b) => a.domain.name.localeCompare(b.domain.name))
    return { parent, subnames }
  })
}
