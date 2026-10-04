import type { Grant, Power, RoleSummaryEntry } from './types'

const sameAddress = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase()

/** Grants held by `address` in a `role_summary` (address compared case-insensitively). */
export const grantsForAddress = (
  roleSummary: readonly RoleSummaryEntry[] | undefined,
  address: string,
): readonly Grant[] =>
  (roleSummary ?? [])
    .filter((entry) => sameAddress(entry.address, address))
    .flatMap((entry) => entry.grants)

/** Distinct powers `address` holds across every grant scope, in first-seen order. */
export const powersForAddress = (
  roleSummary: readonly RoleSummaryEntry[] | undefined,
  address: string,
): readonly Power[] => [
  ...new Set(
    grantsForAddress(roleSummary, address).flatMap((grant) => grant.powers),
  ),
]

/**
 * Whether `address` holds any grant. Role summaries are partial by contract
 * (check `meta.completeness`), so `false` is not proof of no permissions.
 */
export const hasAnyGrant = (
  roleSummary: readonly RoleSummaryEntry[] | undefined,
  address: string,
): boolean =>
  grantsForAddress(roleSummary, address).some(
    (grant) => grant.powers.length > 0,
  )

export const hasPower = (
  roleSummary: readonly RoleSummaryEntry[] | undefined,
  address: string,
  power: Power,
): boolean => powersForAddress(roleSummary, address).includes(power)

/** ENSv2 admin roles: `admin_*` and `can_transfer_admin`. */
export const isAdminPower = (power: Power): boolean =>
  power.startsWith('admin_') || power === 'can_transfer_admin'
