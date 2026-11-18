import type { HistoryEvent } from '@ens-apps/indexer/reads'
import { retryStaleRead } from '@ens-apps/indexer/reads'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { indexer } from '@/lib/indexer'

class GetProfileCreationError extends TaggedError('GetProfileCreationError')<{
  readonly cause: unknown
}> {}

export const getProfileCreationEvent = (event: HistoryEvent | undefined) => {
  if (
    event?.type !== 'registration' ||
    !event.timestamp ||
    !event.transactionHash
  ) {
    return null
  }
  return { createdAt: event.timestamp, transactionHash: event.transactionHash }
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
      retryStaleRead(
        (requestSignal) =>
          indexer.getNameHistory(
            { name, types: ['registration'], order: 'asc', pageSize: 1 },
            { signal: requestSignal },
          ),
        { signal },
      )
        // An unindexed name has no history to date it by.
        .map((page) => getProfileCreationEvent(page?.items[0]))
        .mapErr((cause) => new GetProfileCreationError({ cause })),
  })
