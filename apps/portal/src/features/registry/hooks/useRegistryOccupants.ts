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
  readonly address: Address
  /** Whoever is about to write; every other holder in the registry is a third party. */
  readonly account: Address
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

/**
 * Counted through the root `domainConnection` rather than
 * `registry(address:).labelConnection`, which looks like the natural home for
 * it. Two indexer quirks rule that out, and both fail *open* — they return the
 * unfiltered count rather than erroring:
 *
 * - `owner_not` is advertised by the schema but not implemented, so asking for
 *   "everyone else" reports every non-empty registry as full of strangers.
 * - on `labelConnection`, `where` is only honoured as an inline literal; passed
 *   a GraphQL variable (or the whole filter as one) it is silently dropped.
 *
 * The root connection honours variables, so the third-party count is the total
 * minus the caller's own — both filtered server-side, nothing interpolated into
 * the document. `registry(address:)` still rides along, purely as the
 * existence probe the connection can't provide.
 */
const getRegistryOccupants = ResultFn(async function* ({
  address,
  account,
}: GetRegistryOccupantsParameters) {
  const { registry, total, own } = yield* fromPromise(
    graphqlIndexerClient.request<{
      registry: { labelCount: number } | null
      total: { totalCount: number | null }
      own: { totalCount: number | null }
    }>(
      gql`
        query getRegistryOccupants($registry: String!, $account: String!) {
          registry(address: $registry) {
            labelCount
          }
          total: domainConnection(first: 1, where: { registry: $registry }) {
            totalCount
          }
          own: domainConnection(
            first: 1
            where: { registry: $registry, owner: $account }
          ) {
            totalCount
          }
        }
      `,
      { registry: address.toLowerCase(), account: account.toLowerCase() },
    ),
    (e) => new GetRegistryOccupantsError({ cause: e as GraphqlRequestError }),
  )

  // `domainConnection` answers 0 both for a registry it has indexed and found
  // empty and for one it has never heard of — the second must not read as "safe
  // to detach". `registry` is the only field that tells them apart: null means
  // no record, so the count is unknown rather than zero.
  if (!registry) return ok(null)

  // A connection that reports no count leaves the subtraction undefined, and
  // guessing here would under-report third parties. Absent, not zero — the
  // caller renders this as "we couldn't check" and blocks the write.
  if (total.totalCount === null || own.totalCount === null) return ok(null)

  return ok({
    count: total.totalCount,
    thirdPartyCount: Math.max(0, total.totalCount - own.totalCount),
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
