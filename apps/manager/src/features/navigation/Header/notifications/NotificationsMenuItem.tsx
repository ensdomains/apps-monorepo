import { Trans } from '@lingui/react/macro'
import { linkOptions } from '@tanstack/react-router'
import { MSymbol } from '@/components/ui/material-symbol'
import { AccountMenuItemLink } from '../account/AccountMenuItem'
import { UnreadCountPill } from './UnreadBadge'
import { useUnreadNotificationsCount } from './useUnreadNotificationsCount'

type NotificationsMenuItemProps = {
  readonly onAction: () => void
}

export const NotificationsMenuItem = ({
  onAction,
}: NotificationsMenuItemProps) => {
  const unreadCount = useUnreadNotificationsCount().data ?? 0

  return (
    <AccountMenuItemLink
      link={linkOptions({ to: '/notifications' })}
      onClick={onAction}
      prefix={
        unreadCount > 0 ? (
          <UnreadCountPill count={unreadCount} />
        ) : (
          <MSymbol className="ms-opsz-20" symbol="notifications" />
        )
      }
    >
      <Trans>Notifications</Trans>
    </AccountMenuItemLink>
  )
}
