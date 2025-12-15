import {
  DomainsDocument,
  type DomainsQuery,
  type DomainsQueryVariables,
} from '@ens-apps/indexer'
import apolloClient from '@ens-apps/indexer/apollo'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetRegistrationError extends TaggedError('GetRegistrationError')<{
  cause: unknown
}> {}

export const getRegistration = ResultFn(async function* (name: string) {
  const result = yield* await ResultAsync.fromPromise(
    apolloClient.query<DomainsQuery, DomainsQueryVariables>({
      query: DomainsDocument,
      variables: {
        where: { name },
        first: 1,
        skip: 0,
      },
      fetchPolicy: 'network-only',
    }),
    (error) => new GetRegistrationError({ cause: error }),
  )

  const domain = result.data.domains[0]

  if (!domain) {
    return ok({ registrationDate: undefined as unknown as number })
  }

  return ok({
    registrationDate: domain.createdAt,
  } as { registrationDate: number })
})

export const profileRegistrationQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registration', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getRegistration(name),
  })
