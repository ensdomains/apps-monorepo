import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { createSubgraphClient } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { gql } from '@/utils/subgraph/gql'
import type { ForwardName } from '../ForwardNamesTable/columns'

class GetResolvedNamesForAddressError extends TaggedError(
  'GetResolvedNamesForAddressError',
)<{
  cause: unknown
}> {}

type GetResolvedNamesForAddressParameters = {
  readonly address: Address
}

type ResolvedNamesPage = {
  readonly names: readonly ForwardName[]
  readonly endCursor: string | undefined
  readonly hasNextPage: boolean
}

const RESOLVED_NAMES_PAGE_SIZE = 100

const getResolvedNamesPage = ResultFn(async function* ({
  address,
  after,
}: GetResolvedNamesForAddressParameters & { readonly after: string }) {
  const client = yield* safeGetClient()

  // ensjs's client replaces a name that does not hash to its id, so a
  // misreported name is never shown as if it were the real one.
  const { domains } = yield* fromPromise(
    createSubgraphClient(client).request<
      {
        readonly domains: readonly {
          readonly id: string
          readonly name: string
          readonly resolver: { readonly coinTypes: string[] | null } | null
        }[]
      },
      { address: string; first: number; after: string }
    >(
      gql`
        query getResolvedNamesForAddress(
          $address: String!
          $first: Int!
          $after: String!
        ) {
          domains(
            first: $first
            orderBy: id
            where: { resolvedAddress: $address, id_gt: $after }
          ) {
            id
            name
            resolver {
              coinTypes
            }
          }
        }
      `,
      {
        address: address.toLowerCase(),
        first: RESOLVED_NAMES_PAGE_SIZE,
        after,
      },
    ),
    (e) => new GetResolvedNamesForAddressError({ cause: e }),
  )

  return ok<ResolvedNamesPage>({
    names: domains.map(({ name, resolver }) => ({
      name,
      coinTypes: resolver?.coinTypes ?? [],
    })),
    endCursor: domains.at(-1)?.id,
    hasNextPage: domains.length === RESOLVED_NAMES_PAGE_SIZE,
  })
})

const getResolvedNamesForAddressQueryKey = createQueryKey<
  'get-resolved-names-for-address',
  GetResolvedNamesForAddressParameters
>('get-resolved-names-for-address')

/** ENSv1 names that resolve to an address, in pages. */
export const getResolvedNamesForAddressQueryOptions = (
  params: GetResolvedNamesForAddressParameters,
) =>
  resultInfiniteQueryOptions({
    queryKey: getResolvedNamesForAddressQueryKey(params),
    queryFn: ({ queryKey: [, { address }], pageParam }) =>
      getResolvedNamesPage({ address, after: pageParam }),
    initialPageParam: '',
    getNextPageParam: (last: ResolvedNamesPage) =>
      last.hasNextPage ? last.endCursor : undefined,
  })
