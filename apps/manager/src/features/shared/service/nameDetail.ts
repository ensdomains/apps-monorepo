import { readNameDetail, retryStale } from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'

const readDetail = readNameDetail(bigname)

/** One name detail read, sent again while bigname answers stale. */
export const getNameDetail = (name: string, signal?: AbortSignal) =>
  retryStale(
    (requestSignal) => readDetail({ name }, { signal: requestSignal }),
    (error: IndexerReadError) => error.kind === 'stale',
    { signal },
  )

/** A name's indexed detail, or null when bigname has not indexed it. */
export const getNameDetailQueryOptions = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('name', 'detail', { name: name ?? null }),
    queryFn: name ? ({ signal }) => getNameDetail(name, signal) : skipToken,
  })
