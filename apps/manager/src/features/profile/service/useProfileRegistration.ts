import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetRegistrationError extends TaggedError('GetRegistrationError')<{
  cause: unknown
}> {}

export const getRegistration = ResultFn(async function* (name: string) {
  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<DomainQuery>(DomainDocument, { id: name })
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetRegistrationError({ cause: error }),
  )

  const domain = data.domain

  if (!domain) {
    return ok({ registrationDate: undefined as unknown as number })
  }

  return ok({
    registrationDate: domain.createdAt,
  } as { registrationDate: number })
})

export const useProfileRegistrationQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'registration', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getRegistration(name),
  })
