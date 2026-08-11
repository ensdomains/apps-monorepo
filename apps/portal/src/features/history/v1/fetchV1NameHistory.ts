import { GraphQLClient, gql } from 'graphql-request'
import type { Hex } from 'viem'
import type { V1SubgraphEvent } from './adaptV1Events'

/**
 * The ENS v1 subgraph query behind the history timeline.
 *
 * This deliberately does not go through ensjs's `getNameHistory`: that action
 * flattens `{ id }` references with `id.split('-')[0]`, which returns the chain
 * id for ENSNode's `"{chainId}-{address}-{node}"` resolver ids and so loses the
 * resolver address entirely. We keep the raw refs and flatten them in
 * `adaptV1Events`.
 *
 * `$first` is passed explicitly for the same reason it is on the v1 history
 * hook: the three sibling `events` selections are each costed at their worst
 * case when the variable is unsupplied, and the query is rejected for exceeding
 * the complexity limit.
 */
const V1_NAME_HISTORY_QUERY = gql`
  query getV1NameHistoryTimeline($id: String!, $first: Int, $orderDirection: OrderDirection) {
    domain(id: $id) {
      events(first: $first, orderBy: blockNumber, orderDirection: $orderDirection) {
        id
        blockNumber
        transactionID
        type: __typename
        ... on Transfer { owner { id } }
        ... on NewOwner { owner { id } parentDomain { name } }
        ... on NewResolver { resolver { id } }
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
      resolver {
        events(first: $first, orderBy: blockNumber, orderDirection: $orderDirection) {
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
        }
      }
    }
  }
`

type V1SubgraphResult = {
  domain: {
    events: V1SubgraphEvent[]
    registration?: { cost?: string | null; events: V1SubgraphEvent[] } | null
    resolver?: { events: V1SubgraphEvent[] } | null
  } | null
}

/**
 * Fetch a name's v1 history as one flat event list — the registry / registrar /
 * resolver split is a quirk of the subgraph schema and carries no meaning once
 * the events are grouped by transaction. Returns `[]` (not an error) when the
 * subgraph has no record of the name, the common case for a v2-native name.
 *
 * `cost` lives on the `Registration` entity rather than on the `NameRegistered`
 * event (the subgraph writes it from a second handler), so it is folded onto
 * that event here — the adapter only ever sees events.
 */
export const fetchV1NameHistory = async ({
  subgraphUrl,
  namehash,
  first,
  orderDirection,
}: {
  readonly subgraphUrl: string
  readonly namehash: Hex
  readonly first: number
  readonly orderDirection: 'asc' | 'desc'
}): Promise<V1SubgraphEvent[]> => {
  const client = new GraphQLClient(subgraphUrl)
  const { domain } = await client.request<V1SubgraphResult>(
    V1_NAME_HISTORY_QUERY,
    { id: namehash, first, orderDirection },
  )

  const cost = domain?.registration?.cost
  const registrationEvents = (domain?.registration?.events ?? []).map(
    (event) => (event.type === 'NameRegistered' ? { ...event, cost } : event),
  )

  return [
    ...(domain?.events ?? []),
    ...registrationEvents,
    ...(domain?.resolver?.events ?? []),
  ]
}
