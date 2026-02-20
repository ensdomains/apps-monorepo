import { notificationDefinitions } from '@ens-apps/shared-schema/notifications'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { notificationsInfiniteQuery } from '@/features/notifications/data/queries/notifications'
import { NotificationItem } from './notification-item'

type NotificationsListProps = {
  unreadOnly?: boolean
  selectedTag?: string
}

export const NotificationsList = ({
  unreadOnly = false,
  selectedTag = 'all',
}: NotificationsListProps) => {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(notificationsInfiniteQuery)

  const filteredData =
    data?.filter((notification) => {
      if (unreadOnly && notification.seen) return false

      if (selectedTag === 'all') return true

      const tags =
        (notificationDefinitions[notification.kind].metadata.tags as
          | readonly string[]
          | undefined) ?? []
      return tags.includes(selectedTag)
    }) ?? []

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center">
        <Loader2Icon className="size-10 animate-spin" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="text-ens-garnet-core text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  if (filteredData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center">
        <MSymbol className="ms-opsz-75 ms-wght-200" symbol="sentiment_calm" />
        <div className="text-[#717182] text-base">You're all caught up!</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {filteredData.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
      {hasNextPage && (
        <Button
          className="w-fit"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          variant="outline"
        >
          {isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      )}
    </div>
  )
}
