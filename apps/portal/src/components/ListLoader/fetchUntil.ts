import { TaggedError } from '@ens-apps/utils/neverthrow'

class ListStalledError extends TaggedError('ListStalledError')<{
  message: string
}> {}

/** Where a server-paged list stands after one more page. */
export type FetchMoreResult = {
  readonly loaded: number
  readonly hasMore: boolean
}

type FetchUntilParameters = FetchMoreResult & {
  readonly target: number
  readonly fetchMore: () => Promise<FetchMoreResult>
  readonly stalledPages?: number
}

const MAX_STALLED_PAGES = 5

/**
 * Fetches pages until `target` rows are loaded or `hasMore` turns false.
 * Rejects if the source keeps claiming more without adding rows.
 */
export const fetchUntil = async ({
  target,
  loaded,
  hasMore,
  fetchMore,
  stalledPages = 0,
}: FetchUntilParameters): Promise<FetchMoreResult> => {
  if (loaded >= target || !hasMore) return { loaded, hasMore }
  if (stalledPages >= MAX_STALLED_PAGES)
    throw new ListStalledError({
      message: 'The list stopped returning rows before it ended',
    })

  const next = await fetchMore()

  return fetchUntil({
    ...next,
    target,
    fetchMore,
    stalledPages: next.loaded > loaded ? 0 : stalledPages + 1,
  })
}
