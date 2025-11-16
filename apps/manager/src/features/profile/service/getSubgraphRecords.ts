import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'

// biome-ignore lint/correctness/useYield: stubbed implementation does not need to yield
export const getSubgraphRecords = ResultFn(async function* (_name: string) {
  const subgraphRecords = {
    isMigrated: true,
    createdAt: { date: new Date(), value: Date.now() },
    texts: [
      'com.twitter',
      'com.discord',
      'com.github',
      'avatar',
      'header',
      'org.telegram',
      'url',
      'name',
      'email',
      'location',
      'description',
    ],
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
