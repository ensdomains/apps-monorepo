import { MAX_PAGE_SIZE, nullOnNotFound } from '@ens-apps/bigname'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { fromPromise, ok } from 'neverthrow'
import { toSubnames } from '@/features/profile/hooks/useSubnames'
import { bigname } from '@/lib/bigname'
import type { OwnedName } from '../utils/ownedNamesUtils'

/** Subname pages in flight at once. */
const SUBNAME_FETCH_CONCURRENCY = 4

class GetOwnedSubnamesError extends TaggedError('GetOwnedSubnamesError')<{
  cause: unknown
}> {}

type GetOwnedSubnamesParameters = {
  /** Owned names to list the subnames of (`subnameParents`). */
  parents: readonly string[]
}

/** Maps `items` through `fn`, at most `limit` calls in flight, in order. */
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

/**
 * The live subnames of one name that have a page to navigate to, first page
 * only. A parent bigname has not indexed has none.
 */
const fetchSubnamePage = async (parent: string): Promise<OwnedName[]> => {
  const page = await nullOnNotFound(
    bigname.listSubnames(parent, {
      include_expired: false,
      sort: 'name',
      page_size: MAX_PAGE_SIZE,
    }),
  )
  return toSubnames(page?.data ?? [], parent)
    .filter(({ hasNameRow }) => hasNameRow)
    .map(({ name }) => ({ name }))
}

/**
 * Direct subnames of the given owned names, for "Names you own" in search.
 *
 * Stopgap pending a bigname relation for "subnames of names I hold": no
 * address read lists them, so this fans out one `/subnames` page per parent.
 * The Panoptes read it replaces returned every subdomain of every owned name;
 * this one is capped at `MAX_SUBNAME_PARENTS` parents and `MAX_PAGE_SIZE`
 * live children each, by name.
 */
export const getOwnedSubnames = ResultFn(async function* ({
  parents,
}: GetOwnedSubnamesParameters) {
  const pages = yield* fromPromise(
    mapWithConcurrency(parents, SUBNAME_FETCH_CONCURRENCY, fetchSubnamePage),
    (e) => new GetOwnedSubnamesError({ cause: e }),
  )
  return ok(pages.flat())
})

const getOwnedSubnamesQueryKey = createQueryKey<
  'get-owned-subnames',
  GetOwnedSubnamesParameters
>('get-owned-subnames')

export const getOwnedSubnamesQueryOptions = (
  params: GetOwnedSubnamesParameters,
) =>
  resultQueryOptions({
    queryKey: getOwnedSubnamesQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getOwnedSubnames(params),
  })
