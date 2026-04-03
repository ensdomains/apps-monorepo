import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from '@xstate/store-react'
import { Bell } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { unreadCountQuery } from '@/features/notifications/data/queries/notifications'
import { isBackendAuthed } from '@/utils/backend-client'

export const NotificationsTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const { t } = useLingui()
  const isAuthed = useAtom(isBackendAuthed)
  const hasUnreadQuery = useQuery({
    ...unreadCountQuery,
    enabled: isAuthed,
    select: (data) => data.unreadCount > 0,
  })

  return (
    <button
      aria-label={t`Notifications`}
      {...props}
      className="relative flex items-center justify-center rounded p-2 text-[#4B4B4B] transition-colors hover:bg-ens-white disabled:cursor-not-allowed"
      disabled={!isAuthed}
      type="button"
    >
      <Bell className="size-4 md:size-5" />
      {hasUnreadQuery.data === true ? (
        <span className="-right-0.5 -top-0.5 absolute size-2 rounded-full bg-[#ff5a3d]" />
      ) : null}
    </button>
  )
}
