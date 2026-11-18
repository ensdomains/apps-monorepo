import { match, P } from 'ts-pattern'
import { type Address, isAddressEqual } from 'viem'
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

/** Case B (WEB-2169) is offered only once every known Case B registry has passed the rehearsal. */
export const IS_CASE_B_UPGRADE_OFFERED = false

/** Keeps the card up while the case briefly reads as unknown (a refetch on focus), so an upgrade in progress isn't torn down. */
export const shouldShowUpgradeCard = ({
  repairCase,
  wasShown,
  isCaseBOffered,
}: {
  readonly repairCase: RegistryRepairCase
  readonly wasShown: boolean
  readonly isCaseBOffered: boolean
}): boolean =>
  repairCase === 'owns-all' ||
  (repairCase === 'shared' && isCaseBOffered) ||
  (repairCase === 'unknown' && wasShown)

/** A page about one registry shows the card only while the name still points at that registry. */
export const isUpgradeCardForPage = ({
  pageRegistry,
  nameRegistry,
}: {
  readonly pageRegistry: Address | undefined
  readonly nameRegistry: Address | undefined
}): boolean =>
  pageRegistry === undefined ||
  (nameRegistry !== undefined && isAddressEqual(pageRegistry, nameRegistry))

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
const carriedSubnamesText = (count: number | undefined): string =>
  match(count)
    .with(undefined, () => 'Your subnames and their settings')
    .with(1, () => 'Your 1 subname and its settings')
    .otherwise((n) => `Your ${n} subnames and their settings`)

const sharedSubnamesText = (count: number, othersCount: number): string =>
  count === 1
    ? 'Its 1 subname, owned by someone else, and its settings'
    : `All ${count} subnames, including ${othersCount} owned by others, and their settings`

/** The upgrade card's text: Case A as written in WEB-2168; Case B (others own subnames) promises nothing to the upgrader. */
export const upgradeCardText = ({
  count,
  othersCount,
}: {
  readonly count: number | undefined
  readonly othersCount: number | undefined
}): string => {
  const isShared = count !== undefined && (othersCount ?? 0) > 0
  const opening = isShared
    ? 'Upgrade it so subnames can be created and roles changed again.'
    : 'Upgrade it to create subnames or change roles.'
  const carried = isShared
    ? sharedSubnamesText(count, othersCount ?? 0)
    : carriedSubnamesText(count)
  return `This registry runs on an older version that has since been fixed. ${opening} ${carried} will carry over. Inform other users of the registry to use the newly upgraded registry going forward.`
}

const MAX_LISTED_NAMES = 3

const describeOthers = (
  known: readonly string[],
  hasUnlisted: boolean,
): string => {
  const listed = known.slice(0, MAX_LISTED_NAMES)
  if (listed.length === 0) return 'other names'
  const isCut = hasUnlisted || known.length > listed.length
  return isCut ? `${listed.join(', ')} and others` : listed.join(', ')
}

/** Tells the upgrader which other names share the registry, since only `name` moves; null when none do. */
export const sharedRegistryText = ({
  name,
  referencedBy,
  hasMore,
}: {
  readonly name: string
  readonly referencedBy: readonly { readonly name: string | null }[]
  readonly hasMore: boolean
}): string | null => {
  const others = referencedBy.filter(
    (entry) => entry.name?.toLowerCase() !== name.toLowerCase(),
  )
  if (others.length === 0 && !hasMore) return null
  const known = others.flatMap((entry) => (entry.name ? [entry.name] : []))
  const subject = describeOthers(known, hasMore || known.length < others.length)
  if (others.length === 1 && known.length === 1 && !hasMore)
    return `This registry is also used by ${subject}. Upgrading only moves ${name}: ${subject} keeps the old registry until its owner upgrades it or points it at ${name}'s new registry.`
  return `This registry is also used by ${subject}. Upgrading only moves ${name}: those names keep the old registry until their owners upgrade them or point them at ${name}'s new registry.`
}
