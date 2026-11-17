import { match, P } from 'ts-pattern'
import type { RegistryOccupants } from '../hooks/useRegistryOccupants'

/** How the connected account relates to a registry that needs an upgrade: `owns-all` is Case A (WEB-2168), `shared` is Case B (WEB-2169). */
export type RegistryRepairCase =
  | 'unaffected'
  | 'unknown'
  | 'owns-all'
  | 'shared'
  | 'viewer'

export const getRegistryRepairCase = ({
  isPendingUpgrade,
  isConnected,
  canSwitchParent,
  occupants,
}: {
  readonly isPendingUpgrade: boolean | undefined
  readonly isConnected: boolean
  /** The account can point the parent name at a replacement registry; the upgrade makes it an admin of the replacement if it isn't one. */
  readonly canSwitchParent: boolean | undefined
  /** The registry's subnames and how many someone else holds; null when bigname can't count them. */
  readonly occupants: RegistryOccupants | null | undefined
}): RegistryRepairCase =>
  match({
    isPendingUpgrade,
    isConnected,
    canSwitchParent,
    occupants,
  })
    .with({ isPendingUpgrade: false }, () => 'unaffected' as const)
    .with({ isPendingUpgrade: undefined }, () => 'unknown' as const)
    .with({ isConnected: false }, () => 'viewer' as const)
    .with({ canSwitchParent: false }, () => 'viewer' as const)
    .with({ canSwitchParent: undefined }, () => 'unknown' as const)
    // Unconfirmed ownership never surfaces an upgrade.
    .with({ occupants: P.nullish }, () => 'unknown' as const)
    .with({ occupants: { thirdPartyCount: 0 } }, () => 'owns-all' as const)
    .otherwise(() => 'shared' as const)

/** Keeps the card up while the case briefly reads as unknown (a refetch on focus), so an upgrade in progress isn't torn down. */
export const shouldShowUpgradeCard = ({
  repairCase,
  wasShown,
}: {
  readonly repairCase: RegistryRepairCase
  readonly wasShown: boolean
}): boolean =>
  repairCase === 'owns-all' || (repairCase === 'unknown' && wasShown)

/** Case C (WEB-2170): the connected account holds a subname in an outdated registry that someone else controls. */
export const shouldShowSubnameOwnerNotice = ({
  isV2,
  isOwner,
  isSubname,
  isPendingUpgrade,
  canUpgradeRegistry,
}: {
  readonly isV2: boolean
  readonly isOwner: boolean
  /** A 2LD sits in the .eth registry, which is never upgraded this way. */
  readonly isSubname: boolean
  /** The registry holding the subname runs an outdated implementation. */
  readonly isPendingUpgrade: boolean | undefined
  /** The account can point the parent name at a new registry. */
  readonly canUpgradeRegistry: boolean | undefined
}): boolean =>
  isV2 &&
  isOwner &&
  isSubname &&
  isPendingUpgrade === true &&
  canUpgradeRegistry === false

/** The subnames the upgrade card says will carry over; without a count it doesn't guess one. */
export const carriedSubnamesText = (count: number | undefined): string =>
  match(count)
    .with(undefined, () => 'Your subnames and their settings')
    .with(1, () => 'Your 1 subname and its settings')
    .otherwise((n) => `Your ${n} subnames and their settings`)
