import { normalizeProfileName } from '@/features/profile/service/profileName'
import type { ClassifiedName } from '../service/classifyNames'

export const NO_MANAGER_RESTORATION_PRESET =
  'eligible-no-manager-restoration' as const
export const ALL_ELIGIBLE_PRESET = 'eligible-all' as const
export type MigrationAiPreset =
  | typeof NO_MANAGER_RESTORATION_PRESET
  | typeof ALL_ELIGIBLE_PRESET

type DependencyConflict = {
  readonly name: string
  readonly excludedParent: string
}

export type MigrationAiSearch = {
  readonly preset?: MigrationAiPreset
  readonly names?: string[]
}

export const normalizeMigrationAiNames = (
  value: unknown,
):
  | { readonly status: 'ok'; readonly names: string[] }
  | { readonly status: 'invalid'; readonly message: string } => {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100)
    return {
      status: 'invalid',
      message: 'Choose between 1 and 100 exact ENS names for the upgrade.',
    }
  const normalized = value.map((name) =>
    typeof name === 'string' ? normalizeProfileName(name) : null,
  )
  if (normalized.some((name) => name === null))
    return {
      status: 'invalid',
      message: 'Every requested upgrade name must be a valid ENS name.',
    }
  return {
    status: 'ok',
    names: [
      ...new Set(normalized.filter((name): name is string => name !== null)),
    ],
  }
}

/** Invalid exact-name parameters must not broaden into the default selection. */
export const validateMigrationAiSearch = (
  search: Record<string, unknown>,
): MigrationAiSearch => {
  const preset =
    search.preset === NO_MANAGER_RESTORATION_PRESET ||
    search.preset === ALL_ELIGIBLE_PRESET
      ? search.preset
      : undefined
  if (search.names === undefined) return preset ? { preset } : {}
  const normalized = normalizeMigrationAiNames(search.names)
  if (normalized.status === 'invalid') throw new Error(normalized.message)
  return { ...(preset && { preset }), names: normalized.names }
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

const findExcludedRequestedParent = (
  item: ClassifiedName,
  byName: ReadonlyMap<string, ClassifiedName>,
  requested: ReadonlySet<string>,
  allowed: ReadonlySet<string>,
): string | null => {
  let ancestor = item.parentName?.toLowerCase() ?? null
  const visited = new Set<string>([item.domain.name.toLowerCase()])
  while (ancestor && byName.has(ancestor)) {
    if (
      visited.has(ancestor) ||
      !requested.has(ancestor) ||
      !allowed.has(ancestor)
    )
      return byName.get(ancestor)?.domain.name ?? ancestor
    visited.add(ancestor)
    ancestor = byName.get(ancestor)?.parentName?.toLowerCase() ?? null
  }
  return null
}

/** Reconcile a prompt's exact names against the freshly eligible migration set. */
export const proposeRequestedMigrationNames = (
  eligible: readonly ClassifiedName[],
  requestedNames: readonly string[],
  preset?: MigrationAiPreset,
) => {
  const byName = new Map(
    eligible.map((item) => [item.domain.name.toLowerCase(), item]),
  )
  const requested = new Set(requestedNames.map((name) => name.toLowerCase()))
  const allowed =
    preset === NO_MANAGER_RESTORATION_PRESET
      ? new Set(
          [...proposeNoManagerRestorationNames(eligible).selected].map((name) =>
            name.toLowerCase(),
          ),
        )
      : new Set(byName.keys())
  const selected = new Set<string>()
  const excluded = new Set<string>()
  const unavailable: string[] = []
  const dependencyConflicts: DependencyConflict[] = []

  for (const name of requested) {
    const item = byName.get(name)
    if (!item) {
      unavailable.push(name)
      continue
    }
    const excludedParent = findExcludedRequestedParent(
      item,
      byName,
      requested,
      allowed,
    )
    if (excludedParent) {
      excluded.add(item.domain.name)
      dependencyConflicts.push({ name: item.domain.name, excludedParent })
    } else if (allowed.has(name)) selected.add(item.domain.name)
    else excluded.add(item.domain.name)
  }
  return { selected, excluded, unavailable, dependencyConflicts }
}

export const getMigrationAiProposal = (
  eligible: readonly ClassifiedName[],
  names: readonly string[] | undefined,
  preset: MigrationAiPreset | undefined,
  isRecovering: boolean,
): {
  readonly requestedProposal?: ReturnType<typeof proposeRequestedMigrationNames>
  readonly dependencyConflicts: readonly DependencyConflict[]
} => {
  if (isRecovering) return { dependencyConflicts: [] }
  if (names) {
    const requestedProposal = proposeRequestedMigrationNames(
      eligible,
      names,
      preset,
    )
    return {
      requestedProposal,
      dependencyConflicts: requestedProposal.dependencyConflicts,
    }
  }
  if (preset === NO_MANAGER_RESTORATION_PRESET)
    return {
      dependencyConflicts:
        proposeNoManagerRestorationNames(eligible).dependencyConflicts,
    }
  return { dependencyConflicts: [] }
}
