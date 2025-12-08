import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import {
  getRecords as ensjs_getRecords,
  type GetRecordsReturnType,
} from '@ensdomains/ensjs/public'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { alwaysProbeAddressRecords, forceFetchRecords } from '../data/records'
import { DEBUG_PROFILE } from '../MOCK'
import { getSubgraphRecords } from './getSubgraphRecords'

class RecordsError extends TaggedError('RecordsError')<{
  cause: unknown
}> {}

export const getProfileRecords = ResultFn(async function* (name: string) {
  if (name === 'debug') {
    return ok({
      ...DEBUG_PROFILE,
      _rawSubgraphRecords: {
        isMigrated: false,
        createdAt: new Date(),
      } as unknown as NonNullable<typeof subgraphRecords>,
    })
  }

  const client = yield* safeGetClient()
  const subgraphRecords = yield* getSubgraphRecords(name)

  const texts = [
    ...forceFetchRecords.always,
    ...(subgraphRecords
      ? subgraphRecords.texts.filter(
          (t) => !forceFetchRecords.always.includes(t),
        )
      : forceFetchRecords.whenNotIndexed),
  ]

  const coins = subgraphRecords
    ? [
        ...subgraphRecords.coins.filter(
          (c) => !alwaysProbeAddressRecords.includes(c),
        ),
        ...alwaysProbeAddressRecords,
      ]
    : alwaysProbeAddressRecords

  const records = yield* await fromPromise(
    ensjs_getRecords(client, {
      name,
      coins,
      texts,
      ignoreInvalidCoinTypes: true,
    }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok(records)
})

export type ProfileRecordsResult = GetRecordsReturnType<
  readonly string[],
  readonly (string | number)[],
  false,
  false
>

export const profileRecordsQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'get_records', { name }),
    meta: { persist: true },
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
