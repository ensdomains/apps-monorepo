import { createFileRoute } from '@tanstack/react-router'
import { NotificationsDropdown } from '@/features/notifications/components'
import { MOCK_NOTIFICATIONS } from '@/features/notifications/MOCK'

export const Route = createFileRoute('/notifications/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="m-5 max-w-sm rounded-md border border-gray-400">
      <NotificationsDropdown notifications={MOCK_NOTIFICATIONS} />
    </div>
  )
}
