import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetRecordsErrorType, getRecords } from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getSubgraphRecords } from './useSubgraphRecords'

class RecordsError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType
}> {}

export const getProfile = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const subgraphRecords = yield* getSubgraphRecords(name)

  const records = yield* await fromPromise(
    getRecords(client, {
      name,
      ...subgraphRecords,
      contentHash: true,
      abi: true,
    }),
    (e) => new RecordsError({ cause: e as GetRecordsErrorType }),
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
