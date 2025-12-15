import { DomainDocument, type DomainQuery } from '@ens-apps/indexer'
import apolloClient from '@ens-apps/indexer/apollo'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetSubgraphRecordsError extends TaggedError('GetSubgraphRecordsError')<{
  cause: unknown
}> {}

export const getSubgraphRecords = ResultFn(async function* (name: string) {
  const result = yield* await ResultAsync.fromPromise(
    apolloClient.query<DomainQuery>({
      query: DomainDocument,
      variables: { id: name },
      fetchPolicy: 'network-only',
    }),
    (error) => new GetSubgraphRecordsError({ cause: error }),
  )

  const domain = result.data.domain

  const texts = domain?.resolver?.texts ?? []

  const subgraphRecords = {
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

  return ok(subgraphRecords)
})

export const subgraphRecordsQueryKey = createQueryKey<
  'subgraph-records',
  { name: string }
>('subgraph-records')

export const getSubgraphRecordsQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: subgraphRecordsQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getSubgraphRecords(name),
  })
