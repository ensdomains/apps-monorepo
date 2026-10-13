import { readNameDetail, retryStale } from '@ens-apps/indexer/bigname'
import type { IndexerReadError } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetNameDetailError extends TaggedError('GetNameDetailError')<{
  cause: IndexerReadError
}> {}

type GetNameDetailParameters = { readonly name: string }

const readDetail = readNameDetail(bigname)

/** One name detail read, sent again while bigname answers stale. */
export const readIndexedNameDetail = (
  query: GetNameDetailParameters,
  signal?: AbortSignal,
) =>
  retryStale(
    (requestSignal) => readDetail(query, { signal: requestSignal }),
    (error: IndexerReadError) => error.kind === 'stale',
    { signal },
  )

/** A name's indexed detail, or null when bigname has not indexed it. */
const getNameDetail = (query: GetNameDetailParameters, signal?: AbortSignal) =>
  readIndexedNameDetail(query, signal).mapErr(
    (cause) => new GetNameDetailError({ cause }),
  )

export const nameDetailQueryKey = createQueryKey<
  'name-detail',
  GetNameDetailParameters
>('name-detail')

/** One read per name, shared by the expiry row and the records tab. */
export const getNameDetailQueryOptions = (params: GetNameDetailParameters) =>
  resultQueryOptions({
    queryKey: nameDetailQueryKey(params),
    queryFn: ({ queryKey: [, params], signal }) =>
      getNameDetail(params, signal),
  })
