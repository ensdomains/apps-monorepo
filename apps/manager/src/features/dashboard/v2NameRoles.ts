import type { DomainFragment } from '@ens-apps/indexer'
import type { DashboardNameRole, DashboardV2Name } from './mergedNames'

export type V2RoleAssignment = {
  readonly name: string | null
  readonly roleBitmap: string
}

const OWNER_ROLES = ['owner'] as const satisfies readonly DashboardNameRole[]
const OWNER_MANAGER_ROLES = [
  'owner',
  'manager',
] as const satisfies readonly DashboardNameRole[]

const normalizeName = (name: string | null | undefined): string | null =>
  name ? name.toLowerCase() : null

const bitmapToBigInt = (bitmap: string | undefined): bigint | null => {
  if (!bitmap) return null
  try {
    return BigInt(bitmap)
  } catch {
    return null
  }
}

const getRoleBitmapByName = (
  assignments: readonly V2RoleAssignment[],
): ReadonlyMap<string, string> => {
  const roleBitmapByName = new Map<string, string>()

  for (const assignment of assignments) {
    const name = normalizeName(assignment.name)
    if (!name) continue

    const existing = roleBitmapByName.get(name)
    const next = assignment.roleBitmap
    const nextValue = bitmapToBigInt(next)
    const existingValue = bitmapToBigInt(existing)

    if (
      nextValue !== null &&
      (existingValue === null || nextValue > existingValue)
    ) {
      roleBitmapByName.set(name, next)
    }
  }

  return roleBitmapByName
}

const hasRoleAssignment = (
  domain: DomainFragment,
  roleBitmapByName: ReadonlyMap<string, string>,
): boolean => {
  const names = [domain.normalizedName, domain.name]
    .map(normalizeName)
    .filter((name): name is string => !!name)

  return names.some((name) => {
    const bitmap = bitmapToBigInt(roleBitmapByName.get(name))
    return bitmap !== null && bitmap !== 0n
  })
}

export const applyV2RoleAssignments = (
  domains: readonly DomainFragment[],
  assignments: readonly V2RoleAssignment[],
): DashboardV2Name[] => {
  const roleBitmapByName = getRoleBitmapByName(assignments)

  return domains.map((domain) => ({
    ...domain,
    nameRoles: hasRoleAssignment(domain, roleBitmapByName)
      ? OWNER_MANAGER_ROLES
      : OWNER_ROLES,
  }))
}
