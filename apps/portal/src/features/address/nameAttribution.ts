import { getNameType } from '@ensdomains/ensjs/utils'
import { type Address, isAddress, isAddressEqual } from 'viem'
import { groupEventsByTransactionId } from '@/utils/history/groupEventsByTransactionId'
import type { NameHistoryGroup } from '@/utils/history/transformAddressHistory'

/**
 * How a name came to be associated with an address.
 *
 * - `acquired` — the address took the name from the registrar, or demonstrably
 *   interacted with it on chain. Its history is the address's own history.
 * - `assigned` — the registry lists the address as owner, but nothing shows the
 *   address ever asked for the name. Whoever owns a parent name can do this
 *   unilaterally in a single `setSubnodeRecord` call, choosing the owner *and* the
 *   resolver that authors the name's records, so such a name's events are content
 *   written by a stranger, not the address's history.
 */
type NameAttribution = 'acquired' | 'assigned'

/**
 * The provenance signals a name carries, expressed the same way for both protocol
 * versions.
 */
type AttributableName = {
  /** Full name, used only to tell a registrar-issued .eth 2LD from a registry subname. */
  readonly name: string | null | undefined
  /**
   * Who holds the name at the registrar level: the NameWrapper owner or the
   * registrar token holder on V1, the registry owner on V2. Only consulted for
   * registrar-issued names — for a subname this is exactly the value an attacker
   * sets, so it proves nothing.
   */
  readonly registrarHolder: string | null | undefined
  /** Transaction ids of every event in this name's history, where they are known. */
  readonly transactionIDs?: readonly string[]
}

/**
 * The registrar-issued name a subname hangs off, or the name itself when it is one.
 *
 * `a.b.victim.eth` → `victim.eth`. Only the 2LD matters: every label between it and
 * the leaf is a registry subname, and whoever holds the 2LD controls the whole
 * subtree beneath it.
 */
const registrarAncestor = (name: string) => name.split('.').slice(-2).join('.')

const isRegistrarIssued = (name: string) => getNameType(name) === 'eth-2ld'

/**
 * The registrar-issued names, out of those the registry says the address owns, that
 * it actually holds — the roots of every subtree the address controls.
 */
const heldRegistrarNames = (
  names: readonly Pick<AttributableName, 'name' | 'registrarHolder'>[],
  address: Address,
) =>
  new Set(
    names
      .filter(
        ({ name, registrarHolder }) =>
          name &&
          isRegistrarIssued(name) &&
          isSameAddress(registrarHolder, address),
      )
      .map(({ name }) => name as string),
  )

const isSameAddress = (
  a: string | null | undefined,
  b: Address | null | undefined,
) => Boolean(a && b && isAddress(a) && isAddressEqual(a, b))

type OwnableName = {
  readonly name: string | null
  /**
   * The address's authority relations to the name, from a `relation=any` read:
   * a narrower read lists only the relations it asked for. A name that only
   * resolves to the address carries `['resolves_to']`, which holds nothing.
   */
  readonly relations: readonly string[]
}

/**
 * The address holds the name's token. On a `.eth` 2LD bigname's `owner` is
 * always a token holder: the BaseRegistrar holder (unwrapped ENSv1), the
 * NameWrapper holder (wrapped ENSv1) or the ENSv2 token holder. A `manager`
 * relation alone is the registry controller, which is not a root: after a
 * token transfer without `reclaim` it is still the previous holder.
 */
const holdsRegistrarName = ({ name, relations }: OwnableName) =>
  Boolean(name && isRegistrarIssued(name) && relations.includes('owner'))

/**
 * Decides whether a name's history may be presented as the address's own.
 *
 * Registry ownership alone is deliberately *not* a signal: it is assignable by any
 * parent owner without the address's participation, which is exactly the forgery
 * this guards against. Only a name sold by the registrar counts structurally —
 * anything deeper is a subname its parent mints for free, at will, to anyone, and a
 * 2LD under any other TLD may sit under a registry a stranger controls.
 *
 * Note that "the address is named as the recipient of a transfer" is *not* a usable
 * signal, tempting as it looks. `setSubnodeRecord` emits `NewOwner` naming the
 * victim, and a parent owner can equally emit `Transfer` or `WrappedTransfer`
 * naming them, so every recipient field on a subname is attacker-chosen. The cost
 * is that a subname genuinely transferred in by its previous owner reads as
 * `assigned` until the recipient touches it — it is still shown, in the separately
 * labelled section, just not vouched for.
 *
 * @param name - the name's provenance signals
 * @param address - the address whose history page is being rendered
 * @param senders - transaction hash to the EOA that sent it, as far as it is known.
 *   Transactions missing from the map simply do not contribute a signal.
 */
