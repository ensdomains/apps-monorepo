export type FetchMoreResult = {
  readonly loaded: number
  readonly hasMore: boolean
}

type FetchUntilParameters = FetchMoreResult & {
  readonly target: number
  readonly fetchMore: () => Promise<FetchMoreResult>
}

/** Fetches pages until `target` rows are loaded or `hasMore` turns false. */
export const fetchUntil = async ({
  target,
  loaded,
  hasMore,
  fetchMore,
}: FetchUntilParameters): Promise<FetchMoreResult> => {
  if (loaded >= target || !hasMore) return { loaded, hasMore }

  return fetchUntil({ ...(await fetchMore()), target, fetchMore })
}
