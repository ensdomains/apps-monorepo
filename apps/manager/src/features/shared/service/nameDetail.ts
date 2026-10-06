import { readNameDetail } from '@ens-apps/indexer/bigname'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { skipToken } from '@tanstack/react-query'
import { bigname } from '@/lib/bigname'

const readDetail = readNameDetail(bigname)

/** A name's indexed detail, or null when bigname has not indexed it. */
export const nameDetailQuery = (name: string | undefined) =>
  resultQueryOptions({
    queryKey: qk('name', 'detail', { name: name ?? null }),
    queryFn: name ? () => readDetail({ name }) : skipToken,
  })
