import {
  isStale,
  type NameHistoryRow,
  retryStale,
  toDate,
} from '@ens-apps/indexer/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { bigname } from '@/lib/bigname'

class GetProfileCreationError extends TaggedError('GetProfileCreationError')<{
  readonly cause: unknown
}> {}

export const getProfileCreationEvent = (row: NameHistoryRow | undefined) => {
  const createdAt = toDate(row?.timestamp)
  if (row?.type !== 'registration' || !createdAt || !row.transaction_hash) {
    return null
  }
  return { createdAt, transactionHash: row.transaction_hash }
}

/** The oldest registration dates the name's creation, even after re-registration. */
export const getProfileCreationQueryOptions = ({
  name,
}: {
  readonly name: string
}) =>
  resultQueryOptions({
    queryKey: qk('profile', 'creation', { name }),
    queryFn: ({ signal }) =>
      retryStale(
        (requestSignal) =>
          bigname.nameHistory(
            name,
            {
              namespace: 'ens',
              type: ['registration'],
              order: 'asc',
              page_size: 1,
            },
            { signal: requestSignal },
          ),
        isStale,
        { signal },
      )
        .map(({ data }) => getProfileCreationEvent(data[0]))
        .mapErr((cause) => new GetProfileCreationError({ cause })),
  })
