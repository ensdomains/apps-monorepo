import { type Address, type Hex, isAddress } from 'viem'
import type { TimelineIndexerEvent } from '../hooks/useNameHistoryTimeline'

/**
 * Adapts ENS v1 subgraph events into the shape the history timeline speaks
 * (`TimelineIndexerEvent`, otherwise produced by the v2 indexer).
 *
 * A v1-only name (never migrated) has no `domains` row in the v2 indexer at all,
 * so the timeline's own query returns `[]` for it. Rather than teach every
 * timeline component a second event shape, we normalize v1 events here and let
 * the existing summarize/descriptor/detail pipeline render both.
 */

/**
 * Written to `protocol` on adapted events, mirroring the `"v2"` the indexer
 * stamps on its own. `descriptors.ts` reads it to disambiguate the two type
 * names that mean different things across protocols.
 */
export const V1_PROTOCOL = 'v1'

export type V1SubgraphEvent = {
  readonly id: string
  readonly blockNumber: number
  readonly transactionID: string
  /** Aliased from `__typename` by the query. */
  readonly type: string
  readonly [field: string]: unknown
}

/** v1 types that reuse a v2 descriptor and payload verbatim. */
const TYPE_ALIASES: Record<string, string> = {
  // The registry's `Transfer(node, owner)` is an owner change, not an ERC-721
  // transfer — the v2 `Transfer` descriptor would reject it for lacking `from`.
  Transfer: 'RegistryTransfer',
  NewResolver: 'ResolverUpdated',
  ExpiryExtended: 'ExpiryUpdated',
  MulticoinAddrChanged: 'AddressChanged',
}

/**
 * The ENS v1 contracts a history event can be emitted by. The v1 subgraph does
 * not record an emitting address (the v2 indexer does, as `contractAddress`),
 * but it is fixed per event type — so the contract badge on each row is
 * recovered from these chain constants rather than an extra lookup.
 *
 * Resolver events are the exception: they name their resolver per-event via
 * `resolverId`, since a name can change resolver over its life.
 */
export type V1Contracts = {
  readonly registry: Address
  readonly nameWrapper: Address
  readonly baseRegistrar: Address
}

const CONTRACT_BY_TYPE: Record<string, keyof V1Contracts> = {
  NewOwner: 'registry',
  Transfer: 'registry',
  NewResolver: 'registry',
  NewTTL: 'registry',
  WrappedTransfer: 'nameWrapper',
  NameWrapped: 'nameWrapper',
  NameUnwrapped: 'nameWrapper',
  FusesSet: 'nameWrapper',
  ExpiryExtended: 'nameWrapper',
  // All three registration events come from the BaseRegistrar; the controller
  // only back-fills `cost`/`labelName` onto the Registration entity.
  NameRegistered: 'baseRegistrar',
  NameRenewed: 'baseRegistrar',
  NameTransferred: 'baseRegistrar',
}

/** Coin type for ETH — the coin `AddrChanged` implicitly refers to. */
const ETH_COIN_TYPE = 60

const refId = (value: unknown): string | undefined => {
  const id = (value as { id?: string | null } | null | undefined)?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const num = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return typeof value !== 'object' && value !== '' && Number.isFinite(parsed)
    ? parsed
    : undefined
}

/**
 * Pull the resolver address out of a subgraph resolver id.
 *
 * ENSNode ids are `"{chainId}-{address}-{node}"`. (ensjs's own `getNameHistory`
 * flattens these with `id.split('-')[0]`, which yields the chain id — we scan
 * for the address-shaped segment instead.)
 */
const resolverAddress = (id?: string): string | undefined =>
  id?.split('-').find((part) => isAddress(part, { strict: false }))

const RESERVED_FIELDS = new Set([
  'id',
  'blockNumber',
  'transactionID',
  'type',
  // Composite subgraph ids, replaced below by the address/name they encode.
  'resolverId',
  'parentDomain',
])

/**
 * The raw v1 params as a JSON blob, matching the v2 indexer's `data` field.
 * Types with no typed payload below render their tier-3 parameter table
 * straight from this.
 *
 * `node` is always added: v2 events carry the namehash as a decoded param and
 * v1 events don't, but it is the domain being viewed either way.
 */
const dataBlob = (
  event: V1SubgraphEvent,
  node: Hex,
  resolver?: string,
): string => {
  const params: Record<string, unknown> = { node }
  for (const [key, value] of Object.entries(event)) {
    if (RESERVED_FIELDS.has(key) || value == null) continue
    // Flatten `{ id }` references to the bare id/address.
    params[key] = typeof value === 'object' ? (refId(value) ?? value) : value
  }
  if (event.type === 'NewResolver') {
    params.resolver = resolverAddress(refId(event.resolver))
  } else if (resolver) {
    params.resolver = resolver
  }
  const parent = (event.parentDomain as { name?: string } | undefined)?.name
  if (parent) params.parent = parent
  return JSON.stringify(params)
}

