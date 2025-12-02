import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store/react'
import { ArrowRight, ArrowUpRight, SmileIcon } from 'lucide-react'
import { useWalletClient } from 'wagmi'
import { Button, LinkButton } from '@/components/ui/button'
import { isBackendAuthed } from '@/utils/backend-client'
import { signInBackendMutation } from '../../queries/auth'
import {
  notificationsInfiniteQuery,
  unreadCountQuery,
} from '../../queries/notifications'
import { NotificationItem } from './notification-items'

interface NotificationsDropdownProps {
  onAction?: () => void
}

export const NotificationsDropdown = ({
  onAction,
}: NotificationsDropdownProps) => {
  const isAuthed = useAtom(isBackendAuthed)

  if (!isAuthed) {
    return <UnauthenticatedContent />
  }

  return <AuthenticatedContent onAction={onAction} />
}

const UnauthenticatedContent = () => {
  const { data: walletClient } = useWalletClient()
  const signIn = useMutation(signInBackendMutation)

  const handleSignIn = async () => {
    if (!walletClient) {
      throw new Error('No wallet client found')
    }

    try {
      await signIn.mutateAsync({ walletClient })
    } catch (error) {
      console.error('Failed to sign in:', error)
    }
  }

  return (
    <div className="">
      <div className="flex items-center justify-between px-4 py-3">
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

interface AuthenticatedContentProps {
  onAction?: () => void
}

const AuthenticatedContent = ({ onAction }: AuthenticatedContentProps) => {
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
        <div className="flex items-center justify-between px-4 py-3">
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
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-normal text-2xl">Notifications</h1>
        </div>
        <div className="px-4 py-6 text-center text-destructive text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  return (
    <div className="p-2">
      <div className="flex items-center justify-between">
        <h1 className="font-normal text-2xl">Notifications</h1>
        {unreadCount > 0 ? (
          <button
            type="button"
            className="text-sm"
            onClick={() => {
              // TODO: Implement mark all as read
              console.log('Mark all as read')
            }}
          >
            Mark all as read
            <span className="ml-2 rounded-md bg-gray-200 px-1.5 py-0.5 text-gray-900 text-xs">
              {unreadCount}
            </span>
          </button>
        ) : (
          <a
            className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline"
            href="https://ens.domains/blog"
            target="_blank"
            rel="noreferrer"
          >
            what's new at ENS <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>

      <div>
        {displayedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-2 pt-6">
            <SmileIcon className="size-10" />
            <div className="text-muted-foreground text-sm">All caught up!</div>
            <LinkButton
              to="/notifications/all"
              variant="ghost"
              className="mt-1 inline-flex items-center gap-2"
              onClick={onAction}
            >
              View all notifications <ArrowRight className="size-4" />
            </LinkButton>
          </div>
        ) : (
          <div className="mt-1">
            {displayedNotifications.map((notification) => (
              <NotificationItem
                key={`${notification.kind}-${notification.timestamp}`}
                notification={notification}
                onAction={onAction}
              />
            ))}
          </div>
        )}
      </div>

      {allNotifications.length > 3 && (
        <div className="pt-5">
          <LinkButton
            to="/notifications/all"
            variant="ghost"
            className="inline-flex w-full items-center justify-center gap-2"
            onClick={onAction}
          >
            View all notifications <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      )}
    </div>
  )
}
