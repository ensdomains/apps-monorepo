import {
  DomainsDocument,
  type DomainsQuery,
  type DomainsQueryVariables,
} from '@ens-apps/indexer'
import apolloClient from '@ens-apps/indexer/apollo'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { ok, ResultAsync } from 'neverthrow'

export class GetDomainsError extends TaggedError('GetDomainsError')<{
  cause: unknown
}> {}

export const getDomains = ResultFn(async function* (
  variables: DomainsQueryVariables,
) {
  const result = yield* await ResultAsync.fromPromise(
    apolloClient.query<DomainsQuery, DomainsQueryVariables>({
      query: DomainsDocument,
      variables,
      fetchPolicy: 'network-only',
    }),
    (error) => new GetDomainsError({ cause: error }),
  )

  return ok(result.data)
})

export const getDomainsQuery = (variables: DomainsQueryVariables | undefined) =>
  resultQueryOptions({
    queryKey: qk('dashboard', 'domains', variables ?? {}),
    queryFn: variables ? () => getDomains(variables) : skipToken,
  })
