import type { GraphqlRequestError } from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { gql } from '@urql/core'
import { fromPromise, ok } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { namehash } from 'viem'
import { normalize } from 'viem/ens'
import { graphqlIndexerClient } from '@/lib/indexer'

class GetSubregistryHistoryError extends TaggedError(
  'GetSubregistryHistoryError',
)<{
  cause: GraphqlRequestError
}> {}

type GetSubregistryHistoryParameters = {
  readonly name: string
}

export const getSubregistryHistory = ResultFn(async function* ({
  name,
}: GetSubregistryHistoryParameters) {
  // The `$name` route param is never normalized. A spelling that doesn't
  // normalize has no canonical node to look up, and hashing a fallback spelling
  // would miss the real node's events and read as `never-configured` — the one
  // verdict that offers the write. Unknown instead, which the hook fails closed.
  let normalizedName: string
  try {
    normalizedName = normalize(name)
  } catch {
    return ok(null)
  }

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
      { namehash: namehash(normalizedName) },
    ),
    (e) => new GetSubregistryHistoryError({ cause: e as GraphqlRequestError }),
  )

  // A connection that reports no count at all is not a name with no history —
  // the caller must be able to tell those apart, so the absence is preserved.
  return ok(eventConnection.totalCount)
})

const getSubregistryHistoryQueryKey = createQueryKey<
  'get-subregistry-history',
  GetSubregistryHistoryParameters
>('get-subregistry-history')

/**
 * How to read an *empty* subregistry slot. The two configured states look
 * identical on-chain and mean opposite things:
 *
 * - `never-configured` — no `SubregistryUpdated` was ever emitted for this
 *   name. Nothing has been lost; configuring a registry is a setup step.
 * - `detached` — the slot was written at least once and now reads zero. The
 *   name is damaged: its subnames still exist in the old registry and stopped
 *   resolving when the pointer went. Offering to configure a *new* registry
 *   here would let whoever holds the name re-mint someone else's label into it
 *   and strand the original token.
 *
 * `loading` and `error` are states of their own rather than flags beside the
 * verdict, so there is no value that means both "we don't know" and "never
 * configured" — a caller gating a destructive offer can only reach it through
 * `never-configured`.
 */
export type SubregistrySlot =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'never-configured' }
  | { readonly status: 'detached' }

/**
 * Opts out of the app-wide one-hour `staleTime`: this gates whether the app
 * offers to deploy a registry, and a cached "never configured" from before a
 * detach is the exact answer that would re-open the re-mint surface.
 */
export const useSubregistrySlot = (
  name: string,
  { enabled = true }: { readonly enabled?: boolean } = {},
): SubregistrySlot => {
  const { data, isError } = useQuery({
    ...resultQueryOptions({
      queryKey: getSubregistryHistoryQueryKey({ name }),
      queryFn: ({ queryKey: [, params] }) => getSubregistryHistory(params),
    }),
    enabled,
    staleTime: 0,
  })

  return (
    match({ isError, data })
      .with({ isError: true }, () => ({ status: 'error' }) as const)
      // A null count is the indexer declining to answer, not a zero.
      .with({ data: null }, () => ({ status: 'error' }) as const)
      .with({ data: P.nullish }, () => ({ status: 'loading' }) as const)
      .with({ data: P.number.gt(0) }, () => ({ status: 'detached' }) as const)
      .otherwise(() => ({ status: 'never-configured' }) as const)
  )
}
