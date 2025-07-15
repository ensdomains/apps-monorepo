import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetRecordsReturnType, getRecords } from '@ensdomains/ensjs/public'
import { getSubgraphRecords } from '@ensdomains/ensjs/subgraph'
import { err, fromPromise, ok } from 'neverthrow'
import type { Prettify } from 'viem'
import { safeGetClient } from '@/lib/wagmi/helpers'

class SubgraphError extends TaggedError('SubgraphError')<{
  cause: unknown
}> {}

class RecordsError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

const yeet = {} as unknown as GetRecordsReturnType<
  string[],
  string[],
  false,
  false
>

type dasd = keyof typeof yeet

export const getProfileRecords = ResultFn(async function* (name: string) {
  const client = yield* safeGetClient()

  const subgraphRecords = yield* await fromPromise(
    getSubgraphRecords(client as any, { name }),
    (e) => new SubgraphError({ cause: e }),
  )

  if (!subgraphRecords) {
    return err(new SubgraphError({ cause: 'No subgraph records found' }))
  }

  const records = yield* await fromPromise(
    getRecords(client, { name, ...subgraphRecords }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok({
    ...records,
    _rawSubgraphRecords: subgraphRecords,
  })
})

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
