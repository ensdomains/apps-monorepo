import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetFavoriteVersionsError extends TaggedError('GetFavoriteVersionsError')<{
  cause: unknown
}> {}

export const favoriteReadOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const

/** Each batch owns its query state, so failures preserve the other batches. */
export const getFavoriteVersionsQueryOptions = (names: readonly string[]) =>
  resultQueryOptions({
    ...favoriteReadOptions,
    queryKey: qk('favorites', 'versions', { names }),
    queryFn: ({ signal }) =>
      bigname
        .lookup(
          {
            profile: 'feed',
            namespace: 'ens',
            inputs: names.map((name) => ({ name })),
          },
          { signal },
        )
        .map(({ data }) => data)
        .mapErr((cause) => new GetFavoriteVersionsError({ cause })),
    enabled: names.length > 0,
  })
