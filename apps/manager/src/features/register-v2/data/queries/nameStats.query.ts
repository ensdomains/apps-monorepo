import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { $qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { err, ok, ResultAsync } from 'neverthrow'
import { backendClient } from '@/utils/backend-client'

/** Aggregate engagement stats for a name (public endpoint, no auth). */
export type NameStats = {
  readonly name: string
  readonly favorites: number
  readonly unique_searches_last_30d: number | null
}

export class GetNameStatsError extends TaggedError('GetNameStatsError')<{
  cause: unknown
}> {}

const isNameStats = (data: unknown): data is NameStats =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as Record<string, unknown>).name === 'string' &&
  typeof (data as Record<string, unknown>).favorites === 'number' &&
  ((data as Record<string, unknown>).unique_searches_last_30d === null ||
    typeof (data as Record<string, unknown>).unique_searches_last_30d ===
      'number')

export const getNameStats = ResultFn(async function* (name: string) {
  const data: unknown = yield* ResultAsync.fromPromise(
    backendClient.names[':name'].stats
      .$get({ param: { name } })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Failed to fetch name stats: ${response.statusText}`)
        return response.json()
      }),
    (error) => new GetNameStatsError({ cause: error }),
  )

  if (!isNameStats(data)) {
    return err(
      new GetNameStatsError({
        cause: new Error('Unexpected name stats response shape'),
      }),
    )
  }

  return ok(data)
})

/** Unknown search demand stays absent while independently available favorites remain visible. */
export const getNameStatsDemand = (data: NameStats | undefined) =>
  data
    ? {
        favoriteCount: data.favorites,
        searchCount30d: data.unique_searches_last_30d ?? undefined,
      }
    : undefined

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
