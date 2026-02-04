import { useInfiniteQuery } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { NotificationItem } from '@/features/notifications/components/items'
import { notificationsInfiniteQuery } from '@/features/notifications/queries/notifications'

export const NotificationsList = () => {
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(notificationsInfiniteQuery)

  // Flatten all notifications from all pages
  const allNotifications = data ?? []

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

  if (allNotifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center">
        <MSymbol className="ms-opsz-75 ms-wght-200" symbol="sentiment_calm" />
        <div className="text-[#717182] text-base">You're all caught up!</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {allNotifications.map((notification) => (
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
