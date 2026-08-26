import { GraphQLClient, gql } from 'graphql-request'
import type { Hex } from 'viem'
import type { V1SubgraphEvent } from './adaptV1Events'

type V1SubgraphResult = {
  domain: {
    events: V1SubgraphEvent[]
    registration?: { cost?: string | null; events: V1SubgraphEvent[] } | null
  } | null
  // Scoped reads select concrete collections (`addrChangeds`, …) instead of the
  // `events` interface, so the shape is "some event lists, keyed by selection".
  resolvers: Record<string, V1SubgraphEvent[]>[]
}

/**
 * Bound on how many resolvers a single name's history is read from. The
 * subgraph writes one `Resolver` row per (resolver address, name) pair, so this
 * is "how many different resolvers has this name ever used" — a handful at
 * most, well under the cap.
 */
const RESOLVERS_PER_NAME = 100

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
  if (entries.some((entry) => !entry)) return null
  return [
    ...new Map(
      entries.map((entry) => [entry?.collection ?? '', entry] as const),
    ).values(),
  ].filter((entry) => entry !== undefined)
}

/**
 * Flatten the subgraph's registry / registrar / resolver split into one event
 * list — the split is a quirk of the schema and carries no meaning once events
 * are grouped by transaction.
 *
 * `cost` lives on the `Registration`, not on its `NameRegistered` event (the
 * subgraph writes it from a second handler), so it is folded onto that event
 * here — the adapter only ever sees events.
 */
export const flattenV1Response = (
  { domain, resolvers }: V1SubgraphResult,
  collections: ReturnType<typeof scopedCollections>,
): V1SubgraphEvent[] => {
  const cost = domain?.registration?.cost

  return [
    ...(domain?.events ?? []),
    ...(domain?.registration?.events ?? []).map((event) =>
      event.type === 'NameRegistered' ? { ...event, cost } : event,
    ),
    // Read back by the same keys the query asked for — `Object.values()` would
    // sweep up any non-event field a later edit adds to this selection.
    ...(resolvers ?? []).flatMap((resolver) =>
      (collections?.map(({ collection }) => collection) ?? ['events']).flatMap(
        (key) => resolver[key] ?? [],
      ),
    ),
  ]
}

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
 * unambiguous.
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
}): Promise<V1SubgraphEvent[]> => {
  const collections = scopedCollections(eventTypes)
  const { domain, resolvers } = await new GraphQLClient(
    subgraphUrl,
  ).request<V1SubgraphResult>(
    gql`
      query getV1NameHistoryTimeline(
        $id: String!
        $first: Int
        $resolvers: Int
        $orderDirection: OrderDirection
      ) {
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
    { id: namehash, first, resolvers: RESOLVERS_PER_NAME, orderDirection },
  )

  return flattenV1Response({ domain, resolvers }, collections)
}