/** The typed `as*` payload a v1 event maps onto, if any. */
const payloadFor = (
  event: V1SubgraphEvent,
  name: string,
  node: Hex,
  resolver?: string,
): Partial<TimelineIndexerEvent> => {
  switch (event.type) {
    case 'NewOwner':
    case 'Transfer':
      return { asRegistryTransfer: { node, owner: refId(event.owner) } }
    case 'NewResolver':
      return {
        asResolverUpdated: { resolver: resolverAddress(refId(event.resolver)) },
      }
    case 'WrappedTransfer':
      return { asTransfer: { to: refId(event.owner) } }
    case 'NameWrapped':
      return {
        asNameWrapped: {
          node,
          owner: refId(event.owner),
          fuses: num(event.fuses),
          expiry: num(event.expiryDate),
        },
      }
    case 'NameUnwrapped':
      return { asNameUnwrapped: { node, owner: refId(event.owner) } }
    case 'FusesSet':
      return { asFusesSet: { node, fuses: num(event.fuses) } }
    case 'ExpiryExtended':
      return { asExpiryUpdated: { node, expiry: num(event.expiryDate) } }
    case 'NameRegistered':
      return {
        asNameRegistered: {
          name,
          // `cost` is folded on by the fetcher from the Registration entity,
          // which is where the subgraph records it. `label` is deliberately
          // absent: v2's is the labelhash, and v1 only stores the plain
          // `labelName` — which `name` already shows.
          cost: str(event.cost),
          owner: refId(event.registrant),
          expires: num(event.expiryDate),
        },
      }
    case 'NameRenewed':
      return { asNameRenewed: { expires: num(event.expiryDate) } }
    case 'AddrChanged':
      return {
        asAddressChanged: {
          address: refId(event.addr),
          coinType: ETH_COIN_TYPE,
          resolver,
          namehash: node,
        },
      }
    case 'MulticoinAddrChanged':
      // ensjs aliases the field to `multiaddr` to dodge the `addr` ref above.
      return {
        asAddressChanged: {
          address: str(event.multiaddr) ?? str(event.addr),
          coinType: num(event.coinType),
          resolver,
          namehash: node,
        },
      }
    case 'TextChanged': {
      const key = str(event.key)
      const value = str(event.value)
      return {
        key,
        value,
        asTextChanged: { key, value, resolver, namehash: node },
      }
    }
    // NewTTL, NameTransferred and the remaining resolver events (NameChanged,
    // ContenthashChanged, AbiChanged, …) read their params from `data`.
    default:
      return {}
  }
}

/**
 * Drop the coin-60 `AddressChanged` when the same transaction also carries an
 * `AddrChanged`. `setAddr(node, addr)` emits both on-chain and the subgraph
 * indexes both — showing the same address twice (and inflating the "Set N
 * records" count) is an artifact, not history.
 */
const dropDuplicateEthAddrEvents = (
  events: readonly TimelineIndexerEvent[],
): TimelineIndexerEvent[] => {
  const txsWithAddrChanged = new Set(
    events
      .filter((event) => event.type === 'AddrChanged')
      .map((event) => event.transactionHash.toLowerCase()),
  )
  return events.filter(
    (event) =>
      !(
        event.type === 'AddressChanged' &&
        event.asAddressChanged?.coinType === ETH_COIN_TYPE &&
        txsWithAddrChanged.has(event.transactionHash.toLowerCase())
      ),
  )
}

export const adaptV1Events = ({
  events,
  name,
  namehash,
  blockTimestamps,
  contracts,
}: {
  readonly events: readonly V1SubgraphEvent[]
  /** The name being viewed; v1 events carry no name of their own. */
  readonly name: string
  readonly namehash: Hex
  /** blockNumber → unix seconds. Missing entries fall back to 0. */
  readonly blockTimestamps: ReadonlyMap<number, number>
  readonly contracts: V1Contracts
}): TimelineIndexerEvent[] =>
  dropDuplicateEthAddrEvents(
    events.map((event) => {
      // Resolver events name their own resolver; everything else is emitted by
      // a fixed contract for its type.
      const resolver = resolverAddress(str(event.resolverId))
      const contract = CONTRACT_BY_TYPE[event.type]

      return {
        id: event.id,
        type: TYPE_ALIASES[event.type] ?? event.type,
        name,
        namehash,
        protocol: V1_PROTOCOL,
        transactionHash: event.transactionID as Hex,
        blockNumber: event.blockNumber,
        timestamp: blockTimestamps.get(event.blockNumber) ?? 0,
        contractAddress: contract
          ? contracts[contract]
          : (resolver as Address | undefined),
        data: dataBlob(event, namehash, resolver),
        ...payloadFor(event, name, namehash, resolver),
      }
    }),
  )
