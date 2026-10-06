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

// bigname's `owner` is the token holder and `registrant` the ENSv1 registrar
// holder, both owners here; `manager` is the registry controller or an ENSv2
// role holder.
const toNameRoles = (
  relations: NameSummary['relations'],
): ProfileAddressName['nameRoles'] => [
  ...(relations.includes('owner') || relations.includes('registrant')
    ? (['owner'] as const)
    : []),
  ...(relations.includes('manager') ? (['manager'] as const) : []),
]

const byCreatedDesc = (
  left: ProfileAddressName,
  right: ProfileAddressName,
): number =>
  (right.createdAt ?? Number.NEGATIVE_INFINITY) -
    (left.createdAt ?? Number.NEGATIVE_INFINITY) ||
  left.label.localeCompare(right.label)

/** Every name the address owns or manages, newest first, as the profile lists them. */
export const toProfileAddressNames = (
  names: readonly NameSummary[],
): readonly ProfileAddressName[] =>
  names
    .filter((name) => isDisplayableProfileName(name.name))
    .map((name): ProfileAddressName => {
      const nameRoles = toNameRoles(name.relations)
      return {
        key: name.namehash,
        label: name.name,
        protocol: name.protocol ?? 'v2',
        expiryDate: toSeconds(name.expiresAt),
        createdAt: toSeconds(name.createdAt),
        nameRoles,
        roleCategory: nameRoles.includes('owner') ? 'owned' : 'managed',
      }
    })
    .filter((name) => name.nameRoles.length > 0)
    .sort(byCreatedDesc)
