import type { NameRow } from './columns'

/** Options within a filter are ORed; level and roles are ANDed. */
export const filterNameRows = (
  names: NameRow[],
  levels: readonly string[],
  roles: readonly string[],
): NameRow[] =>
  names.filter((row) => {
    const depth = row.name?.split('.').length ?? 0
    const matchesLevel =
      levels.length === 0 ||
      (depth === 2 && levels.includes('2ld')) ||
      (depth > 2 && levels.includes('subname'))
    const matchesRole =
      roles.length === 0 ||
      (row.protocolVersion === 'ENSv1' &&
        row.relations.some((relation) => roles.includes(relation))) ||
      (row.protocolVersion === 'ENSv2' &&
        row.registryRoles?.some((role) => roles.includes(`v2:${role}`)))
    return matchesLevel && matchesRole
  })