const attributeName = (
  { name, registrarHolder, transactionIDs = [] }: AttributableName,
  address: Address,
  senders: ReadonlyMap<string, Address> | undefined,
  heldNames: ReadonlySet<string> = new Set(),
): NameAttribution => {
  if (
    name &&
    isRegistrarIssued(name) &&
    isSameAddress(registrarHolder, address)
  )
    return 'acquired'

  // A subname of a name the address holds is one the address minted itself: only the
  // holder of the parent can create it. `victim.evil.eth` fails here — its registrar
  // ancestor is `evil.eth`, which the address does not hold.
  if (name && heldNames.has(registrarAncestor(name))) return 'acquired'

  const interacted = transactionIDs.some((transactionID) =>
    isSameAddress(senders?.get(transactionID), address),
  )

  return interacted ? 'acquired' : 'assigned'
}

const isAcquired = (
  group: NameHistoryGroup,
  address: Address,
  senders: ReadonlyMap<string, Address> | undefined,
  heldNames: ReadonlySet<string>,
) =>
  attributeName(
    { ...group, transactionIDs: group.events.map((e) => e.transactionID) },
    address,
    senders,
    heldNames,
  ) === 'acquired'

/**
 * The names whose history is the address's own.
 *
 * @see attributeName for the rule, and why registry ownership is not one of the signals.
 */
export const selectAcquiredNames = (
  groups: readonly NameHistoryGroup[],
  address: Address,
  senders: ReadonlyMap<string, Address> | undefined,
) => {
  const heldNames = heldRegistrarNames(groups, address)
  return groups.filter((group) =>
    isAcquired(group, address, senders, heldNames),
  )
}

/**
 * Splits the history of every name the registry associates with an address into the
 * names the address acquired — its own history — and the names it was merely
 * assigned, whose content is authored by whoever assigned them.
 *
 * Events are grouped into transaction rows per bucket rather than globally, so a
 * transaction touching several names still renders as one row, without ever putting
 * an assigned name's events in a row about a name the address owns.
 *
 * @see attributeName for the rule, and why registry ownership is not one of the signals.
 */
export const partitionAddressHistory = (
  groups: readonly NameHistoryGroup[],
  address: Address,
  senders: ReadonlyMap<string, Address> | undefined,
) => {
  const acquired: NameHistoryGroup['events'][number][] = []
  const assigned: NameHistoryGroup['events'][number][] = []
  const heldNames = heldRegistrarNames(groups, address)
  let assignedNameCount = 0

  for (const group of groups) {
    if (isAcquired(group, address, senders, heldNames)) {
      acquired.push(...group.events)
    } else {
      assigned.push(...group.events)
      assignedNameCount += 1
    }
  }

  return {
    acquired: groupEventsByTransactionId(acquired, 'domain'),
    assigned: groupEventsByTransactionId(assigned, 'domain'),
    assignedNameCount,
  }
}

/**
 * Splits names the registry says an address owns into the ones it holds or minted
 * itself, and the ones a stranger's parent name granted it.
 *
 * @see attributeName for the rule, and why registry ownership is not one of the signals.
 */
export const partitionOwnedNames = <T extends OwnableName>(
  names: readonly T[],
) => {
  const heldNames = new Set(
    names.filter(holdsRegistrarName).map(({ name }) => name as string),
  )

  const isOwn = ({ name, relations }: T) =>
    Boolean(
      name &&
        (heldNames.has(name) ||
          heldNames.has(registrarAncestor(name)) ||
          (isRegistrarIssued(name) && relations.includes('former_owner'))),
    )

  return {
    acquired: names.filter(isOwn),
    assigned: names.filter((entry) => !isOwn(entry)),
  }
}
