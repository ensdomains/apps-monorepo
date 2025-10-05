import { X } from 'lucide-react'
import { formatRelativeTime } from '@/utils/time'

// Shared UI components used across notification components
export const NotificationWrapper = ({
  children,
}: {
  children: React.ReactNode
}) => (
  <div className="space-y-2 border-gray-200 border-b px-4 py-6">{children}</div>
)

export const NotificationHeader = ({
  children,
  timestamp,
  onRemove,
}: {
  children?: React.ReactNode
  timestamp: number
  onMarkAsRead?: () => void
  onRemove?: () => void
}) => (
  <div className="flex items-center gap-2">
    {children}
    <span className="ml-auto text-gray-500 text-sm">
      {formatRelativeTime(timestamp)}
    </span>

    {onRemove && (
      <button type="button" onClick={onRemove} className="cursor-pointer">
        <X className="size-5 text-gray-500" />
      </button>
    )}
  </div>
)

export const NameDisplay = ({ name }: { name: string }) => (
  <div className="wrap-anywhere w-fit max-w-3/4 rounded-md bg-gray-800 p-1.5 font-mono text-sm text-white leading-ens-none">
    {name}
  </div>
)

export const ActionRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex justify-end">{children}</div>
)
