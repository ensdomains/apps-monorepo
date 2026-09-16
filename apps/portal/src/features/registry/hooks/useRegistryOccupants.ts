import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetRegistryOccupantsError extends TaggedError(
  'GetRegistryOccupantsError',
)<{
  cause: GraphqlRequestError
}> {}

type GetRegistryOccupantsParameters = {
  address: Address
  /** Whoever is about to write; every other holder in the registry is a third party. */
  account: Address
}

/**
 * Who lives in a registry, relative to the account about to act on it. Used
 * before a write that detaches the registry: the labels inside are the names
 * that stop resolving, and the ones held by anyone else are third parties who
 * get no say and no repair path.
 *
 * Both numbers are counted by the indexer rather than sampled and tallied here
 * — `thirdPartyCount` gates a destructive write, so a paged sample that missed
 * the one stranger in a large registry would answer it wrongly.
 */
export type RegistryOccupants = {
  readonly count: number
  readonly thirdPartyCount: number
}

const getRegistryOccupants = ResultFn(async function* ({
  address,
  account,
}: GetRegistryOccupantsParameters) {
  const { registry } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: {
        labelCount: number
        thirdParty: { totalCount: number | null }
      } | null
    }>(
      gql`
        query getRegistryOccupants($address: String!, $account: String!) {
          registry(address: $address) {
            labelCount
            thirdParty: labelConnection(
              first: 1
              where: { owner_not: $account }
            ) {
              totalCount
            }
          }
        }
      `,
      { address: address.toLowerCase(), account: account.toLowerCase() },
    ),
    (e) => new GetRegistryOccupantsError({ cause: e as GraphqlRequestError }),
  )

  // null = the indexer has no record of this registry. Distinct from a registry
  // it knows about that holds nothing.
  if (!registry) return ok(null)

  return ok({
    count: registry.labelCount,
    thirdPartyCount: registry.thirdParty.totalCount ?? 0,
  } satisfies RegistryOccupants)
})

const getRegistryOccupantsQueryKey = createQueryKey<
  'get-registry-occupants',
  GetRegistryOccupantsParameters
>('get-registry-occupants')

export const getRegistryOccupantsQueryOptions = (
  params: GetRegistryOccupantsParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryOccupantsQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getRegistryOccupants(params),
  })
