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
import { NotificationsTitleRow } from '../shared'
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
      <div className="p-2">
        <NotificationsTitleRow title="Notifications" />
      </div>
      <div className="px-4 pt-2 pb-6">
        <div className="space-y-4 text-center">
          <div className="space-y-2">
            <h3 className="font-medium text-lg">Connect your wallet</h3>
            <p className="text-muted-foreground text-sm">
              Sign in to receive notifications about your ENS domains, including
              transfers, expiry reminders, and important updates.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={signIn.isPending || !walletClient}
            onClick={handleSignIn}
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
          {!walletClient && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-destructive text-sm">
                Wallet client missing, please reconnect your wallet and try
                again.
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
      <div>
        <div className="p-2">
          <NotificationsTitleRow title="Notifications" />
        </div>
        <div className="px-4 pt-2 pb-6 text-center text-muted-foreground text-sm">
          Loading notifications...
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <div className="p-2">
          <NotificationsTitleRow title="Notifications" />
        </div>
        <div className="px-4 pt-2 pb-6 text-center text-destructive text-sm">
          Failed to load notifications
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="p-2">
        <NotificationsTitleRow
          rightSlot={
            unreadCount > 0 ? (
              <button
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-gray-50"
                onClick={() => {
                  // TODO: Implement mark all as read
                  console.log('Mark all as read')
                }}
                type="button"
              >
                <span>Mark all as read</span>
                <span className="rounded-md bg-gray-200 px-1.5 py-0.5 text-gray-900 text-xs">
                  {unreadCount}
                </span>
              </button>
            ) : (
              <a
                className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:underline"
                href="https://ens.domains/blog"
                rel="noreferrer"
                target="_blank"
              >
                what's new at ENS <ArrowUpRight className="size-3.5" />
              </a>
            )
          }
          title="Notifications"
        />
      </div>

      <div className="px-2 pt-1 pb-4">
        {displayedNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-6">
            <SmileIcon className="size-10" />
            <div className="text-muted-foreground text-sm">All caught up!</div>
            <LinkButton
              className="mt-1 inline-flex items-center gap-2"
              onClick={onAction}
              to="/notifications/all"
              variant="ghost"
            >
              View all notifications <ArrowRight className="size-4" />
            </LinkButton>
          </div>
        ) : (
          <div className="mt-1 max-h-80 space-y-1 overflow-y-auto pr-1">
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
        <div className="border-gray-100 border-t px-4 pt-3 pb-2">
          <LinkButton
            className="inline-flex w-full items-center justify-center gap-2"
            onClick={onAction}
            to="/notifications/all"
            variant="ghost"
          >
            View all notifications <ArrowRight className="size-4" />
          </LinkButton>
        </div>
      )}
    </div>
  )
}
