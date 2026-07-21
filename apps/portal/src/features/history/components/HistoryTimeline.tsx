import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ChevronsUpDownIcon, ListFilterIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { Hash } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NoResultsMessage } from '@/components/NoResultsMessage'
import { Button } from '@/components/ui/button'
import { Timeline } from '@/components/ui/timeline'
import { useTransactionSenders } from '@/features/profile/hooks/useTransactionSenders'
import { formatTimelineDate } from '../formatTimelineDate'
import { getNameHistoryTimelineQueryOptions } from '../hooks/useNameHistoryTimeline'
import { summarizeEvents } from '../summarize/summarizeEvents'
import { ActionSummaryRow } from './ActionSummaryRow'

interface HistoryTimelineProps {
  readonly name: string
}

/**
 * The History timeline: fetches the widened event feed, backfills tx senders (for the
 * "by {actor}" lines), summarizes raw events into semantic actions, and renders the
 * three-tier nested timeline.
 */
export const HistoryTimeline = ({ name }: HistoryTimelineProps) => {
  const {
    data: events,
    isLoading,
    error,
  } = useQuery(getNameHistoryTimelineQueryOptions({ name }))

  const transactionHashes = useMemo<Hash[]>(
    () => events?.map((event) => event.transactionHash) ?? [],
    [events],
  )

  // TODO(indexer): drop this RPC backfill once Event.from is indexed (spec §6.1).
  const { data: senders } = useTransactionSenders({ transactionHashes })

  const sendersByLowerHash = useMemo(() => {
    if (!senders) return undefined
    const map = new Map<string, string>()
    for (const [hash, from] of senders) map.set(hash.toLowerCase(), from)
    return map
  }, [senders])

  const actions = useMemo(
    () =>
      events ? summarizeEvents(events, { senders: sendersByLowerHash }) : [],
    [events, sendersByLowerHash],
  )

  if (isLoading) return <LoadingMessage />

  if (error) {
    return (
      <ErrorMessage
        title="Error loading history"
        description={error.cause?.message}
      />
    )
  }

  if (actions.length === 0) {
    return (
      <NoResultsMessage
        title="No history yet"
        description="This name doesn't have any recorded history. Activity will appear here once transactions are made."
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-heading">History</h1>
        {/* TODO: wire Date range / Event filter / Expand all (spec §1 non-goals for v1). */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            <CalendarIcon className="size-4" />
            Date range
          </Button>
          <Button variant="outline" size="sm" disabled>
            <ListFilterIcon className="size-4" />
            Event
          </Button>
          <Button variant="outline" size="sm" disabled>
            <ChevronsUpDownIcon className="size-4" />
            Expand all
          </Button>
        </div>
      </div>

      <Timeline>
        {actions.map((action, index) => (
          <ActionSummaryRow
            key={action.id}
            action={action}
            senders={sendersByLowerHash}
            showDate={
              index === 0 ||
              formatTimelineDate(actions[index - 1].timestamp) !==
                formatTimelineDate(action.timestamp)
            }
          />
        ))}
      </Timeline>
    </div>
  )
}
