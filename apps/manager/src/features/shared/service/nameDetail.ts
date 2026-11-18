import { retryStaleRead } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { indexer } from '@/lib/indexer'

/** One name detail read, sent again while the indexer answers stale. */
export const getNameDetail = (name: string, signal?: AbortSignal) =>
  retryStaleRead(
    (requestSignal) =>
      indexer.getNameDetail({ name }, { signal: requestSignal }),
    { signal },
  )

/** A name's indexed detail, or null when the indexer has not indexed it. */
export const getNameDetailQueryOptions = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('name', 'detail', { name: name ?? null }),
    queryFn: name ? ({ signal }) => getNameDetail(name, signal) : skipToken,
  })
