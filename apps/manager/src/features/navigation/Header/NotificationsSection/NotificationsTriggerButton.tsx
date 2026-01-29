import { Bell } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

export const NotificationsTriggerButton = (
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) => {
  return (
    <button
      {...props}
      className="flex items-center justify-center rounded p-2 text-[#4B4B4B] transition-colors hover:bg-ens-white"
      type="button"
    >
      <Bell className="size-4 md:size-5" />
    </button>
  )
}
