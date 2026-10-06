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
  /** Aborting stops before the next page; a page in flight still lands. */
  readonly signal?: AbortSignal
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
  signal,
}: FetchUntilParameters): Promise<FetchMoreResult> => {
  if (loaded >= target || !hasMore || signal?.aborted)
    return { loaded, hasMore }
  if (stalledPages >= MAX_STALLED_PAGES)
    throw new ListStalledError({
      message: 'The list stopped returning rows before it ended',
    })

  const next = await fetchMore()

  return fetchUntil({
    ...next,
    target,
    fetchMore,
    signal,
    stalledPages: next.loaded > loaded ? 0 : stalledPages + 1,
  })
}
