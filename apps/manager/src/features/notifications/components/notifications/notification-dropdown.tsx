import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store/react'
import { ArrowUpRight, SmileIcon } from 'lucide-react'
import { Button, LinkButton } from '@/components/ui/button'
import { isBackendAuthed } from '@/utils/backend-client'
import { signInBackendMutation } from '../../queries/auth'
import {
  notificationsInfiniteQuery,
  unreadCountQuery,
} from '../../queries/notifications'
import { NotificationItem } from './notification-items'

export const NotificationsDropdown = ({
  onAction,
}: {
  onAction?: () => void
}) => {
  const isAuthed = useAtom(isBackendAuthed)

  if (!isAuthed) {
    return <UnauthenticatedContent onAction={onAction} />
  }

  return <AuthenticatedContent onAction={onAction} />
}

const UnauthenticatedContent = ({ onAction }: { onAction?: () => void }) => {
  const signIn = useMutation(signInBackendMutation)

  const handleSignIn = async () => {
    try {
      await signIn.mutateAsync()
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }

  return (
    <div className="">
      <div className="flex items-center justify-between pl-4">
        <h1 className="font-normal text-2xl">Notifications</h1>
      </div>
      <div className="px-4 py-6">
        <div className="space-y-4 text-center">
          <div className="space-y-2">
            <h3 className="font-medium text-lg">Connect your wallet</h3>
            <p className="text-muted-foreground text-sm">
              Sign in to receive notifications about your ENS domains, including
              transfers, expiry reminders, and important updates.
            </p>
          </div>

          <Button
            onClick={handleSignIn}
            disabled={signIn.isPending}
            className="w-full"
            size="lg"
          >
            {signIn.isPending ? 'Signing in...' : 'Sign in with Wallet'}
          </Button>

          {signIn.isError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-destructive text-sm">
                Failed to sign in. Please try again.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const AuthenticatedContent = ({ onAction }: { onAction?: () => void }) => {
  const { data, isLoading, isError } = useInfiniteQuery(
    notificationsInfiniteQuery,
  )

  const unread = useQuery(unreadCountQuery)

  // Flatten all notifications from all pages
  const allNotifications = data ?? []

  const displayedNotifications = allNotifications.slice(0, 3)
  const unreadCount = unread.data?.unreadCount ?? 0

  if (isLoading) {
    return (
      <div className="">
        <div className="flex items-center justify-between pl-4">
          <h1 className="font-normal text-2xl">Notifications</h1>
        </div>
        <div className="px-4 py-6 text-center text-muted-foreground text-sm">
          Loading notifications...
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="">
        <div className="flex items-center justify-between pl-4">
          <h1 className="font-normal text-2xl">Notifications</h1>
        </div>
        <div className="px-4 py-6 text-center text-destructive text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-normal text-2xl">Notifications</h1>
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            className="font-normal"
            onClick={() => {
              // TODO: Implement mark all as read
              console.log('Mark all as read')
            }}
          >
            Mark all as read
            <span className="ml-2 text-muted-foreground text-xs">
              {unreadCount}
            </span>
          </Button>
        ) : (
          <div className="flex items-start justify-center space-x-1 text-muted-foreground text-sm">
            <div>What's new at ENS</div>
            <ArrowUpRight className="size-4" />
          </div>
        )}
      </div>

      <div>
        {displayedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-2 pt-5">
            <SmileIcon className="size-10" />
            <div className="text-muted-foreground text-sm">All caught up!</div>
          </div>
        ) : (
          displayedNotifications.map((notification) => (
            <NotificationItem
              key={`${notification.kind}-${notification.timestamp}`}
              notification={notification}
              onAction={onAction}
            />
          ))
        )}
      </div>

      {allNotifications.length > 3 && (
        <div className="border-gray-200 border-t px-4 py-3">
          <LinkButton
            to="/notifications/all"
            variant="ghost"
            className="w-full"
            onClick={onAction}
          >
            View all notifications
          </LinkButton>
        </div>
      )}
    </div>
  )
}
