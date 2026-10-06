/** Where a server-paged list stands after one more page. */
export type FetchMoreResult = {
  /** Rows loaded so far, across every page. */
  readonly loaded: number
  /**
   * Whether another page can be fetched. This is the only thing that ends the
   * paging, so the source has to turn it false when its cursor can't advance.
   */
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
 * A page that adds no rows does not end it. A page can legitimately come back
 * empty of rows while later pages hold some — history trims the transaction a
 * page boundary cut in half, and groups events into rows — so only `hasMore`
 * says the list is done.
 */
export const fetchUntil = async ({
  target,
  loaded,
  hasMore,
  fetchMore,
}: FetchUntilParameters): Promise<FetchMoreResult> => {
  if (loaded >= target || !hasMore) return { loaded, hasMore }

  return fetchUntil({ ...(await fetchMore()), target, fetchMore })
}
