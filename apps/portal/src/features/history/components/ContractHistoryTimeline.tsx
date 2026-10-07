import { resultInfiniteQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { extractErrorMessage } from '@/utils/errors/extractErrorMessage'
import { useTimelinePagesModel } from '../hooks/useHistoryTimeline'
import {
  fetchTimelineEventPage,
  HISTORY_TIMELINE_PAGE_SIZE,
  timelinePageParams,
} from '../timelineEventPage'
import { HistoryTimelineView } from './HistoryTimeline'

export const CONTRACT_HISTORY_TIMELINE = 'get-contract-history-timeline'

const contractHistoryTimelineQueryKey = createQueryKey<
  typeof CONTRACT_HISTORY_TIMELINE,
  { readonly address: Address }
>(CONTRACT_HISTORY_TIMELINE)

/** Everything a contract emitted, newest first, paged — a registry or a resolver. */
export const ContractHistoryTimeline = ({
  address,
  heading,
  action,
  errorTitle,
  emptyDescription,
}: {
  readonly address: Address
  readonly heading?: ReactNode
  readonly action?: ReactNode
  readonly errorTitle: string
  readonly emptyDescription: string
}) => {
  // The top-level connection filtered on `contractAddress`, not
  // `registry(address:) { eventConnection }`: same feed (verified — identical
  // totalCount and first 200 ids), but the nested field drops variable arguments,
  // so `first` fell back to the default and `after` was ignored.
  const model = useTimelinePagesModel(
    resultInfiniteQueryOptions({
      queryKey: contractHistoryTimelineQueryKey({ address }),
      queryFn: ({ queryKey: [, { address }], pageParam }) =>
        fetchTimelineEventPage({
          where: { contractAddress: address.toLowerCase() },
          first: HISTORY_TIMELINE_PAGE_SIZE,
          after: pageParam,
        }),
      ...timelinePageParams,
    }),
  )

  if (model.isLoading) return <LoadingMessage />
  if (model.error) {
    return (
      <ErrorMessage
        title={errorTitle}
        description={extractErrorMessage(model.error, '')}
      />
    )
  }

  return (
    <HistoryTimelineView
      model={model}
      breakContent="load-more"
      heading={heading}
      action={action}
      // The contract is the subject, not the actor, so each row says who did it.
      showActor
      emptyTitle="No history yet"
      emptyDescription={emptyDescription}
    />
  )
}
