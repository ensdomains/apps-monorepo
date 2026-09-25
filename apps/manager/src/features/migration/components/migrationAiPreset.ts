import type { ClassifiedName } from '../service/classifyNames'

export const NO_MANAGER_RESTORATION_PRESET =
  'eligible-no-manager-restoration' as const

type DependencyConflict = {
  readonly name: string
  readonly excludedParent: string
}

/**
 * A proposed selection only: the migration flow still checks current
 * eligibility, permissions, prices and wallet confirmation before submitting.
 */
export const proposeNoManagerRestorationNames = (
  eligible: readonly ClassifiedName[],
): {
  readonly selected: ReadonlySet<string>
  readonly excluded: ReadonlySet<string>
  readonly dependencyConflicts: readonly DependencyConflict[]
} => {
  const byName = new Map(
    eligible.map((item) => [item.domain.name.toLowerCase(), item]),
  )
  const managerRestoration = new Set(
    eligible
      .filter((item) => item.managerAddress !== null)
      .map((item) => item.domain.name.toLowerCase()),
  )
  const selected = new Set<string>()
  const excluded = new Set<string>()
  const dependencyConflicts: DependencyConflict[] = []

  for (const item of eligible) {
    const name = item.domain.name
    const normalized = name.toLowerCase()
    if (managerRestoration.has(normalized)) {
      excluded.add(name)
      continue
    }

    let ancestor = item.parentName?.toLowerCase() ?? null
    const visited = new Set<string>()
    let excludedParent: string | null = null
    while (ancestor && byName.has(ancestor) && !visited.has(ancestor)) {
      visited.add(ancestor)
      if (managerRestoration.has(ancestor)) {
        excludedParent = byName.get(ancestor)?.domain.name ?? ancestor
        break
      }
      ancestor = byName.get(ancestor)?.parentName?.toLowerCase() ?? null
    }

    if (excludedParent) {
      excluded.add(name)
      dependencyConflicts.push({ name, excludedParent })
      continue
    }

    selected.add(name)
  }

  return { selected, excluded, dependencyConflicts }
}
