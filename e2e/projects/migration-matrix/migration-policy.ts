import type { Configuration } from './seed.js'

export const INDEPENDENT_GRACE_MIGRATION_RULE =
  'MIGRATION-GRACE-01 — user confirmed: allow independent active emancipated subname migration while its V2 ancestor is in grace'

export function requiresIndependentGraceMigration(c: Configuration) {
  return (
    c.level !== '2LD' &&
    c.root_type === 'Locked' &&
    c.wrapping === 'Wrapped' &&
    ['Locked', 'Detached'].includes(c.lock) &&
    c.name_expiry === 'Active' &&
    c.parent_migrated === 'Yes' &&
    c.root_lifecycle_version === 'V2' &&
    c.root_lifecycle === 'Grace'
  )
}
