import type { NameSummary } from '@ens-apps/indexer/reads'

export type ProfileAddressNameProtocol = 'v1' | 'v2'
export type ProfileAddressNameRoleCategory = 'owned' | 'managed'

export type ProfileAddressName = {
  readonly key: string
  readonly label: string
  readonly protocol: ProfileAddressNameProtocol
  readonly expiryDate: number | null
  readonly createdAt: number | null
  readonly nameRoles: readonly ('owner' | 'manager')[]
  readonly roleCategory: ProfileAddressNameRoleCategory
}

const MS_PER_SECOND = 1000

export const isDisplayableProfileName = (name: string): boolean =>
  !name.includes('.addr.reverse') && !name.startsWith('[')

const toSeconds = (date: Date | null): number | null =>
  date ? Math.floor(date.getTime() / MS_PER_SECOND) : null

// bigname's `owner` is the token holder; a registry controller or an ENSv2
// role holder manages.
const toNameRoles = (
  relations: NameSummary['relations'],
): ProfileAddressName['nameRoles'] => [
  ...(relations.includes('owner') ? (['owner'] as const) : []),
  ...(relations.includes('manager') || relations.includes('role_holder')
    ? (['manager'] as const)
    : []),
]

/** A row as the profile lists it, or null for one it hides. */
export const toProfileAddressName = (
  name: NameSummary,
): ProfileAddressName | null => {
  if (!isDisplayableProfileName(name.name)) return null
  const nameRoles = toNameRoles(name.relations)
  if (nameRoles.length === 0) return null
  return {
    key: name.namehash,
    label: name.name,
    protocol: name.protocol ?? 'v2',
    expiryDate: toSeconds(name.expiresAt),
    createdAt: toSeconds(name.createdAt),
    nameRoles,
    roleCategory: nameRoles.includes('owner') ? 'owned' : 'managed',
  }
}
