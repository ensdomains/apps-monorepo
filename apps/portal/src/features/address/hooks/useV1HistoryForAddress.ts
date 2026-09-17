import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { SubgraphRequestError } from '@ensdomains/ensjs'
import { createSubgraphClient } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import type {
  V1EventBase,
  V1NameHistory,
} from '@/utils/history/transformAddressHistory'
import { gql } from '@/utils/subgraph/gql'

class GetV1HistoryForAddressError extends TaggedError(
  'GetV1HistoryForAddressError',
)<{
  cause: GetV1HistoryForAddressErrorType
}> {}

type GetV1HistoryForAddressErrorType = SubgraphRequestError

type GetV1HistoryForAddressParameters = {
  address: Address
}

type V1HistoryResponse = {
  domains: Array<{
    name: string | null
    registrant?: { id: string } | null
    wrappedOwner?: { id: string } | null
    events: V1EventBase[]
    registration?: {
      events: V1EventBase[]
    } | null
    resolver?: {
      events: V1EventBase[]
    } | null
  }>
}

/**
 * Fetches V1 history for an address from the ENS subgraph
 * Gets all domain, registration, and resolver events for domains owned by the address
 */
const getV1HistoryForAddress = ResultFn(async function* ({
  address,
}: GetV1HistoryForAddressParameters) {
  const client = yield* safeGetClient()
  const subgraphClient = createSubgraphClient(client)

  const query = gql`
    query getV1HistoryForAddress($address: String!, $first: Int, $orderDirection: OrderDirection) {
      domains(
        where: {
          or: [
            { owner: $address }
            { registrant: $address }
          ]
        }
        first: 100
      ) {
        name
        registrant {
          id
        }
        wrappedOwner {
          id
        }
        events(first: $first, orderDirection: $orderDirection) {
          id
          blockNumber
          transactionID
          type: __typename
          ... on Transfer {
            owner {
              id
            }
          }
          ... on NewOwner {
            owner {
              id
            }
          }
          ... on NewResolver {
            resolver {
              id
            }
          }
          ... on NewTTL {
            ttl
          }
          ... on WrappedTransfer {
            owner {
              id
            }
          }
          ... on NameWrapped {
            fuses
            expiryDate
            owner {
              id
            }
          }
          ... on NameUnwrapped {
            owner {
              id
            }
          }
          ... on FusesSet {
            fuses
          }
          ... on ExpiryExtended {
            expiryDate
          }
        }
        registration {
          events(first: $first, orderDirection: $orderDirection) {
            id
            blockNumber
            transactionID
            type: __typename
            ... on NameRegistered {
              registrant {
                id
              }
              expiryDate
            }
            ... on NameRenewed {
              expiryDate
            }
            ... on NameTransferred {
              newOwner {
                id
              }
            }
          }
        }
        resolver {
          events(first: $first, orderDirection: $orderDirection) {
            id
            blockNumber
            transactionID
            type: __typename
            ... on AddrChanged {
              addr {
                id
              }
            }
            ... on MulticoinAddrChanged {
              coinType
              multiaddr: addr
            }
            ... on NameChanged {
              name
            }
            ... on AbiChanged {
              contentType
            }
            ... on PubkeyChanged {
              x
              y
            }
            ... on TextChanged {
              key
              value
            }
            ... on ContenthashChanged {
              hash
            }
            ... on InterfaceChanged {
              interfaceID
              implementer
            }
            ... on AuthorisationChanged {
              owner
              target
              isAuthorized
            }
            ... on VersionChanged {
              version
            }
          }
        }
      }
    }
  `

  const queryVars = {
    address: address.toLowerCase(),
    first: 1000,
    orderDirection: 'desc' as const,
  }

  const result = yield* fromPromise(
    subgraphClient.request<V1HistoryResponse, typeof queryVars>(
      query,
      queryVars,
    ),
    (e) =>
      new GetV1HistoryForAddressError({
        cause: e as GetV1HistoryForAddressErrorType,
      }),
  )

  // Keep the events grouped per name: whether a name's history belongs to this
  // address is decided per name, and flattening here would lose the provenance
  // signals needed to decide it.
  const names: V1NameHistory[] = result.domains.map((domain) => ({
    name: domain.name,
    // A wrapped name's registrar token sits in the NameWrapper, so the wrapper's
    // owner is the registrar-level holder; otherwise it is the registrant.
    registrarHolder: domain.wrappedOwner?.id ?? domain.registrant?.id ?? null,
    domainEvents: domain.events || [],
    registrationEvents: domain.registration?.events || [],
    resolverEvents: domain.resolver?.events || [],
  }))

  return ok(names)
})

const getV1HistoryForAddressQueryKey = createQueryKey<
  'get-v1-history-for-address',
  GetV1HistoryForAddressParameters
>('get-v1-history-for-address')

export const getV1HistoryForAddressQueryOptions = (
  params: GetV1HistoryForAddressParameters,
) =>
  resultQueryOptions({
    queryKey: getV1HistoryForAddressQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getV1HistoryForAddress(params),
  })
