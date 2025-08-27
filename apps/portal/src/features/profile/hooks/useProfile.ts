import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getRecords } from '@ensdomains/ensjs/public'
import { getSubgraphRecords } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'

class SubgraphError extends TaggedError('SubgraphError')<{
  cause: unknown
}> {}

class RecordsError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

export const getProfile = ResultFn(async function* (name: string) {
  // const client = yield* fromSync(() => getClient(wagmiConfig), ClientError.from)
  const client = yield* safeGetClient()

  const subgraphRecords = yield* await fromPromise(
    getSubgraphRecords(client, { name }),
    (e) => new SubgraphError({ cause: e }),
  )

  const records = yield* await fromPromise(
    getRecords(client, {
      name,
      ...subgraphRecords,
      contentHash: true,
      abi: true,
    }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok({
    records,
    subgraphRecords,
  })
})

export const profileQueryKey = createQueryKey<
  'profile',
  {
    name: string
  }
>('profile')

export const getProfileQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile(name),
  })
