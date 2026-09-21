import { createPlainClient, graphqlRequest } from '@ens-apps/indexer/urql'
import { gql } from '@urql/core'
import type { Hex } from 'viem'
import { resolverAddress, type V1SubgraphEvent } from './adaptV1Events'

/** A registry `NewResolver` for the name — see `assignedResolverFilter`. */
type V1ResolverAssignment = {
  readonly id: string
  readonly resolverId?: string | null
}

type V1SubgraphResult = {
  readonly domain: {
    readonly events: readonly V1SubgraphEvent[]
    readonly registration?: {
      readonly cost?: string | null
      readonly events: readonly V1SubgraphEvent[]
    } | null
  } | null
  // Scoped reads select concrete collections (`addrChangeds`, …) instead of the
  // `events` interface, so the shape is "some event lists, keyed by selection".
  readonly resolvers: readonly Record<string, readonly V1SubgraphEvent[]>[]
  readonly newResolvers: readonly V1ResolverAssignment[]
}

/**
 * Bound on how many resolvers a single name's history is read from. The
 * subgraph writes one `Resolver` row per (resolver address, name) pair — for
 * the resolvers the name has used, plus any contract that emitted a resolver
 * event for its node (see `assignedResolverFilter`).
 */
const RESOLVERS_PER_NAME = 100

/**
 * Bound on how many registry `NewResolver` events are read. This is the
 * subgraph's page maximum; a name that has changed resolver more often than
 * this loses its oldest resolver events, never gains unverified ones.
 */
const RESOLVER_ASSIGNMENTS_PER_NAME = 1000

/**
 * `[blockNumber, logIndex]` from a subgraph event id — `"{blockNumber}-{logIndex}"`,
 * or `"{chainId}-{blockNumber}-{logIndex}"` on ENSNode. `undefined` when the id
 * has neither shape.
 */
const logPosition = (id: string): readonly [number, number] | undefined => {
  const [block, logIndex] = id.split('-').slice(-2).map(Number)
  return Number.isSafeInteger(block) && Number.isSafeInteger(logIndex)
    ? [block, logIndex]
    : undefined
}

const comparePosition = (
  a: readonly [number, number],
  b: readonly [number, number],
): number => a[0] - b[0] || a[1] - b[1]

/**
 * Keep only resolver events emitted by the name's resolver *while it was the
 * name's resolver*.
 *
 * The subgraph creates a `Resolver` row — and so a `resolvers(where: { domain })`
 * match — for any contract that emits a resolver-shaped event with the node as a
 * parameter, without checking that the registry ever pointed the name at it.
 * Unfiltered, anyone could deploy a contract, emit `AddrChanged(node, attacker)`
 * and have it render as the name's own history. The registry's `NewResolver`
 * events are the authority instead: each one starts an interval for its
 * resolver that the next one ends, and an event counts only if its resolver
 * held an interval containing the event's log position.
 */
export const assignedResolverFilter = (
  assignments: readonly V1ResolverAssignment[],
): ((event: V1SubgraphEvent) => boolean) => {
  const starts = assignments
    .flatMap(({ id, resolverId }) => {
      const start = logPosition(id)
      return start
        ? [
            {
              start,
              // Unset (`setResolver(node, 0)`) still ends the previous interval.
              resolver: resolverAddress(resolverId ?? undefined)?.toLowerCase(),
            },
          ]
        : []
    })
    .sort((a, b) => comparePosition(a.start, b.start))
  const intervals = starts.map((interval, i) => ({
    ...interval,
    end: starts[i + 1]?.start,
  }))

  return (event) => {
    const resolver =
      typeof event.resolverId === 'string'
        ? resolverAddress(event.resolverId)?.toLowerCase()
        : undefined
    const position = logPosition(event.id)
    if (!resolver || !position) return false
    return intervals.some(
      ({ start, end, resolver: assigned }) =>
        assigned === resolver &&
        comparePosition(position, start) >= 0 &&
        (!end || comparePosition(position, end) < 0),
    )
  }
}

/**
 * Scoped resolver-event selections, keyed by the type the *adapter* produces
 * (`adaptV1Events` renames `MulticoinAddrChanged` to `AddressChanged`), so
 * callers name the same types they use everywhere else.
 *
 * A scoped read has to select these concrete collections rather than filter the
 * `events` interface afterwards: `first` bounds that interface across all
 * record types at once, so a resolver with a lot of newer `TextChanged` would
 * push older address changes out of the window before any client-side filter
 * could see them. Each collection gets its own window instead.
 *
 * Types with no entry here fall back to the unscoped selection, which still
 * carries that caveat — add them as scoped views need them.
 */
