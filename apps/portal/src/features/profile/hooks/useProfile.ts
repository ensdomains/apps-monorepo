import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { GetRecordsErrorType } from '@ensdomains/ensjs/public'
import type { GetSubgraphRecordsErrorType } from '@ensdomains/ensjs/subgraph'
import { ok } from 'neverthrow'
import { getRecords } from './useRecords'
import { getSubgraphRecords } from './useSubgraphRecords'

export class GetProfileError extends TaggedError('RecordsError')<{
  cause: GetRecordsErrorType | GetSubgraphRecordsErrorType
}> {}

export const getProfile = ResultFn(async function* (name: string) {
  const subgraphRecords = yield* getSubgraphRecords(name)

  const records = yield* getRecords({
    name,
    ...subgraphRecords,
    contentHash: true,
    abi: true,
    ignoreInvalidCoinTypes: true,
  })

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
