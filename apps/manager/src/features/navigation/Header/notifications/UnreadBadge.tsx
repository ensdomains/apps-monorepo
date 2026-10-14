import { tw } from '@/utils/tailwind'
import { useUnreadNotificationsCount } from './useUnreadNotificationsCount'

type UnreadBadgeProps = {
  readonly className?: string
}

const MAX_DISPLAYED_COUNT = 9

type UnreadCountPillProps = UnreadBadgeProps & {
  readonly count: number
}

export const UnreadCountPill = ({ count, className }: UnreadCountPillProps) => (
  <span
    className={tw(
      'flex size-5 items-center justify-center rounded-full bg-ens-signal-danger-100 text-ens-signal-danger-600 text-xs leading-none tracking-ens-wide',
      className,
    )}
  >
    {count > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : count}
  </span>
)

export const UnreadDot = ({ className }: UnreadBadgeProps) => {
  const unreadCountQuery = useUnreadNotificationsCount()

  if (!unreadCountQuery.data || unreadCountQuery.data === 0) return null

  return (
    <div
      className={tw(
        'size-3 rounded-full bg-ens-signal-danger-500 md:size-3.5',
        className,
      )}
    />
  )
}