const V1_SCOPED_RESOLVER_EVENTS: Record<
  string,
  { readonly collection: string; readonly fields: string } | undefined
> = {
  AddrChanged: { collection: 'addrChangeds', fields: 'addr { id }' },
  AddressChanged: {
    collection: 'multicoinAddrChangeds',
    fields: 'coinType multiaddr: addr',
  },
  NameChanged: { collection: 'nameChangeds', fields: 'name' },
  TextChanged: { collection: 'textChangeds', fields: 'key value' },
}

/** Every record type in one window — what an unscoped read selects. */
const allResolverEvents = `events(first: $first, orderBy: blockNumber, orderDirection: $orderDirection) {
            id
            blockNumber
            transactionID
            type: __typename
            resolverId
            ... on AddrChanged { addr { id } }
            ... on MulticoinAddrChanged { coinType multiaddr: addr }
            ... on NameChanged { name }
            ... on AbiChanged { contentType }
            ... on PubkeyChanged { x y }
            ... on TextChanged { key value }
            ... on ContenthashChanged { hash }
            ... on InterfaceChanged { interfaceID implementer }
            ... on AuthorisationChanged { owner target isAuthorized }
            ... on VersionChanged { version }
          }`

/**
 * The concrete collections a scope maps to, or `null` when the read is unscoped
 * — or when the scope names a type with no collection above, in which case the
 * whole interface is selected and filtered client-side.
 */
export const scopedCollections = (
  eventTypes: readonly string[] | undefined,
) => {
  if (!eventTypes) return null
  const entries = eventTypes.map((type) => V1_SCOPED_RESOLVER_EVENTS[type])
  const known = entries.filter((entry) => entry !== undefined)
  if (known.length !== entries.length) return null
  return [...new Map(known.map((entry) => [entry.collection, entry])).values()]
}

/**
 * Flatten the subgraph's registry / registrar / resolver split into one event
 * list — the split is a quirk of the schema and carries no meaning once events
 * are grouped by transaction.
 *
 * `cost` lives on the `Registration`, not on its `NameRegistered` event (the
 * subgraph writes it from a second handler), so it is folded onto that event
 * here — the adapter only ever sees events.
 *
 * Resolver events are dropped unless the registry had assigned their resolver
 * to the name when they were emitted — see `assignedResolverFilter`.
 */
export const flattenV1Response = (
  { domain, resolvers, newResolvers }: V1SubgraphResult,
  collections: ReturnType<typeof scopedCollections>,
): V1SubgraphEvent[] => {
  const cost = domain?.registration?.cost
  const isAssigned = assignedResolverFilter(newResolvers ?? [])

  return [
    ...(domain?.events ?? []),
    ...(domain?.registration?.events ?? []).map((event) =>
      event.type === 'NameRegistered' ? { ...event, cost } : event,
    ),
    // Read back by the same keys the query asked for — `Object.values()` would
    // sweep up any non-event field a later edit adds to this selection.
    ...(resolvers ?? []).flatMap((resolver) =>
      (collections?.map(({ collection }) => collection) ?? ['events'])
        .flatMap((key) => resolver[key] ?? [])
        .filter(isAssigned),
    ),
  ]
}

/**
 * Whether any single collection came back full. `first` bounds each sibling
 * selection *independently*, so the flattened total routinely exceeds it with
 * nothing truncated — comparing that total instead falsely reported fox.eth's
 * 172 complete v1 events as truncated.
 */
export const v1CollectionsSaturated = (
  { domain, resolvers }: Pick<V1SubgraphResult, 'domain' | 'resolvers'>,
  collections: ReturnType<typeof scopedCollections>,
  first: number,
): boolean =>
  [
    domain?.events,
    domain?.registration?.events,
    ...(resolvers ?? []).flatMap((resolver) =>
      (collections?.map(({ collection }) => collection) ?? ['events']).map(
        (key) => resolver[key],
      ),
    ),
  ].some((list) => (list?.length ?? 0) >= first)

