import { readNameDetail } from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetNameDetailError extends TaggedError('GetNameDetailError')<{
  cause: unknown
}> {}

type GetNameDetailParameters = { readonly name: string }

const readDetail = readNameDetail(bigname)

/** A name's indexed detail, or null when bigname has not indexed it. */
export const getNameDetail = ({ name }: GetNameDetailParameters) =>
  readDetail({ name }).mapErr((cause) => new GetNameDetailError({ cause }))

export const nameDetailQueryKey = createQueryKey<
  'name-detail',
  GetNameDetailParameters
>('name-detail')

/** One read per name, shared by the expiry row and the records tab. */
export const getNameDetailQueryOptions = (params: GetNameDetailParameters) =>
  resultQueryOptions({
    queryKey: nameDetailQueryKey(params),
    queryFn: ({ queryKey: [, params] }) => getNameDetail(params),
  })
