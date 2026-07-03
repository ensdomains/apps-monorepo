import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'
import { backendClient } from '@/utils/backend-client'

/** Aggregate engagement stats for a name (public endpoint, no auth). */
export type NameStats = {
  readonly name: string
  readonly favorites: number
  readonly unique_searches_last_30d: number
}

export class GetNameStatsError extends TaggedError('GetNameStatsError')<{
  cause: unknown
}> {}

export const getNameStats = ResultFn(async function* (name: string) {
  const data = yield* await ResultAsync.fromPromise(
    backendClient.names[':name'].stats
      .$get({ param: { name } })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Failed to fetch name stats: ${response.statusText}`)
        return response.json()
      }),
    (error) => new GetNameStatsError({ cause: error }),
  )

  return ok(data as NameStats)
})

export const getNameStatsQueryOptions = (name: string) =>
  resultQueryOptions({
    queryKey: $qk({
      $service: 'backend',
      $scope: 'names',
      $action: 'stats',
      name,
    }),
    queryFn: () => getNameStats(name),
    staleTime: 60_000,
  })
