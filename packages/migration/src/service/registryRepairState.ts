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

/** Every label registered and every account whose roles changed, as read from the registry's logs. */
export type RegistryCandidates = {
  readonly labels: readonly string[]
  readonly accounts: readonly Address[]
  /** Every role write, in order, with the bitmap it left. */
  readonly roleChanges: readonly RoleChange[]
}

export type RoleChange = {
  readonly resource: bigint
  readonly account: Address
  readonly roleBitmap: bigint
}

/** Each label and account once; logs repeat both. */
export const uniqueCandidates = ({
  labels,
  accounts,
  roleChanges,
}: RegistryCandidates): RegistryCandidates => ({
  labels: [...new Set(labels)],
  roleChanges,
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

/** Each account's explicit roles on `resource`: the bitmap its last role write left. */
export const explicitGrantsAt = (
  changes: readonly RoleChange[],
  resource: bigint | undefined,
): readonly RoleGrant[] =>
  resource === undefined
    ? []
    : changes
        .filter((change) => change.resource === resource)
        .filter(
          (change, i, onResource) =>
            !onResource
              .slice(i + 1)
              .some((later) => isAddressEqual(later.account, change.account)),
        )
        .map(({ account, roleBitmap }) => ({ account, roleBitmap }))
        .filter((grant) => grant.roleBitmap !== 0n)
