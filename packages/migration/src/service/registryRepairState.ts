import {
  type Address,
  type Hex,
  isAddressEqual,
  keccak256,
  stringToHex,
  zeroAddress,
} from 'viem'

export type RoleGrant = {
  readonly account: Address
  readonly roleBitmap: bigint
}

/** One live name in a registry, with every account holding roles on it (its owner included). */
export type RegistryRepairName = {
  readonly label: string
  readonly owner: Address
  readonly subregistry: Address
  readonly resolver: Address
  readonly expiry: bigint
  readonly roles: readonly RoleGrant[]
}

/** What a registry holds that a copy has to reproduce. */
export type RegistryRepairState = {
  readonly parentRegistry: Address
  readonly parentLabel: string
  /** The parent name's token id in `parentRegistry`, for its `setSubregistry`. */
  readonly parentTokenId: bigint
  readonly rootRoles: readonly RoleGrant[]
  readonly names: readonly RegistryRepairName[]
  /** Labels registered once but expired or unregistered now; a copy can't re-register them. */
  readonly expiredLabels: readonly string[]
}

export type RegistryRepairCall = {
  readonly to: Address
  readonly data: Hex
  readonly value: bigint
}

/** A label's id from its literal text; `labelhash` would read a `[<64 hex>]` label as already hashed. */
export const literalLabelId = (label: string): bigint =>
  BigInt(keccak256(stringToHex(label)))

export const rolesOf = (
  grants: readonly RoleGrant[],
  account: Address,
): bigint =>
  grants
    .filter((grant) => isAddressEqual(grant.account, account))
    .reduce((bitmap, grant) => bitmap | grant.roleBitmap, 0n)

export const accountsIn = (
  grants: readonly RoleGrant[],
): readonly Address[] => [
  ...new Map(
    grants.map((grant) => [grant.account.toLowerCase(), grant.account]),
  ).values(),
]

/** Names a copy re-registers (owned, unexpired at `now`), and the labels it can't because they expired or were unregistered. */
export const splitRepairNames = (
  names: readonly RegistryRepairName[],
  now: bigint,
): Pick<RegistryRepairState, 'names' | 'expiredLabels'> => ({
  names: names.filter(
    (name) => !isAddressEqual(name.owner, zeroAddress) && name.expiry > now,
  ),
  expiredLabels: names
    .filter((name) => name.expiry !== 0n && name.expiry <= now)
    .map((name) => name.label),
})

/** A name's grants without the owner's roles that `roles()` adds for accounts the owner approved for all; approvals aren't copied. */
export const explicitNameGrants = ({
  grants,
  owner,
  approvedAccounts,
}: {
  readonly grants: readonly RoleGrant[]
  readonly owner: Address
  readonly approvedAccounts: readonly Address[]
}): readonly RoleGrant[] => {
  const ownerRoles = rolesOf(grants, owner)
  return grants
    .map((grant) =>
      !isAddressEqual(grant.account, owner) &&
      approvedAccounts.some((approved) =>
        isAddressEqual(approved, grant.account),
      )
        ? { ...grant, roleBitmap: grant.roleBitmap & ~ownerRoles }
        : grant,
    )
    .filter((grant) => grant.roleBitmap !== 0n)
}

/** Every label registered and every account whose roles changed, as read from the registry's logs. */
export type RegistryCandidates = {
  readonly labels: readonly string[]
  readonly accounts: readonly Address[]
}

/** Each label and account once; logs repeat both. */
export const uniqueCandidates = ({
  labels,
  accounts,
}: RegistryCandidates): RegistryCandidates => ({
  labels: [...new Set(labels)],
  accounts: accounts.filter(
    (account, i) =>
      accounts.findIndex((other) => isAddressEqual(other, account)) === i,
  ),
})

/** An account's roles from one `roles()` read each, skipping accounts without any. */
export const grantsOf = (
  accounts: readonly Address[],
  bitmaps: readonly bigint[],
): readonly RoleGrant[] =>
  accounts
    .map((account, i) => ({ account, roleBitmap: bitmaps[i] ?? 0n }))
    .filter((grant) => grant.roleBitmap !== 0n)

/** Each name's grants from one flat read of every name's roles for every account, name by name. */
export const nameGrantsOf = (
  accounts: readonly Address[],
  bitmaps: readonly bigint[],
  nameCount: number,
): readonly (readonly RoleGrant[])[] =>
  Array.from({ length: nameCount }, (_, i) =>
    grantsOf(
      accounts,
      bitmaps.slice(i * accounts.length, (i + 1) * accounts.length),
    ),
  )
