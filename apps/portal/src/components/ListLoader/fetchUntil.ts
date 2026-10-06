import { TaggedError } from '@ens-apps/utils/neverthrow'

export type FetchMoreResult = {
  readonly loaded: number
  readonly hasMore: boolean
}

class ListStalledError extends TaggedError('ListStalledError')<{
  message: string
  cause: FetchMoreResult
}> {}

type FetchUntilParameters = FetchMoreResult & {
  readonly target: number
  readonly fetchMore: () => Promise<FetchMoreResult>
  readonly stalledPages?: number
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
      cause: { loaded, hasMore },
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
