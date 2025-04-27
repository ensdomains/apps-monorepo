import { getRecords } from '@ensdomains/ensjs/public'
import { getSubgraphRecords } from '@ensdomains/ensjs/subgraph'
import { createQueryKey } from '@/utils/effect/tanstackQuery'
import { Effect } from 'effect'
import { WagmiClient } from '@/services/wagmi'
import { effectQueryOptions } from '@/utils/tanstack-query/queryOptions'

export const getProfile = Effect.fn(function* (name: string) {
  const client = yield* WagmiClient.client

  const subgraphRecords = yield* Effect.tryPromise(() =>
    getSubgraphRecords(client, { name }),
  )

  const records = yield* Effect.tryPromise(() =>
    getRecords(client, { name, ...subgraphRecords }),
  )

  return {
    records,
    subgraphRecords,
  }
})

export const profileQueryKey = createQueryKey<
  'profile',
  {
    name: string
  }
>('profile')

export const getProfileQueryOptions = (name: string) =>
  effectQueryOptions({
    queryKey: profileQueryKey({ name }),
    queryFn: ({ queryKey: [, { name }] }) => getProfile(name),
  })
