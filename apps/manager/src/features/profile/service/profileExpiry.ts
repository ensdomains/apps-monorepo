import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetExpiryError extends TaggedError('GetExpiryError')<{
  cause: unknown
}> {}

export const getExpiry = ResultFn(async function* (name: string) {
  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<DomainQuery>(DomainDocument, { id: name })
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetExpiryError({ cause: error }),
  )

  const expiryDate = data.domain?.expiryDate

  if (!expiryDate) {
    return ok({ expiry: undefined as unknown as bigint })
  }

  return ok({ expiry: BigInt(expiryDate) })
})

export const profileExpiryQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'expiry', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getExpiry(name),
  })
