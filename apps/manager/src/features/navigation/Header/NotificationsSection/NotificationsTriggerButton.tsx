import { useLingui } from '@lingui/react/macro'
import { useSelector as useStoreSelector } from '@xstate/store-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { UnreadDot } from '@/features/navigation/Header/notifications/UnreadBadge'
import { isBackendAuthed } from '@/utils/backend-client'

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
