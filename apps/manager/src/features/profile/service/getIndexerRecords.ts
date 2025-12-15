import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import apolloClient from '@ens-apps/indexer/apollo'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetIndexerRecordsError extends TaggedError('GetIndexerRecordsError')<{
  cause: unknown
}> {}

export const getIndexerRecords = ResultFn(async function* (name: string) {
  const result = yield* await ResultAsync.fromPromise(
    apolloClient.query<DomainQuery>({
      query: DomainDocument,
      variables: { id: name },
      fetchPolicy: 'network-only',
    }),
    (error) => new GetIndexerRecordsError({ cause: error }),
  )

  const domain = result.data.domain

  const texts = domain?.resolver?.texts ?? []

  const indexerRecords = {
    isMigrated: true,
    createdAt: { date: new Date(), value: Date.now() },
    texts,
    // TODO: Get coins from GraphQL
    coins: [
      '2147483648',
      '60',
      '2147492101',
      '2147483658',
      '2147525809',
      '2147542792',
      '2148018000',
      '2147483785',
    ],
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
