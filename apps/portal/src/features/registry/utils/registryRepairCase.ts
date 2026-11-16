import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { match, P } from 'ts-pattern'

/** How the connected account relates to a registry that needs an upgrade, which decides the notice it sees. */
export type RegistryRepairCase =
  | 'unaffected'
  | 'unknown'
  | 'can-upgrade'
  | 'viewer'

/** Root roles the copy needs on the old registry: registering the names and setting the new registry's parent. */
const UPGRADE_ROOT_ROLES =
  registryRoles.ROLE_REGISTRAR | registryRoles.ROLE_SET_PARENT

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
      (rootRoles & UPGRADE_ROOT_ROLES) === UPGRADE_ROOT_ROLES
        ? ('can-upgrade' as const)
        : ('viewer' as const),
    )
    .otherwise(() => 'unknown' as const)
