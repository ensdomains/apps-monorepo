import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetFavoriteDetailsError extends TaggedError('GetFavoriteDetailsError')<{
  cause: unknown
}> {}

export const favoriteReadOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const

/** Each batch owns its query state, so failures preserve the other batches. */
export const getFavoriteDetailsQueryOptions = (names: readonly string[]) =>
  resultQueryOptions({
    ...favoriteReadOptions,
    queryKey: qk('favorites', 'details', { names }),
    queryFn: ({ signal }) =>
      bigname
        .lookup(
          {
            profile: 'detail',
            namespace: 'ens',
            inputs: names.map((name) => ({ name })),
          },
          { signal },
        )
        .map(({ data }) => data)
        .mapErr((cause) => new GetFavoriteDetailsError({ cause })),
    enabled: names.length > 0,
  })
