import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { namehash } from 'viem'
import { graphqlIndexerClient } from '@/lib/indexer'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'

class GetSubregistryHistoryError extends TaggedError(
  'GetSubregistryHistoryError',
)<{
  cause: GraphqlRequestError
}> {}

type GetSubregistryHistoryParameters = {
  name: string
}

const getSubregistryHistory = ResultFn(async function* ({
  name,
}: GetSubregistryHistoryParameters) {
  const { eventConnection } = yield* fromPromise(
    graphqlIndexerClient.request<{
      eventConnection: { totalCount: number | null }
    }>(
      gql`
        query getSubregistryUpdateCount($namehash: String!) {
          eventConnection(
            first: 1
            where: { namehash: $namehash, type: "SubregistryUpdated" }
          ) {
            totalCount
          }
        }
      `,
      { namehash: namehash(normalizeOrLower(name)) },
    ),
    (e) => new GetSubregistryHistoryError({ cause: e as GraphqlRequestError }),
  )

  return ok((eventConnection.totalCount ?? 0) > 0)
})

const getSubregistryHistoryQueryKey = createQueryKey<
  'get-subregistry-history',
  GetSubregistryHistoryParameters
>('get-subregistry-history')

/**
 * How to read an *empty* subregistry slot. The two cases look identical
 * on-chain and mean opposite things:
 *
 * - `never-configured` — no `SubregistryUpdated` was ever emitted for this
 *   name. Nothing has been lost; configuring a registry is a setup step.
 * - `detached` — the slot was written at least once and now reads zero. The
 *   name is damaged: its subnames still exist in the old registry and stopped
 *   resolving when the pointer went. Offering to configure a *new* registry
 *   here would let whoever holds the name re-mint someone else's label into it
 *   and strand the original token.
 * - `unknown` — still loading, or the lookup failed. Fails closed: callers
 *   gating a destructive offer on "never configured" can't be walked past the
 *   gate by an indexer that is down.
 */
export type SubregistrySlotState = 'unknown' | 'never-configured' | 'detached'

export type SubregistrySlot = {
  readonly state: SubregistrySlotState
  readonly isLoading: boolean
  readonly isError: boolean
}

export const useSubregistrySlot = (
  name: string,
  { enabled = true }: { enabled?: boolean } = {},
): SubregistrySlot => {
  const { data, isLoading, isError } = useQuery({
    ...resultQueryOptions({
      queryKey: getSubregistryHistoryQueryKey({ name }),
      queryFn: ({ queryKey: [, params] }) => getSubregistryHistory(params),
    }),
    enabled,
  })

  if (data === undefined) return { state: 'unknown', isLoading, isError }

  return { state: data ? 'detached' : 'never-configured', isLoading, isError }
}
