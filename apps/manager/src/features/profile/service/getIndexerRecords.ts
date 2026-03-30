import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import { getIndexerDomain } from './getIndexerDomain'

export const getIndexerRecords = ResultFn(async function* (name: string) {
  const domain = yield* getIndexerDomain(name)
  const resolver = domain?.resolver

  const texts = resolver?.texts ?? []
  const coins = resolver?.addresses?.map((address) => address.coinType) ?? []

  const indexerRecords = {
    isMigrated: true,
    createdAt: { date: new Date(), value: Date.now() },
    texts,
    coins,
    resolverAddress: resolver?.address,
    coinAddresses: resolver?.addresses ?? [],
    contentHash: resolver?.contentHash ?? null,
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
