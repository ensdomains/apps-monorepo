import type { Address, Hex } from 'viem'
import type { MigrationCall } from './buildMigrationCalls'
import type { NameBundle } from './buildMigrationPlan'
import type { ClassifiedName, GroupedNames } from './classifyNames'
import type { Profile } from './fetchV1Profiles'

const DEFERRED_PARENT_PLACEHOLDER: Address =
  '0x00000000000000000000000000000000deadbeef'

export const calcBundleBytes = (calls: readonly MigrationCall[]): number => {
  let total = 0
  for (const c of calls) {
    total += Math.max(0, (c.data.length - 2) / 2)
    total += 64
  }
  return total
}

export const groupDeferredChildrenByParent = (
  children: readonly ClassifiedName[],
): Map<string, readonly ClassifiedName[]> => {
  const map = new Map<string, ClassifiedName[]>()
  for (const child of children) {
    if (!child.parentName) continue
    const list = map.get(child.parentName) ?? []
    list.push(child)
    map.set(child.parentName, list)
  }
  return map as Map<string, readonly ClassifiedName[]>
}

export const buildDeferredPlaceholderRegistries = (
  deferredParentNames: readonly string[],
): Map<string, Address> => {
  const map = new Map<string, Address>()
  for (const name of deferredParentNames) {
    map.set(name, DEFERRED_PARENT_PLACEHOLDER)
  }
  return map
}

export type ChildPartition = {
  readonly externalChildren: Map<string, readonly ClassifiedName[]>
  readonly deferredChildren: readonly ClassifiedName[]
  readonly deferredParentNames: readonly string[]
}

export const partitionChildrenByInPlan = (
  childNames: GroupedNames['childNames'],
  inPlanNames: ReadonlySet<string>,
): ChildPartition => {
  const externalChildren = new Map<string, readonly ClassifiedName[]>()
  const deferredChildren: ClassifiedName[] = []
  const deferredParentNames: string[] = []

  for (const [parentName, children] of childNames) {
    if (inPlanNames.has(parentName)) {
      deferredChildren.push(...children)
      deferredParentNames.push(parentName)
    } else {
      externalChildren.set(parentName, children)
    }
  }

  return { externalChildren, deferredChildren, deferredParentNames }
}

export const findNestedDeferredParents = (
  deferredChildren: readonly ClassifiedName[],
  deferredParentNames: readonly string[],
): string[] => {
  const deferredChildNames = new Set(deferredChildren.map((c) => c.domain.name))
  return deferredParentNames.filter((p) => deferredChildNames.has(p))
}

export const findUnresolvedParents = (
  externalChildren: ReadonlyMap<string, readonly ClassifiedName[]>,
  resolvedRegistries: ReadonlyMap<string, Address>,
  zeroAddr: Address,
): string[] => {
  const unresolved: string[] = []
  for (const [parentName] of externalChildren) {
    const registry = resolvedRegistries.get(parentName) ?? zeroAddr
    if (registry === zeroAddr) unresolved.push(parentName)
  }
  return unresolved
}

export const formatNamesPreview = (
  names: readonly string[],
  limit = 3,
): string => {
  const preview = names.slice(0, limit).join(', ')
  const suffix = names.length > limit ? ` (+${names.length - limit} more)` : ''
  return `${preview}${suffix}`
}

export const computePhase1Names = (
  classified: readonly ClassifiedName[],
  deferredChildren: readonly ClassifiedName[],
): ClassifiedName[] => {
  const deferredSet = new Set(deferredChildren.map((c) => c.domain.name))
  return classified.filter((c) => !deferredSet.has(c.domain.name))
}

export const collectDeferredParentNames = (
  deferredChildren: readonly ClassifiedName[],
): string[] => [
  ...new Set(
    deferredChildren
      .map((c) => c.parentName)
      .filter((n): n is string => n !== null),
  ),
]

type PackFn = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
}) => NameBundle[][]

export const packPlanBatches = (params: {
  phase1Names: readonly ClassifiedName[]
  deferredChildren: readonly ClassifiedName[]
  deferredParentNames: readonly string[]
  parentRegistries: ReadonlyMap<string, Address>
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
  pack: PackFn
}): { batches: NameBundle[][]; deferredBatches: NameBundle[][] } => {
  const {
    phase1Names,
    deferredChildren,
    deferredParentNames,
    pack,
    ...shared
  } = params

  const batches = pack({ names: phase1Names, ...shared })
  const deferredBatches =
    deferredChildren.length === 0
      ? []
      : pack({
          ...shared,
          names: deferredChildren,
          parentRegistries:
            buildDeferredPlaceholderRegistries(deferredParentNames),
        })
  return { batches, deferredBatches }
}
