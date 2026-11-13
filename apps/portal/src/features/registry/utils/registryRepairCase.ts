import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'

/** How the connected account relates to a registry that needs an update, which decides the notice it sees. */
export type RegistryRepairCase =
  | 'unaffected'
  | 'unknown'
  | 'owns-all'
  | 'shared'
  | 'subname-owner'
  | 'viewer'

export const getRegistryRepairCase = ({
  isPendingUpgrade,
  account,
  canRepair,
  subnameOwners,
}: {
  readonly isPendingUpgrade: boolean | undefined
  readonly account: Address | undefined
  /** The account can point the parent name at a replacement registry. */
  readonly canRepair: boolean | undefined
  /** The owner of every live subname in the registry. */
  readonly subnameOwners: readonly Address[] | undefined
}): RegistryRepairCase =>
  match({ isPendingUpgrade, account, canRepair, subnameOwners })
    .with({ isPendingUpgrade: false }, () => 'unaffected' as const)
    .with({ isPendingUpgrade: undefined }, () => 'unknown' as const)
    .with({ account: undefined }, () => 'viewer' as const)
    .with(
      P.union({ canRepair: undefined }, { subnameOwners: undefined }),
      () => 'unknown' as const,
    )
    .with(
      { account: P.string, canRepair: P.boolean, subnameOwners: P.array() },
      ({ account, canRepair, subnameOwners }) => {
        const isOwner = (owner: Address) => isAddressEqual(owner, account)
        if (canRepair)
          return subnameOwners.every(isOwner) ? 'owns-all' : 'shared'
        return subnameOwners.some(isOwner) ? 'subname-owner' : 'viewer'
      },
    )
    .exhaustive()
