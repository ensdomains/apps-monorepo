/** Where a server-paged list stands after one more page. */
export type FetchMoreResult = {
  /** Rows loaded so far, across every page. */
  readonly loaded: number
  readonly hasMore: boolean
}

type FetchUntilParameters = FetchMoreResult & {
  /** Stop once this many rows are loaded. `Infinity` loads everything. */
  readonly target: number
  /** Loads the next page; rejects when it fails. */
  readonly fetchMore: () => Promise<FetchMoreResult>
}

/**
 * Loads pages one after another until `target` rows are in, or the list runs
 * out. Pages are a fixed size the caller doesn't choose, so reaching a target
 * can take several.
 *
 * A page that adds no rows ends it, even while `hasMore` is still claimed: a
 * source whose cursor stopped advancing would otherwise be asked forever.
 */
export const fetchUntil = async ({
  target,
  loaded,
  hasMore,
  fetchMore,
}: FetchUntilParameters): Promise<FetchMoreResult> => {
  if (loaded >= target || !hasMore) return { loaded, hasMore }

  const next = await fetchMore()
  if (next.loaded <= loaded) return next

  return fetchUntil({ ...next, target, fetchMore })
}
