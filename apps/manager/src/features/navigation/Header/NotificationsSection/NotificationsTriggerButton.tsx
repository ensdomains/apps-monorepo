import { useAtom } from '@xstate/store-react'
import { Bell } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { isBackendAuthed } from '@/utils/backend-client'

export const NotificationsTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  const isAuthed = useAtom(isBackendAuthed)

  return (
    <button
      {...props}
      className="flex items-center justify-center rounded p-2 text-[#4B4B4B] transition-colors hover:bg-ens-white disabled:cursor-not-allowed"
      disabled={!isAuthed}
      type="button"
    >
      <Bell className="size-4 md:size-5" />
    </button>
  )
}
