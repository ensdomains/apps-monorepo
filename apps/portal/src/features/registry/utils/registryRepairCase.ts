import { REGISTRY_REPAIR_ROOT_ROLES } from '@ens-apps/migration'
import { match, P } from 'ts-pattern'

/** How the connected account relates to a registry that needs an upgrade, which decides the notice it sees. */
export type RegistryRepairCase =
  | 'unaffected'
  | 'unknown'
  | 'can-upgrade'
  | 'viewer'

export const getRegistryRepairCase = ({
  isPendingUpgrade,
  isConnected,
  canSwitchParent,
  rootRoles,
}: {
  readonly isPendingUpgrade: boolean | undefined
  readonly isConnected: boolean
  /** The account can point the parent name at a replacement registry. */
  readonly canSwitchParent: boolean | undefined
  /** The account's root roles on the registry being upgraded. */
  readonly rootRoles: bigint | undefined
}): RegistryRepairCase =>
  match({ isPendingUpgrade, isConnected, canSwitchParent, rootRoles })
    .with({ isPendingUpgrade: false }, () => 'unaffected' as const)
    .with({ isPendingUpgrade: undefined }, () => 'unknown' as const)
    .with({ isConnected: false }, () => 'viewer' as const)
    .with({ canSwitchParent: false }, () => 'viewer' as const)
    .with(
      P.union({ canSwitchParent: undefined }, { rootRoles: undefined }),
      () => 'unknown' as const,
    )
    .with({ rootRoles: P.bigint }, ({ rootRoles }) =>
      (rootRoles & REGISTRY_REPAIR_ROOT_ROLES) === REGISTRY_REPAIR_ROOT_ROLES
        ? ('can-upgrade' as const)
        : ('viewer' as const),
    )
    .otherwise(() => 'unknown' as const)

/** Keeps the card up while the case briefly reads as unknown (a refetch on focus), so an upgrade in progress isn't torn down. */
export const shouldShowUpgradeCard = ({
  repairCase,
  wasShown,
}: {
  readonly repairCase: RegistryRepairCase
  readonly wasShown: boolean
}): boolean =>
  repairCase === 'can-upgrade' || (repairCase === 'unknown' && wasShown)
