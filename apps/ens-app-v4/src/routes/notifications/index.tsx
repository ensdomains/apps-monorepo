import { createFileRoute } from '@tanstack/react-router'
import { NotificationsDropdown } from '@/features/notifications/components'
import { MOCK_NOTIFICATIONS } from '@/features/notifications/MOCK'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="max-w-sm m-5 border border-gray-400 rounded-md">
      <NotificationsDropdown notifications={MOCK_NOTIFICATIONS} />
    </div>
  )
}
