/**
 * The entity model the ENS V1 subgraph exposes, held in memory.
 *
 * Field names and shapes are the subgraph's, not ours: the consumers are ensjs
 * and two app-owned clients that were written against the real thing, so a
 * near-miss here surfaces as a confusing app bug rather than as a shim bug.
 * Notably `expiryDate`, `createdAt` and `cost` are BigInt-as-string, because
 * that is what the app code parses.
 */

import { type Address, type Hex, namehash } from 'viem'

export type AccountRef = { id: string }

export type EventKind =
  | 'Transfer'
  | 'NewOwner'
  | 'NewResolver'
  | 'NewTTL'
  | 'WrappedTransfer'
  | 'NameWrapped'
  | 'NameUnwrapped'
  | 'FusesSet'
  | 'ExpiryExtended'
  | 'NameRegistered'
  | 'NameRenewed'
  | 'NameTransferred'
  | 'AddrChanged'
  | 'MulticoinAddrChanged'
  | 'NameChanged'
  | 'TextChanged'
  | 'ContenthashChanged'
  | 'AbiChanged'
  | 'VersionChanged'
  | 'PubkeyChanged'
  | 'InterfaceChanged'
  | 'AuthorisationChanged'

/** Which collection an event belongs to — the three the queries select from. */
export type EventScope = 'domain' | 'registration' | 'resolver'

export type StoredEvent = {
  id: string
  kind: EventKind
  scope: EventScope
  /** Namehash of the domain this event is about. */
  node: string
  blockNumber: number
  transactionID: string
  logIndex: number
  /** Only for resolver events: which resolver entity emitted it. */
  resolverId?: string
  /** Event-specific payload, spread into the GraphQL object. */
  data: Record<string, unknown>
}

export type ResolverEntity = {
  /** The subgraph's composite id: `<resolverAddress>-<namehash>`. */
  id: string
  address: Address
  node: string
  /** Text keys ever set and not cleared, in first-seen order. */
  texts: string[]
  /** Coin types ever set and not cleared. */
  coinTypes: string[]
  contentHash: string | null
  addr: Address | null
  /** ABI content types seen, for `abiChangeds`. */
  abis: string[]
}

export type RegistrationEntity = {
  id: string
  labelName: string | null
  registrationDate: string
  expiryDate: string
  cost: string | null
  registrant: AccountRef
}

export type WrappedDomainEntity = {
  id: string
  expiryDate: string
  fuses: number
  owner: AccountRef
  name: string | null
}

export type DomainEntity = {
  /** Namehash, lowercase hex — the subgraph's Domain id. */
  id: string
  name: string | null
  labelName: string | null
  labelhash: string | null
  parentId: string | null
  /** Registry owner. For a wrapped name this is the NameWrapper, as upstream. */
  owner: AccountRef
  registrantId: string | null
  wrappedOwnerId: string | null
  resolverId: string | null
  resolvedAddress: string | null
  ttl: string | null
  isMigrated: boolean
  createdAt: string
  /** Set only while the node has a live registry owner. */
  subdomainIds: Set<string>
}

const ZERO = '0x0000000000000000000000000000000000000000'

export class Store {
  readonly domains = new Map<string, DomainEntity>()
  readonly registrations = new Map<string, RegistrationEntity>()
  readonly wrapped = new Map<string, WrappedDomainEntity>()
  readonly resolvers = new Map<string, ResolverEntity>()
  readonly events: StoredEvent[] = []

  /** labelhash → plaintext label, learned from events that carry one. */
  readonly labels = new Map<string, string>()

  /** Namehash → the `.eth` 2LD labelhash it descends from, for registrations. */
  readonly registrationNodeByLabelhash = new Map<string, string>()

  domain(id: string): DomainEntity {
    const key = id.toLowerCase()
    const existing = this.domains.get(key)
    if (existing) return existing
    const created: DomainEntity = {
      id: key,
      name: null,
      labelName: null,
      labelhash: null,
      parentId: null,
      owner: { id: ZERO },
      registrantId: null,
      wrappedOwnerId: null,
      resolverId: null,
      resolvedAddress: null,
      ttl: null,
      isMigrated: true,
      createdAt: '0',
      subdomainIds: new Set(),
    }
    this.domains.set(key, created)
    return created
  }

  /**
   * Teach the store a label, and name every domain that was waiting on it.
   *
   * Names arrive out of order — a subname's `NewOwner` can be indexed before
   * anything reveals its parent's label — so naming is a fixpoint rather than a
   * one-shot: learning one label can complete the name of a whole subtree.
   */
  learnLabel(labelhash: string, label: string): void {
    const key = labelhash.toLowerCase()
    if (this.labels.get(key) === label) return
    this.labels.set(key, label)
    this.renameAll()
  }

  /** Recompute `name`/`labelName` for every domain from what labels we know. */
  renameAll(): void {
    for (const domain of this.domains.values()) {
      const resolved = this.nameOf(domain.id, new Set())
      domain.name = resolved
      if (domain.labelhash) {
        domain.labelName = this.labels.get(domain.labelhash) ?? null
      }
    }
  }

  /**
   * The full name of a node, or null when any ancestor label is unknown.
   *
   * Returning null rather than a partial name is deliberate: `isValidLabel`
   * treats a label containing a dot as ineligible, so a half-resolved
   * `[0xabc].parent.eth` would not merely look odd, it would make the app
   * assert the wrong product behaviour. The real subgraph prints the bracketed
   * form; we do too, but only once the rest of the chain is known.
   */
  private nameOf(id: string, seen: Set<string>): string | null {
    if (seen.has(id)) return null
    seen.add(id)
    const domain = this.domains.get(id)
    if (!domain) return null
    if (id === namehash('')) return ''
    if (!domain.parentId || !domain.labelhash) return null
    const label =
      this.labels.get(domain.labelhash) ?? `[${domain.labelhash.slice(2)}]`
    const parent = this.nameOf(domain.parentId, seen)
    if (parent === null) return null
    return parent === '' ? label : `${label}.${parent}`
  }

  resolver(address: Address, node: string): ResolverEntity {
    const id = `${address.toLowerCase()}-${node.toLowerCase()}`
    const existing = this.resolvers.get(id)
    if (existing) return existing
    const created: ResolverEntity = {
      id,
      address: address.toLowerCase() as Address,
      node: node.toLowerCase(),
      texts: [],
      coinTypes: [],
      contentHash: null,
      addr: null,
      abis: [],
    }
    this.resolvers.set(id, created)
    return created
  }

  addEvent(event: StoredEvent): void {
    this.events.push(event)
  }

  /** Events for one domain, in block order, filtered by scope. */
  eventsFor(node: string, scope: EventScope): StoredEvent[] {
    const key = node.toLowerCase()
    return this.events
      .filter((e) => e.node === key && e.scope === scope)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  }

  /** Resolver events, which hang off the resolver entity rather than the node. */
  eventsForResolver(resolverId: string): StoredEvent[] {
    return this.events
      .filter((e) => e.scope === 'resolver' && e.resolverId === resolverId)
      .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  }

  reset(): void {
    this.domains.clear()
    this.registrations.clear()
    this.wrapped.clear()
    this.resolvers.clear()
    this.events.length = 0
    this.labels.clear()
    this.registrationNodeByLabelhash.clear()
  }
}

export const ZERO_ADDRESS = ZERO
export const asHex = (value: string): Hex => value as Hex
