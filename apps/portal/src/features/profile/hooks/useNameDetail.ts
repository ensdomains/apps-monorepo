import { type IndexerReadError, retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { indexer } from '@/lib/indexer'

class GetNameDetailError extends TaggedError('GetNameDetailError')<{
  cause: IndexerReadError
}> {}

type GetNameDetailParameters = { readonly name: string }

/** One name detail read, sent again while the indexer answers stale. */
export const readIndexedNameDetail = (
  query: GetNameDetailParameters,
  signal?: AbortSignal,
) =>
  retryStaleRead(
    (requestSignal) => indexer.getNameDetail(query, { signal: requestSignal }),
    { signal },
  )

/** A name's indexed detail, or null when the indexer has not indexed it. */
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