/**
 * Fetch a name's v1 history as one flat event list. Returns `[]` (not an error)
 * when the subgraph has no record of the name — the common case for a v2-native
 * name.
 *
 * This deliberately does not go through ensjs's `getNameHistory`: that action
 * flattens `{ id }` references with `id.split('-')[0]`, which returns the chain
 * id for ENSNode's `"{chainId}-{address}-{node}"` resolver ids and so loses the
 * resolver address entirely. We keep the raw refs and flatten them in
 * `adaptV1Events`.
 *
 * `$first` is passed explicitly because the three sibling `events` selections
 * are each costed at their worst case when the variable is unsupplied, and the
 * query is then rejected for exceeding the complexity limit. `orderBy:
 * blockNumber` is what makes it mean "the newest N" — the connection otherwise
 * orders by `id`, and ids are `"{chainId}-{blockNumber}-{logIndex}"` strings,
 * so they sort lexicographically and put block 10000000 before block 9529458.
 *
 * Resolver events are read from every resolver the name has ever pointed at
 * (`resolvers(where: { domain })`), not just `domain.resolver`: that field is
 * only the *current* one, so records set on a resolver the name has since
 * moved off would silently drop out of what reads as a complete history. Each
 * event names its own resolver via `resolverId`, so the flat list stays
 * unambiguous. That query also matches contracts the name never pointed at, so
 * the registry's `NewResolver` events are read alongside — unwindowed by
 * `$first`, since every interval is needed — to filter them out.
 *
 * The response is shaped into that flat list by `flattenV1Response`.
 */
export const fetchV1NameHistory = async ({
  subgraphUrl,
  namehash,
  first,
  orderDirection,
  eventTypes,
}: {
  readonly subgraphUrl: string
  readonly namehash: Hex
  readonly first: number
  readonly orderDirection: 'asc' | 'desc'
  /** Restrict resolver events to these types — see `V1_SCOPED_RESOLVER_EVENTS`. */
  readonly eventTypes?: readonly string[]
}): Promise<{
  readonly events: V1SubgraphEvent[]
  readonly saturated: boolean
}> => {
  const collections = scopedCollections(eventTypes)
  const response = await graphqlRequest<V1SubgraphResult>(
    createPlainClient(subgraphUrl),
    gql`
      query getV1NameHistoryTimeline(
        $id: String!
        $first: Int
        $resolvers: Int
        $assignments: Int
        $orderDirection: OrderDirection
      ) {
        newResolvers(
          where: { domain: $id }
          first: $assignments
          orderBy: blockNumber
          orderDirection: desc
        ) {
          id
          resolverId
        }
        ${
          // Every scoped type maps to a resolver collection, so no domain or
          // registration event could match — skip both windows rather than
          // fetch up to `first` of each and drop them client-side.
          collections
            ? ''
            : `domain(id: $id) {
          events(first: $first, orderBy: blockNumber, orderDirection: $orderDirection) {
            id
            blockNumber
            transactionID
            type: __typename
            ... on Transfer { owner { id } }
            ... on NewOwner { owner { id } parentDomain { name } }
            ... on NewResolver { resolverId }
            ... on NewTTL { ttl }
            ... on WrappedTransfer { owner { id } }
            ... on NameWrapped { name fuses expiryDate owner { id } }
            ... on NameUnwrapped { owner { id } }
            ... on FusesSet { fuses }
            ... on ExpiryExtended { expiryDate }
          }
          registration {
            cost
            events(first: $first, orderBy: blockNumber, orderDirection: $orderDirection) {
              id
              blockNumber
              transactionID
              type: __typename
              ... on NameRegistered { registrant { id } expiryDate }
              ... on NameRenewed { expiryDate }
              ... on NameTransferred { newOwner { id } }
            }
          }
        }`
        }
        resolvers(where: { domain: $id }, first: $resolvers) {
          ${
            collections
              ? collections
                  .map(
                    ({ collection, fields }) => `${collection}(
            first: $first
            orderBy: blockNumber
            orderDirection: $orderDirection
          ) {
            id
            blockNumber
            transactionID
            type: __typename
            resolverId
            ${fields}
          }`,
                  )
                  .join('\n          ')
              : allResolverEvents
          }
        }
      }
    `,
    {
      id: namehash,
      first,
      resolvers: RESOLVERS_PER_NAME,
      assignments: RESOLVER_ASSIGNMENTS_PER_NAME,
      orderDirection,
    },
  )

  return {
    events: flattenV1Response(response, collections),
    saturated: v1CollectionsSaturated(response, collections, first),
  }
}
