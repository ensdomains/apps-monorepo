import { useLingui } from '@lingui/react/macro'
import { useSelector as useStoreSelector } from '@xstate/store-react'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { UnreadDot } from '@/features/navigation/Header/notifications/UnreadBadge'
import { isBackendAuthed } from '@/utils/backend-client'

/**
 * Trigger button used by `NotificationsSection` to open the notifications
 * popover (desktop) or drawer (mobile). Renders a bell icon and a small
 * unread-indicator dot. `forwardRef` + `asChild` support is required so the
 * surrounding Radix Popover/Drawer triggers can wire their refs and event
 * handlers through. Disabled when the user is not authenticated with the
 * notifications backend.
 */
export const NotificationsTriggerButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => {
  const { t } = useLingui()
  const isAuthed = useStoreSelector(isBackendAuthed)

  return (
    <button
      aria-label={t`Notifications`}
      ref={ref}
      type="button"
      {...props}
      className="relative flex items-center justify-center rounded p-2 text-ens-quartz-500 transition-colors hover:bg-ens-quartz-50 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!isAuthed || props.disabled}
    >
      <MSymbol className="ms-opsz-20 ms-wght-300" symbol="notifications" />
      <UnreadDot className="-right-0.5 -top-0.5 absolute" />
    </button>
  )
})

NotificationsTriggerButton.displayName = 'NotificationsTriggerButton'
