import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { type GetRecordsReturnType, getRecords } from '@ensdomains/ensjs/public'
import { getSubgraphRecords } from '@ensdomains/ensjs/subgraph'
import { fromPromise, ok } from 'neverthrow'
import { safeGetClient } from '@/lib/wagmi/helpers'
import {
  alwaysProbeAddressRecords,
  forceFetchRecords,
} from '../data/records/utils'
import { DEBUG_PROFILE } from '../MOCK'

class SubgraphError extends TaggedError('SubgraphError')<{
  cause: unknown
}> {}

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

  const subgraphRecords = yield* await fromPromise(
    // biome-ignore lint/suspicious/noExplicitAny: ENSJS client types are not updated for subgraph actions yet
    getSubgraphRecords(client as any, { name }),
    (e) => new SubgraphError({ cause: e }),
  )
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
    getRecords(client, {
      name,
      texts,
      coins,
    }),
    (e) => new RecordsError({ cause: e }),
  )

  return ok({
    ...records,
    _rawSubgraphRecords: subgraphRecords,
  })
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
    queryFn: ({ queryKey: [{ name }] }) => getProfileRecords(name),
  })
