import type { ClassifiedName } from './classifyNames'

export type IncludedSubnameParent = {
  readonly name: string
  readonly subnameCount: number
}

/** Parents in the prepared plan whose direct subnames are recreated with them, by name. */
export const getIncludedSubnameParents = (
  names: readonly ClassifiedName[],
): readonly IncludedSubnameParent[] => {
  const roots = names.flatMap((name) =>
    name.action === 'copy' && name.recreationRoot ? [name.recreationRoot] : [],
  )
  return [...new Set(roots)]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      subnameCount: roots.filter((root) => root === name).length,
    }))
}
