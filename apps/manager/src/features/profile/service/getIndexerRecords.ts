import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetIndexerRecordsError extends TaggedError('GetIndexerRecordsError')<{
  cause: unknown
}> {}

export const getIndexerRecords = ResultFn(async function* (name: string) {
  const data = yield* await ResultAsync.fromPromise(
    indexerClient
      .query<DomainQuery>(DomainDocument, { id: name })
      .toPromise()
      .then((result) => {
        if (result.error) throw result.error
        if (!result.data) throw new Error('Indexer query returned no data')
        return result.data
      }),
    (error) => new GetIndexerRecordsError({ cause: error }),
  )

  const domain = data.domain

  const texts = domain?.resolver?.texts ?? []
  const coins =
    domain?.resolver?.addresses?.map((address) => address.coinType) ?? []

  const indexerRecords = {
    isMigrated: true,
    createdAt: { date: new Date(), value: Date.now() },
    texts,
    coins,
  }

  return ok(indexerRecords)
})

export const indexerRecordsQueryKey = createQueryKey<
  'indexer-records',
  { name: string }
>('indexer-records')

export const getIndexerRecordsQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: indexerRecordsQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getIndexerRecords(name),
  })
